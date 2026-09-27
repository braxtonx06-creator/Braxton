// Supabase Edge Function: designs the user's testing workout.
//
// Reads the user's journal and training goals (row level security applies),
// asks Claude for a test session in a fixed JSON shape, and saves it in
// `workouts` (kind 'test'). If an unfinished test already exists it is
// returned instead, so opening the screen twice never costs twice.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const FOCUS_LABELS: Record<string, string> = {
  strength: "Strength",
  speed: "Speed & power",
  muscle: "Muscle & look",
  conditioning: "Conditioning",
  sport: "Sport performance",
};

const SYSTEM_PROMPT = `You are the strength and conditioning coach inside Personal O.S. Design a single testing session that gives accurate starting numbers for this athlete's training program.

How to test:
- Strength lifts: warm up in 3-5 ramping sets, then ONE test set of 2 reps at about 90% of their estimated max, stopping with one rep left in the tank (RPE 9). Never test a true 1-rep max; they train alone.
- Test only what matters for their focuses: strength (main barbell lifts they can do safely with their equipment, plus a pulling test such as weighted chin-ups), speed and power (e.g. broad jump, short sprint), conditioning (e.g. a timed run or distance in a set time), sport performance (a short test relevant to their sport).
- Only use equipment they listed. Never program MMA, boxing or grappling; those are coached in person.
- Keep the whole session under 75 minutes, strength tests first while fresh, conditioning last. Usually 4-6 tests total.
- Safety: tell them to use safety pins or spotter arms for bench and squat, and to stop a test if anything hurts. Wellness coaching only; no medical advice.

Numbers:
- Pounds only. Round suggested weights to the nearest 5 lb.
- Base suggested weights on the numbers in their journal. If a lift has no number, leave suggestedWeight 0 and say how to pick a starting weight in the set target.
- For warm-up sets give targetReps; for the test set targetReps is 2.
- For measured tests (jumps, sprints, runs) use kind "measure", one or two attempts as sets, suggestedWeight 0, targetReps 0, and name the unit exactly as they should record it (inches, seconds, miles or meters).

Writing:
- Instructions are short and practical: setup, cues, what counts as a good rep or attempt.
- Metric ids are short snake_case names like bench_press, back_squat, broad_jump.`;

// Claude must reply in exactly this shape (structured output).
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["strength", "measure"] },
          unit: { type: "string" },
          better: { type: "string", enum: ["higher", "lower"] },
          instructions: { type: "string" },
          restSeconds: { type: "integer" },
          sets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                target: { type: "string" },
                isTest: { type: "boolean" },
                suggestedWeight: { type: "number" },
                targetReps: { type: "integer" },
              },
              required: ["label", "target", "isTest", "suggestedWeight", "targetReps"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "name", "kind", "unit", "better", "instructions", "restSeconds", "sets"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "intro", "exercises"],
  additionalProperties: false,
};

type Plan = {
  title: string;
  intro: string;
  exercises: {
    id: string;
    name: string;
    kind: "strength" | "measure";
    unit: string;
    better: "higher" | "lower";
    instructions: string;
    restSeconds: number;
    sets: { label: string; target: string; isTest: boolean; suggestedWeight: number; targetReps: number }[];
  }[];
};

// Structured output guarantees the shape, not sensible values, so check those here.
function cleanPlan(plan: Plan): Plan {
  if (!plan.exercises.length) throw new Error("The plan has no exercises");
  const seen = new Set<string>();
  return {
    ...plan,
    exercises: plan.exercises.map((ex, i) => {
      if (!ex.sets.length) throw new Error(`${ex.name} has no sets`);
      let id = ex.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || `exercise_${i}`;
      while (seen.has(id)) id += "_2";
      seen.add(id);
      return {
        ...ex,
        id,
        restSeconds: Math.min(Math.max(ex.restSeconds, 0), 600),
        sets: ex.sets.map((s) => ({
          ...s,
          suggestedWeight: Math.max(0, Math.round(s.suggestedWeight / 5) * 5),
          targetReps: Math.max(0, s.targetReps),
        })),
      };
    }),
  };
}

const LABELS: Record<string, string> = {
  identity: "Who they are / what they train for",
  goals: "Training goals",
  numbers: "Current numbers",
  equipment: "Equipment",
  injuries: "Injuries",
  events: "Upcoming events",
  weekday: "Normal weekday",
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

  // Reuse an unfinished test instead of writing a new one.
  const { data: existing } = await supabase
    .from("workouts")
    .select("id")
    .eq("kind", "test")
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return json({ workoutId: existing.id, cached: true });

  const [{ data: journal }, { data: goals }] = await Promise.all([
    supabase.from("journals").select("answers, completed_at").maybeSingle(),
    supabase.from("training_goals").select("focuses, primary_focus").maybeSingle(),
  ]);
  if (!journal?.completed_at) return json({ error: "Finish your journal first" }, 400);
  if (!goals) return json({ error: "Pick your training goals first" }, 400);

  const answers = journal.answers as Record<string, string>;
  const journalText = Object.entries(LABELS)
    .filter(([id]) => answers[id]?.trim())
    .map(([id, label]) => `- ${label}: ${answers[id].trim()}`)
    .join("\n");
  const focusText = (goals.focuses as string[])
    .map((f) => `${FOCUS_LABELS[f] ?? f}${f === goals.primary_focus ? " (main goal)" : ""}`)
    .join(", ");

  let plan: Plan;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: PLAN_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Training focuses: ${focusText}\n\nFrom their journal:\n${journalText}\n\nDesign their testing workout.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "The coach couldn't design a test right now" }, 502);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "The test plan came back incomplete, try again" }, 502);
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    plan = cleanPlan(JSON.parse(text) as Plan);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Test plan was not valid JSON");
      return json({ error: "The coach's plan was garbled, try again" }, 502);
    }
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
    if (error instanceof Error) {
      console.error(`Bad test plan: ${error.message}`);
      return json({ error: "The coach's plan didn't make sense, try again" }, 502);
    }
    throw error;
  }

  const { data: saved, error: saveError } = await supabase
    .from("workouts")
    .insert({ user_id: userId, kind: "test", title: plan.title, plan })
    .select("id")
    .single();
  if (saveError) return json({ error: saveError.message }, 500);

  return json({ workoutId: saved.id, cached: false });
});
