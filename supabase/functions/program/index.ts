// Supabase Edge Function: writes the user's 4-week training program.
//
// Claude designs the structure (training days, exercises, sets, reps, target
// RPE and a weekly RPE progression). It never writes weights: the app turns
// target reps + RPE into a weight from the user's tested estimated max, so the
// numbers stay exact and adjust to each morning's check-in.
// The program is saved as a draft; the user approves it before it starts.
// An existing draft is returned instead of writing a new one.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

const FOCUS_LABELS: Record<string, string> = {
  strength: "Strength",
  speed: "Speed & power",
  muscle: "Muscle & look",
  conditioning: "Conditioning",
  sport: "Sport performance",
};

const SYSTEM_PROMPT = `You are the strength and conditioning coach inside Personal O.S. Write a 4-week training block for this athlete.

Structure:
- One week of training days that repeats for 4 weeks. Use the number of lifting days per week they told you, placed on the weekdays that fit their schedule. dayOfWeek is 1 = Monday ... 7 = Sunday.
- Weekly progression through rpeShift, which is added to every strength exercise's targetRpe that week: weeks 1-3 build (for example -1, 0, +0.5) and week 4 is a deload (for example -2). Give each week a short focus line.
- Prioritize their main goal and still cover their other focuses. Put the most demanding lower-body and conditioning work away from days before their hardest MMA or sport sessions when you can tell.
- Each session should fit their training window (usually 60-90 minutes). Main lifts first, accessories after, conditioning last.
- Never program MMA, boxing or grappling; those are coached in person. You can mention a class in a day's timing line.
- Only use equipment they listed.

Exercises:
- kind "strength": loaded lifts. Give sets, reps and targetRpe (6-9.5). Never write weights. If the lift matches one of their tested numbers, set baselineMetric to that exact metric id so the app can calculate the weight; otherwise leave baselineMetric empty and the app will learn it after they log it.
- kind "bodyweight": reps-based work without a tested number (e.g. push-ups, hanging leg raises). Give sets, reps, targetRpe.
- kind "conditioning": intervals, runs, sled or rope work. sets = rounds, reps = 0, targetRpe = 0, target = exactly what to do each round, unit = what they record per round (seconds, meters, rounds), better = lower for times, higher for distance.
- target is a short prescription line shown on each set (e.g. "5 reps, 1-2 in the tank"). notes are brief coaching cues.
- ids are short snake_case, unique within a day.

Keep it realistic but pushing, grounded in sports science. Wellness coaching only. The summary is 2-3 sentences: what the block does and why, in plain words.`;

const PROGRAM_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    weeks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          week: { type: "integer" },
          focus: { type: "string" },
          rpeShift: { type: "number" },
        },
        required: ["week", "focus", "rpeShift"],
        additionalProperties: false,
      },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayOfWeek: { type: "integer" },
          title: { type: "string" },
          timing: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                kind: { type: "string", enum: ["strength", "bodyweight", "conditioning"] },
                baselineMetric: { type: "string" },
                sets: { type: "integer" },
                reps: { type: "integer" },
                targetRpe: { type: "number" },
                restSeconds: { type: "integer" },
                target: { type: "string" },
                unit: { type: "string" },
                better: { type: "string", enum: ["higher", "lower"] },
                notes: { type: "string" },
              },
              required: [
                "id", "name", "kind", "baselineMetric", "sets", "reps", "targetRpe",
                "restSeconds", "target", "unit", "better", "notes",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["dayOfWeek", "title", "timing", "exercises"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "summary", "weeks", "days"],
  additionalProperties: false,
};

type ProgramExercise = {
  id: string;
  name: string;
  kind: "strength" | "bodyweight" | "conditioning";
  baselineMetric: string;
  sets: number;
  reps: number;
  targetRpe: number;
  restSeconds: number;
  target: string;
  unit: string;
  better: "higher" | "lower";
  notes: string;
};
type Program = {
  name: string;
  summary: string;
  weeks: { week: number; focus: string; rpeShift: number }[];
  days: { dayOfWeek: number; title: string; timing: string; exercises: ProgramExercise[] }[];
};

