// Supabase Edge Function: writes today's coach message (one sentence + why).
//
// The app calls this with the user's login token. The function reads that
// user's journal and today's check-in (row level security still applies),
// asks Claude for the message, and saves it in coach_messages. The saved
// message is reused all day, and rewritten only when the check-in changes.
// The Anthropic API key lives only here, as the ANTHROPIC_API_KEY secret.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You are the coach inside Personal O.S, an app that tells an athlete what to do today and why. You cover training, nutrition, sleep, recovery and body weight.

Write one sentence for the top of their home screen, plus a short "why". The sentence can be:
- a specific nudge for today,
- one sharp question to learn something important you don't know yet, or
- feedback on their progress.

The "why" is one short sentence of knowledge that backs it up: the sports-science reason behind the advice, in plain words. Only state things that are well established; no made-up statistics.

If they did today's morning check-in, react to it: short or poor sleep, or feeling rough, means adjust today (lighter load, fewer sets, more recovery focus); a great night and feeling strong means push. Name what you're reacting to.

Rules:
- Actionable first: what to do, then why. Talk to them directly, like a coach who knows them.
- Realistic but pushing. Tie it to what they told you motivates them.
- Only use facts from their journal, today's check-in and today's date. You do not have heart rate, workout logs or food logs yet, so never invent numbers or imply you've seen data you haven't.
- Never write or change MMA, boxing or grappling class content; those are coached in person. You can mention a class for timing.
- Wellness coaching only: never diagnose injuries or medical conditions.
- If something important is missing (like an upcoming event date), asking one question is often the best sentence.
- Plain text only, no emoji or markdown. Sentence under 35 words; why under 30 words.`;

// Claude must reply in exactly this shape (structured output).
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    sentence: { type: "string" },
    why: { type: "string" },
  },
  required: ["sentence", "why"],
  additionalProperties: false,
};

const QUALITY = ["", "terrible", "poor", "okay", "good", "great"];

// Readable labels for the journal answer ids (they match src/data/onboarding.ts).
const LABELS: Record<string, string> = {
  name: "Name",
  identity: "Who they are / what they train for",
  frustrations: "Frustrations with training and tracking",
  motivation: "What motivates them",
  lifeGoals: "What they want out of life",
  weekday: "Normal weekday",
  weekend: "Normal weekend",
  stressDecisions: "Decisions that stress them out",
  happiest: "When they're happiest",
  goals: "Training goals",
  numbers: "Current numbers",
  equipment: "Equipment",
  injuries: "Injuries",
  events: "Upcoming events",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Read the key per request, so a newly saved secret works right away,
  // and fail clearly if it's missing instead of a confusing SDK error later.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not set for Edge Functions");
    return json({ error: "Coach isn't set up yet: the ANTHROPIC_API_KEY secret is missing in Supabase" }, 500);
  }
  const anthropic = new Anthropic({ apiKey });

  // The user's own login token: every database call below runs as them.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)["default"],
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
  const userId = userData.user.id;

  // The app sends its local date, so "today" matches the user's time zone.
  const { date, weekday } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof weekday !== "string") {
    return json({ error: "Send { date: 'YYYY-MM-DD', weekday }" }, 400);
  }

  const { data: checkIn } = await supabase
    .from("check_ins")
    .select("sleep_hours, sleep_quality, feeling, updated_at")
    .eq("day", date)
    .maybeSingle();

  // Reuse today's message unless a check-in arrived (or changed) since it was written.
  const { data: existing } = await supabase
    .from("coach_messages")
    .select("sentence, why, check_in_updated_at")
    .eq("day", date)
    .maybeSingle();
  const checkInChanged = checkIn && checkIn.updated_at !== existing?.check_in_updated_at;
  if (existing && !checkInChanged) {
    return json({ sentence: existing.sentence, why: existing.why, cached: true });
  }

  const { data: journal, error: journalError } = await supabase
    .from("journals")
    .select("answers, completed_at")
    .maybeSingle();
  if (journalError) return json({ error: journalError.message }, 500);
  if (!journal?.completed_at) return json({ error: "Finish your journal first" }, 400);

  const answers = journal.answers as Record<string, string>;
  const journalText = Object.entries(LABELS)
    .filter(([id]) => answers[id]?.trim())
    .map(([id, label]) => `- ${label}: ${answers[id].trim()}`)
    .join("\n");

  const checkInText = checkIn
    ? `Today's morning check-in: slept ${checkIn.sleep_hours} hours, sleep quality ${checkIn.sleep_quality}/5 (${QUALITY[checkIn.sleep_quality]}), feeling ${checkIn.feeling}/5 (${QUALITY[checkIn.feeling]}).`
    : "They haven't done today's morning check-in yet.";

  let sentence: string;
  let why: string;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today is ${weekday}, ${date}.\n\n${checkInText}\n\nWhat they told you in their onboarding journal:\n${journalText}\n\nWrite today's message.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "The coach couldn't write a message today" }, 502);
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    const parsed = JSON.parse(text) as { sentence: string; why: string };
    sentence = parsed.sentence.trim();
    why = parsed.why.trim();
    if (!sentence) return json({ error: "The coach returned an empty message" }, 502);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Coach reply was not valid JSON");
      return json({ error: "The coach's reply was garbled, try again" }, 502);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic rejected the API key");
      return json({ error: "Coach is misconfigured (API key)" }, 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Coach is busy, try again in a minute" }, 503);
    }
    if (error instanceof Anthropic.APIError && /credit balance/i.test(error.message)) {
      console.error("Anthropic account is out of credit");
      return json({ error: "Your coach is out of Anthropic API credit. Add credit in the Anthropic Console (Plans & Billing)." }, 502);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}: ${error.message}`);
      return json({ error: "Coach is unavailable right now" }, 502);
    }
    console.error(`Unexpected error: ${error instanceof Error ? error.message : error}`);
    return json({ error: "Something went wrong reaching your coach, try again" }, 500);
  }

  // Save it, remembering which check-in (if any) it was written from.
  await supabase.from("coach_messages").upsert(
    { user_id: userId, day: date, sentence, why, check_in_updated_at: checkIn?.updated_at ?? null },
    { onConflict: "user_id,day" },
  );

  return json({ sentence, why, cached: false });
});
