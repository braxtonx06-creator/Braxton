// Supabase Edge Function: writes, revises and edits the user's 4-week program.
//
// Claude designs the structure (training days on the user's real schedule,
// exercises with a purpose each, supersets, sets, reps, target RPE and a weekly
// RPE progression). It never writes weights: the app turns reps + RPE into a
// weight from the user's estimated maxes.
//
// Modes (JSON body):
// - { mode: "new" }                              write a program
// - { mode: "revise", programId, feedback }      rewrite a program from the user's feedback
// - { mode: "swap", programId, dayOfWeek, exerciseId, reason }  replace one exercise
//
// "new" and "revise" take about a minute, longer than a phone keeps a request
// open, so they save a 'generating' row, reply at once, and finish in the
// background (EdgeRuntime.waitUntil). The app polls the row until it's a
// 'draft' (or 'failed'). "swap" is small and answers directly.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";

// Supabase's runtime global for background work (typed here for the checker).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const FOCUS_LABELS: Record<string, string> = {
  strength: "Strength",
  speed: "Speed & power",
  muscle: "Muscle & look",
  conditioning: "Conditioning",
  sport: "Sport performance",
};
const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const COACHING_RULES = `You are an elite strength and conditioning coach inside Personal O.S. You write programs the way a professional S&C coach would: every day and every exercise has a clear purpose, and the block as a whole follows sound training science.

Schedule (follow exactly; never guess):
- Only put training days on the lifting days you are given. dayOfWeek is 1 = Monday ... 7 = Sunday.
- Only mention MMA, boxing or grappling classes on the class days you are given, at the class time given. Never invent classes or times, and never assume "early morning" unless told.
- Never program MMA, boxing or grappling themselves; those are coached in person.
- On a lifting day that is also a class day, keep lower-body fatigue and total volume moderate and avoid grinding sets; put the heaviest lower-body and hardest conditioning on lifting days with no class that day or the next.
- Keep each session within the session length given (including warm-up sets), and write a timing line such as "4:00 PM, ~70 min" from their normal weekday.

Equipment: use only equipment they explicitly listed. If a variation needs anything not listed (safety squat bar, cable, machine, leg press...), don't use it.

Program design (make it professional):
- Periodization: weeks 1-3 build via rpeShift (e.g. -1, 0, +0.5) and week 4 deloads (e.g. -2). Each week gets a one-line focus.
- Order within a day: power/speed first while fresh, then main strength lifts, then accessories/hypertrophy, then conditioning.
- Supersets and circuits: pair exercises that don't compete (antagonist push/pull, upper/lower, or a main lift with a mobility/core filler) to raise density without hurting quality. Give paired exercises the same group letter ("A", "B", ...); leave group "" for straight sets. Inside a group, give every exercise except the last a short restSeconds (0-45, the transition) and the last one the full rest for the round. Never superset two heavy compound lifts, and never put a max-effort or power lift in a circuit.
- Volume and intensity: main lifts at 3-6 reps around RPE 7-9; hypertrophy work 6-15 reps around RPE 7-9; roughly 10-20 hard sets per major muscle group per week across the program.
- Conditioning matched to their sport: alactic power (short all-out efforts with long rest), glycolytic intervals (work capacity, like rounds), and aerobic base (easy steady work that speeds recovery). Say which system each piece trains in its purpose.
- Manage the interference between lifting, conditioning and their sport: fatigue should never land right before hard sessions.

Exercise kinds:
- "strength": loaded lifts. sets, reps, targetRpe (6-9.5). Never write weights. If a lift matches one of their tested numbers, set baselineMetric to that exact metric id; otherwise "".
- "bodyweight": reps-based work without load (optional added weight). sets, reps, targetRpe.
- "power": jumps, throws, sprints. sets, reps per set, targetRpe 0, unit = what they record per set (inches, meters, seconds), better = higher for distance/height, lower for times. baselineMetric may name a tested power metric.
- "conditioning": intervals, runs, sled or rope work. sets = rounds, reps = 0, targetRpe = 0, target = exactly what to do each round, unit = what they record per round, better accordingly.

Explain the science, briefly and honestly:
- rationale: 3-5 short lines on the principles this block uses (for example progressive overload through RPE, specificity to their sport, fatigue management around class, the week-4 deload). Only well-established ideas; no made-up statistics or citations.
- Each day's purpose: one sentence on what the day develops and why it sits on that weekday.
- Each exercise's purpose: one short sentence on why it's there (the quality it trains and how it carries over to their goals or sport).
- target: a short prescription line; notes: brief technique cues.

Keep ids short snake_case, unique within a day. Wellness coaching only; never give medical advice. Realistic but pushing.`;