class ProgramError extends Error {}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Structured output guarantees the shape, not sensible values, so check those here.
function cleanProgram(p: Program, metrics: Set<string>): Program {
  const days = [...p.days]
    .filter((d) => d.dayOfWeek >= 1 && d.dayOfWeek <= 7 && d.exercises.length)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .filter((d, i, all) => i === 0 || d.dayOfWeek !== all[i - 1].dayOfWeek);
  if (!days.length) throw new ProgramError("The program has no training days");

  // Always exactly 4 weeks; a missing week gets a neutral build week (or a deload for week 4).
  const weeks = [1, 2, 3, 4].map((n) => {
    const w = p.weeks.find((x) => x.week === n);
    const fallback = n === 4 ? { focus: "Deload", rpeShift: -2 } : { focus: "", rpeShift: 0 };
    return { week: n, focus: w?.focus ?? fallback.focus, rpeShift: clamp(w?.rpeShift ?? fallback.rpeShift, -3, 1) };
  });

  return {
    name: p.name,
    summary: p.summary,
    weeks,
    days: days.map((d) => {
      const seen = new Set<string>();
      return {
        ...d,
        exercises: d.exercises.map((ex, i) => {
          let id = ex.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || `exercise_${i}`;
          while (seen.has(id)) id += "_2";
          seen.add(id);
          const conditioning = ex.kind === "conditioning";
          return {
            ...ex,
            id,
            baselineMetric: metrics.has(ex.baselineMetric) ? ex.baselineMetric : "",
            sets: clamp(Math.round(ex.sets), 1, 10),
            reps: conditioning ? 0 : clamp(Math.round(ex.reps), 1, 30),
            targetRpe: conditioning ? 0 : clamp(ex.targetRpe, 5, 10),
            restSeconds: clamp(Math.round(ex.restSeconds), 0, 600),
          };
        }),
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
  weekend: "Normal weekend",
  motivation: "What motivates them",
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

  // Reuse a draft instead of writing a new one.
  const { data: draft } = await supabase
    .from("programs")
    .select("id")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draft) return json({ programId: draft.id, cached: true });

  const [{ data: journal }, { data: goals }, { data: baselineRows }] = await Promise.all([
    supabase.from("journals").select("answers, completed_at").maybeSingle(),
    supabase.from("training_goals").select("focuses, primary_focus").maybeSingle(),
    supabase.from("baselines").select("metric, name, value, unit").order("measured_on", { ascending: false }),
  ]);
  if (!journal?.completed_at) return json({ error: "Finish your journal first" }, 400);
  if (!goals) return json({ error: "Pick your training goals first" }, 400);

  // Latest value per tested metric.
  const baselines = new Map<string, { name: string; value: number; unit: string }>();
  for (const b of baselineRows ?? []) {
    if (!baselines.has(b.metric)) baselines.set(b.metric, { name: b.name, value: Number(b.value), unit: b.unit });
  }

  const answers = journal.answers as Record<string, string>;
  const journalText = Object.entries(LABELS)
    .filter(([id]) => answers[id]?.trim())
    .map(([id, label]) => `- ${label}: ${answers[id].trim()}`)
    .join("\n");
  const focusText = (goals.focuses as string[])
    .map((f) => `${FOCUS_LABELS[f] ?? f}${f === goals.primary_focus ? " (main goal)" : ""}`)
    .join(", ");
  const baselineText = baselines.size
    ? [...baselines.entries()].map(([metric, b]) => `- ${metric} (${b.name}): ${b.value} ${b.unit}`).join("\n")
    : "- none yet";

  let program: Program;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: PROGRAM_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Training focuses: ${focusText}\n\nTested numbers (metric id, name, value):\n${baselineText}\n\nFrom their journal:\n${journalText}\n\nWrite their 4-week program.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "The coach couldn't write a program right now" }, 502);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "The program came back incomplete, try again" }, 502);
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    program = cleanProgram(JSON.parse(text) as Program, new Set(baselines.keys()));
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Program was not valid JSON");
      return json({ error: "The coach's program was garbled, try again" }, 502);
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
    if (error instanceof ProgramError) {
      console.error(`Bad program: ${error.message}`);
      return json({ error: "The coach's program didn't make sense, try again" }, 502);
    }
    console.error(`Unexpected error: ${error instanceof Error ? error.message : error}`);
    return json({ error: "Something went wrong writing your program, try again" }, 500);
  }

  const { data: saved, error: saveError } = await supabase
    .from("programs")
    .insert({ user_id: userId, name: program.name, plan: program })
    .select("id")
    .single();
  if (saveError) return json({ error: saveError.message }, 500);

  return json({ programId: saved.id, cached: false });
});
