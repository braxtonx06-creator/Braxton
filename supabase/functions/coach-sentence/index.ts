// Supabase Edge Function: writes today's one-sentence coach message.
//
// The app calls this with the user's login token. The function reads that
// user's journal (row level security still applies), asks Claude for one
// sentence, and saves it in coach_messages so the same day never costs twice.
// The Anthropic API key lives only here, as the ANTHROPIC_API_KEY secret.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `You are the coach inside Personal O.S, an app that tells an athlete what to do today and why. You cover training, nutrition, sleep, recovery and body weight.

Write exactly one sentence for the top of their home screen. It can be:
- a specific nudge for today,
- one sharp question to learn something important you don't know yet, or
- feedback on their progress.

Rules:
- Actionable first: what to do, then why. Talk to them directly, like a coach who knows them.
- Realistic but pushing. Tie it to what they told you motivates them.
- Only use facts from their journal and today's date. You do not have sleep, heart rate, workout logs or food logs yet, so never invent numbers or imply you've seen data you haven't.
- Never write or change MMA, boxing or grappling class content; those are coached in person. You can mention a class for timing.
- Wellness coaching only: never diagnose injuries or medical conditions.
- If something important is missing (like an upcoming event date), asking one question is often the best sentence.
- Plain text only: one sentence, under 35 words, no quotes, emoji or markdown.`;

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

  const { data: existing } = await supabase
    .from("coach_messages")
    .select("sentence")
    .eq("day", date)
    .maybeSingle();
  if (existing) return json({ sentence: existing.sentence, cached: true });

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

  let sentence: string;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today is ${weekday}, ${date}.\n\nWhat they told you in their onboarding journal:\n${journalText}\n\nWrite today's sentence.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "The coach couldn't write a message today" }, 502);
    }
    sentence = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join(" ")
      .trim();
    if (!sentence) return json({ error: "The coach returned an empty message" }, 502);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic rejected the API key");
      return json({ error: "Coach is misconfigured (API key)" }, 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Coach is busy, try again in a minute" }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}: ${error.message}`);
      return json({ error: "Coach is unavailable right now" }, 502);
    }
    throw error;
  }

  // Save it; if two requests raced, keep whichever landed first.
  await supabase
    .from("coach_messages")
    .upsert({ user_id: userId, day: date, sentence }, { onConflict: "user_id,day", ignoreDuplicates: true });

  return json({ sentence, cached: false });
});