// ---------- Output shapes (structured output) ----------

const EXERCISE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: { type: "string", enum: ["strength", "bodyweight", "power", "conditioning"] },
    group: { type: "string" },
    purpose: { type: "string" },
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
    "id", "name", "kind", "group", "purpose", "baselineMetric", "sets", "reps",
    "targetRpe", "restSeconds", "target", "unit", "better", "notes",
  ],
  additionalProperties: false,
};

const PROGRAM_PROPERTIES = {
  name: { type: "string" },
  summary: { type: "string" },
  rationale: { type: "array", items: { type: "string" } },
  weeks: {
    type: "array",
    items: {
      type: "object",
      properties: { week: { type: "integer" }, focus: { type: "string" }, rpeShift: { type: "number" } },
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
        purpose: { type: "string" },
        exercises: { type: "array", items: EXERCISE_SCHEMA },
      },
      required: ["dayOfWeek", "title", "timing", "purpose", "exercises"],
      additionalProperties: false,
    },
  },
};

const PROGRAM_SCHEMA = {
  type: "object",
  properties: PROGRAM_PROPERTIES,
  required: ["name", "summary", "rationale", "weeks", "days"],
  additionalProperties: false,
};

const REVISION_SCHEMA = {
  type: "object",
  properties: { ...PROGRAM_PROPERTIES, changes: { type: "array", items: { type: "string" } } },
  required: ["name", "summary", "rationale", "weeks", "days", "changes"],
  additionalProperties: false,
};

const SWAP_SCHEMA = {
  type: "object",
  properties: { exercise: EXERCISE_SCHEMA, why: { type: "string" } },
  required: ["exercise", "why"],
  additionalProperties: false,
};

type ProgramExercise = {
  id: string;
  name: string;
  kind: "strength" | "bodyweight" | "power" | "conditioning";
  group: string;
  purpose: string;
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
type ProgramDay = { dayOfWeek: number; title: string; timing: string; purpose: string; exercises: ProgramExercise[] };
type Program = {
  name: string;
  summary: string;
  rationale: string[];
  weeks: { week: number; focus: string; rpeShift: number }[];
  days: ProgramDay[];
  changes?: string[];
};

class ProgramError extends Error {}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// ---------- Sanity checks (structured output guarantees shape, not sense) ----------

function cleanExercise(ex: ProgramExercise, id: string, metrics: Set<string>): ProgramExercise {
  const loaded = ex.kind === "strength" || ex.kind === "bodyweight";
  const measured = ex.kind === "conditioning" || ex.kind === "power";
  return {
    ...ex,
    id,
    group: ex.group.trim().toUpperCase().slice(0, 2),
    baselineMetric: metrics.has(ex.baselineMetric) ? ex.baselineMetric : "",
    sets: clamp(Math.round(ex.sets), 1, 12),
    reps: ex.kind === "conditioning" ? 0 : clamp(Math.round(ex.reps), 1, 30),
    targetRpe: loaded ? clamp(ex.targetRpe, 5, 10) : 0,
    restSeconds: clamp(Math.round(ex.restSeconds), 0, 600),
    unit: measured ? ex.unit || "seconds" : "lb",
  };
}

function uniqueId(raw: string, seen: Set<string>, fallback: string) {
  let id = raw.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || fallback;
  while (seen.has(id)) id += "_2";
  seen.add(id);
  return id;
}

function cleanProgram(p: Program, metrics: Set<string>, liftDays: number[]): Program {
  const allowed = new Set(liftDays.length ? liftDays : [1, 2, 3, 4, 5, 6, 7]);
  const days = [...p.days]
    .filter((d) => allowed.has(d.dayOfWeek) && d.exercises.length)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .filter((d, i, all) => i === 0 || d.dayOfWeek !== all[i - 1].dayOfWeek);
  if (!days.length) throw new ProgramError("The program has no training days on the allowed days");

  // Always exactly 4 weeks; a missing week gets a neutral build week (or a deload for week 4).
  const weeks = [1, 2, 3, 4].map((n) => {
    const w = p.weeks.find((x) => x.week === n);
    const fallback = n === 4 ? { focus: "Deload", rpeShift: -2 } : { focus: "", rpeShift: 0 };
    return { week: n, focus: w?.focus ?? fallback.focus, rpeShift: clamp(w?.rpeShift ?? fallback.rpeShift, -3, 1) };
  });

  return {
    name: p.name,
    summary: p.summary,
    rationale: p.rationale.slice(0, 6),
    weeks,
    days: days.map((d) => {
      const seen = new Set<string>();
      return {
        ...d,
        exercises: d.exercises.map((ex, i) => cleanExercise(ex, uniqueId(ex.id, seen, `exercise_${i}`), metrics)),
      };
    }),
    ...(p.changes ? { changes: p.changes.slice(0, 10) } : {}),
  };
}

// ---------- Context for the prompt ----------

const LABELS: Record<string, string> = {
  identity: "Who they are / what they train for",
  goals: "Training goals",
  numbers: "Current numbers",
  equipment: "Equipment (use only this)",
  injuries: "Injuries",
  events: "Upcoming events",
  weekday: "Normal weekday",
  weekend: "Normal weekend",
  motivation: "What motivates them",
};

type Context = { text: string; metrics: Set<string>; liftDays: number[] };

async function loadContext(supabase: SupabaseClient): Promise<Context | string> {
  const [{ data: journal }, { data: goals }, { data: baselineRows }] = await Promise.all([
    supabase.from("journals").select("answers, completed_at").maybeSingle(),
    supabase
      .from("training_goals")
      .select("focuses, primary_focus, lift_days, class_days, class_time, session_minutes")
      .maybeSingle(),
    supabase
      .from("baselines")
      .select("metric, name, value, unit")
      .order("measured_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!journal?.completed_at) return "Finish your journal first";
  if (!goals) return "Pick your training goals first";
  if (!goals.lift_days?.length) return "Set your training days in Goals first";

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
  const dayNames = (days: number[]) => (days.length ? days.map((d) => WEEKDAYS[d]).join(", ") : "none");
  const baselineText = baselines.size
    ? [...baselines.entries()].map(([metric, b]) => `- ${metric} (${b.name}): ${b.value} ${b.unit}`).join("\n")
    : "- none yet";

  const text = [
    `Training focuses: ${focusText}`,
    `Schedule:\n- Lifting days: ${dayNames(goals.lift_days)}\n- MMA/combat class days: ${dayNames(goals.class_days)}${goals.class_time ? ` (${goals.class_time})` : ""}\n- Session length: up to ${goals.session_minutes} minutes`,
    `Tested numbers (metric id, name, value):\n${baselineText}`,
    `From their journal:\n${journalText}`,
  ].join("\n\n");

  return { text, metrics: new Set(baselines.keys()), liftDays: goals.lift_days };
}

// ---------- Claude ----------

async function askClaude(anthropic: Anthropic, schema: Record<string, unknown>, prompt: string) {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 20000,
    // If a safety classifier declines, retry server-side on Anthropic's recommended model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system: COACHING_RULES,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new ProgramError("The coach couldn't write this right now");
  if (response.stop_reason === "max_tokens") throw new ProgramError("The program came back incomplete, try again");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text);
}

function friendlyError(error: unknown): { message: string; status: number } {
  if (error instanceof SyntaxError) return { message: "The coach's reply was garbled, try again", status: 502 };
  if (error instanceof Anthropic.AuthenticationError) return { message: "Coach is misconfigured (API key)", status: 500 };
  if (error instanceof Anthropic.RateLimitError) return { message: "Coach is busy, try again in a minute", status: 503 };
  if (error instanceof Anthropic.APIError) return { message: "Coach is unavailable right now", status: 502 };
  if (error instanceof ProgramError) return { message: error.message, status: 502 };
  return { message: "Something went wrong, try again", status: 500 };
}

// Writes the program in the background and stores the outcome on the row.
async function generateInto(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  rowId: string,
  ctx: Context,
  prompt: string,
  schema: Record<string, unknown>,
) {
  try {
    const program = cleanProgram((await askClaude(anthropic, schema, prompt)) as Program, ctx.metrics, ctx.liftDays);
    const { error } = await supabase
      .from("programs")
      .update({ status: "draft", name: program.name, plan: program })
      .eq("id", rowId);
    if (error) throw error;
  } catch (error) {
    const { message } = friendlyError(error);
    console.error(`Program generation failed: ${error instanceof Error ? error.message : error}`);
    await supabase.from("programs").update({ status: "failed", error: message }).eq("id", rowId);
  }
}

// ---------- HTTP ----------

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
  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode ?? "new";

  const ctx = await loadContext(supabase);
  if (typeof ctx === "string") return json({ error: ctx }, 400);

  // ----- new: write a program (reusing one that's already being written or waiting for review) -----
  if (mode === "new") {
    const { data: pending } = await supabase
      .from("programs")
      .select("id, status, created_at")
      .in("status", ["generating", "draft"])
      .is("revision_of", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending) {
      // A draft waits for review; a program still "generating" after 10 minutes is stuck.
      const stuck = pending.status === "generating" && Date.now() - Date.parse(pending.created_at) > 10 * 60_000;
      if (!stuck) return json({ programId: pending.id, cached: true });
      await supabase.from("programs").update({ status: "failed", error: "Timed out" }).eq("id", pending.id);
    }

    const { data: row, error } = await supabase
      .from("programs")
      .insert({ user_id: userId, status: "generating", name: "Writing your program…", plan: {} })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);

    EdgeRuntime.waitUntil(
      generateInto(supabase, anthropic, row.id, ctx, `${ctx.text}\n\nWrite their 4-week program.`, PROGRAM_SCHEMA),
    );
    return json({ programId: row.id, cached: false });
  }

  // Both edits start from a program the user owns (RLS makes sure of that).
  const { data: base } = await supabase
    .from("programs")
    .select("id, plan, status")
    .eq("id", body.programId ?? "")
    .maybeSingle();
  if (!base || !["draft", "active"].includes(base.status)) return json({ error: "Program not found" }, 404);
  const plan = base.plan as Program;

  // ----- revise: rewrite from the user's feedback, as a draft to approve -----
  if (mode === "revise") {
    const feedback = String(body.feedback ?? "").trim().slice(0, 2000);
    if (!feedback) return json({ error: "Tell the coach what you'd like changed" }, 400);

    // Only one pending revision at a time.
    await supabase.from("programs").update({ status: "replaced" }).eq("revision_of", base.id).in("status", ["generating", "draft", "failed"]);
    const { data: row, error } = await supabase
      .from("programs")
      .insert({
        user_id: userId,
        status: "generating",
        name: "Revising your program…",
        plan: {},
        revision_of: base.id,
        request: feedback,
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);

    const prompt = `${ctx.text}\n\nTheir current program (JSON):\n${JSON.stringify({ ...plan, changes: undefined })}\n\nTheir feedback:\n"""${feedback}"""\n\nRevise the program to address the feedback while keeping what already works and keeping the science sound. If a request would be unsafe or conflicts with their goals, adapt it sensibly and say so. In "changes", list each change you made and why, in plain words.`;
    EdgeRuntime.waitUntil(generateInto(supabase, anthropic, row.id, ctx, prompt, REVISION_SCHEMA));
    return json({ programId: row.id, cached: false });
  }

  // ----- swap: replace one exercise with one that serves the same purpose -----
  if (mode === "swap") {
    const day = plan.days.find((d) => d.dayOfWeek === Number(body.dayOfWeek));
    const index = day?.exercises.findIndex((e) => e.id === body.exerciseId) ?? -1;
    if (!day || index < 0) return json({ error: "Exercise not found" }, 404);
    const reason = String(body.reason ?? "").trim().slice(0, 500) || "No reason given";
    const current = day.exercises[index];

    try {
      const prompt = `${ctx.text}\n\nThe ${WEEKDAYS[day.dayOfWeek]} session "${day.title}" (purpose: ${day.purpose}) currently has:\n${JSON.stringify(day.exercises)}\n\nReplace this exercise:\n${JSON.stringify(current)}\n\nWhy they want it swapped: """${reason}"""\n\nPick one replacement that serves the same purpose in the session, respects their reason and equipment, and keeps the same superset group letter ("${current.group}"). Put a one-sentence explanation of the choice in "why".`;
      const result = (await askClaude(anthropic, SWAP_SCHEMA, prompt)) as { exercise: ProgramExercise; why: string };
      const seen = new Set(day.exercises.filter((_, i) => i !== index).map((e) => e.id));
      const replacement = cleanExercise(
        { ...result.exercise, group: current.group },
        uniqueId(result.exercise.id, seen, `${current.id}_swap`),
        ctx.metrics,
      );
      const days = plan.days.map((d) =>
        d.dayOfWeek === day.dayOfWeek
          ? { ...d, exercises: d.exercises.map((e, i) => (i === index ? replacement : e)) }
          : d,
      );
      const { error } = await supabase.from("programs").update({ plan: { ...plan, days } }).eq("id", base.id);
      if (error) return json({ error: error.message }, 500);
      return json({ exercise: replacement, replacedId: current.id, why: result.why });
    } catch (error) {
      const { message, status } = friendlyError(error);
      console.error(`Swap failed: ${error instanceof Error ? error.message : error}`);
      return json({ error: message }, status);
    }
  }

  return json({ error: `Unknown mode ${mode}` }, 400);
});
