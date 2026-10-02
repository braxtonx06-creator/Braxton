// The 4-week program: requesting, reviewing, revising and swapping, and turning
// a program day into a workout with suggested weights.
//
// The coach (the `program` Edge Function) writes sets, reps, target RPE,
// supersets and the purpose of everything. The weights are calculated here from
// the user's estimated maxes, so they are exact, move with the week's
// progression, and drop a little after a bad night.

import { FunctionsHttpError } from "@supabase/supabase-js";

import type { CheckIn } from "@/lib/checkIn";
import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { loadLatestBaselines, PlanExercise, Result, weightFor, Workout, WorkoutPlan } from "@/lib/training";

export type ProgramExercise = {
  id: string;
  name: string;
  kind: "strength" | "bodyweight" | "power" | "conditioning";
  group?: string; // superset letter, "" = straight sets (older programs don't have it)
  purpose?: string;
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

export type ProgramDay = {
  dayOfWeek: number;
  title: string;
  timing: string;
  purpose?: string;
  exercises: ProgramExercise[];
};

export type ProgramPlan = {
  name: string;
  summary: string;
  rationale?: string[];
  weeks: { week: number; focus: string; rpeShift: number }[];
  days: ProgramDay[];
  changes?: string[]; // revisions: what changed and why
};

export type Program = {
  id: string;
  status: "generating" | "failed" | "draft" | "active" | "replaced" | "completed";
  name: string;
  plan: ProgramPlan;
  starts_on: string | null;
  revision_of: string | null;
  request: string | null;
  error: string | null;
  created_at: string;
};

export type ProgramWorkoutRef = { id: string; week: number; day: number; status: string };

export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKDAYS_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 1 = Monday ... 7 = Sunday.
export const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;

const COLUMNS = "id, status, name, plan, starts_on, revision_of, request, error, created_at";

// The coach's server stops any job after 2.5 minutes, so a program still
// "generating" after 4 minutes was cut off and will never finish.
const STUCK_AFTER_MS = 4 * 60_000;
const unstick = (p: Program): Program =>
  p.status === "generating" && Date.now() - Date.parse(p.created_at) > STUCK_AFTER_MS
    ? { ...p, status: "failed", error: "Your coach got cut off while writing this. Try again." }
    : p;

// ---------- Loading ----------

// The active program, plus the newest program that's being written, waiting
// for review, or failed (a first program or a requested revision).
export async function loadProgramState(): Promise<{ active: Program | null; pending: Program | null }> {
  const { data, error } = await supabase
    .from("programs")
    .select(COLUMNS)
    .in("status", ["active", "draft", "generating", "failed"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = ((data ?? []) as Program[]).map(unstick);
  const active = rows.find((p) => p.status === "active") ?? null;
  const newest = rows.find((p) => p.status !== "active") ?? null;
  // A failed attempt older than the active program is history, not news.
  const pending =
    newest && !(newest.status === "failed" && active && newest.created_at < active.created_at) ? newest : null;
  return { active, pending };
}

export async function loadProgram(id: string): Promise<Program> {
  const { data, error } = await supabase.from("programs").select(COLUMNS).eq("id", id).single();
  if (error) throw error;
  return unstick(data as Program);
}

export async function loadProgramWorkouts(programId: string): Promise<ProgramWorkoutRef[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, program_week, program_day, status")
    .eq("program_id", programId);
  if (error) throw error;
  return (data ?? []).map((w) => ({ id: w.id, week: w.program_week, day: w.program_day, status: w.status }));
}

// ---------- Asking the coach ----------

async function callProgramFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("program", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw error;
  }
  if (!data) throw new Error("The coach returned nothing");
  return data;
}

// Starts writing a program (or returns the one already being written or reviewed).
export async function requestProgram(): Promise<string> {
  return (await callProgramFunction<{ programId: string }>({ mode: "new" })).programId;
}

// Asks the coach to rewrite a program from the user's feedback (becomes a draft to approve).
export async function requestRevision(programId: string, feedback: string): Promise<string> {
  return (await callProgramFunction<{ programId: string }>({ mode: "revise", programId, feedback })).programId;
}

// Programs are written in the background; check every few seconds until done.
export async function waitForProgram(id: string, timeoutMs = 5 * 60_000): Promise<Program> {
  const started = Date.now();
  for (;;) {
    const program = await loadProgram(id);
    if (program.status === "failed") throw new Error(program.error ?? "The coach couldn't write the program");
    if (program.status !== "generating") return program;
    if (Date.now() - started > timeoutMs) throw new Error("This is taking longer than usual. Check back in a minute.");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

// Replaces one exercise with one that serves the same purpose.
export async function swapExercise(programId: string, dayOfWeek: number, exerciseId: string, reason: string) {
  return callProgramFunction<{ exercise: ProgramExercise; replacedId: string; why: string }>({
    mode: "swap",
    programId,
    dayOfWeek,
    exerciseId,
    reason,
  });
}

// ---------- Approving ----------

// Monday of this week, so program days line up with real weekdays.
function mondayOfThisWeek() {
  const d = new Date();
  d.setDate(d.getDate() - (isoWeekday(d) - 1));
  return localDate(d);
}

// A new program becomes active from this week. An approved revision updates
// the program it revises in place, so the block keeps its week count and
// logged workouts.
export async function approveProgram(program: Program) {
  if (program.revision_of) {
    const { error } = await supabase
      .from("programs")
      .update({ plan: program.plan, name: program.plan.name })
      .eq("id", program.revision_of);
    if (error) throw error;
    const { error: doneError } = await supabase.from("programs").update({ status: "replaced" }).eq("id", program.id);
    if (doneError) throw doneError;
    return;
  }
  const { error: oldError } = await supabase.from("programs").update({ status: "replaced" }).eq("status", "active");
  if (oldError) throw oldError;
  const { error } = await supabase
    .from("programs")
    .update({ status: "active", starts_on: mondayOfThisWeek() })
    .eq("id", program.id);
  if (error) throw error;
}

// Drop a draft or a failed attempt.
export async function discardProgram(id: string) {
  const { error } = await supabase.from("programs").update({ status: "replaced" }).eq("id", id);
  if (error) throw error;
}

// Which week of the block today is (1-4), or 5+ once the block is over.
export function programWeek(program: Program, today = localDate()): number {
  if (!program.starts_on) return 1;
  const start = new Date(`${program.starts_on}T12:00:00`);
  const now = new Date(`${today}T12:00:00`);
  const days = Math.round((now.getTime() - start.getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

// ---------- Turning a program day into a workout ----------

// A rough night or feeling beat up takes one RPE off today's lifting.
export function checkInAdjustment(checkIn: CheckIn | null): { rpe: number; note: string } {
  if (!checkIn) return { rpe: 0, note: "" };
  if (checkIn.sleepHours < 6 || checkIn.sleepQuality <= 2 || checkIn.feeling <= 2) {
    return { rpe: -1, note: "Lighter today because of your check-in (1 RPE easier)." };
  }
  return { rpe: 0, note: "" };
}

const fmtRpe = (rpe: number) => (Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1));
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// The target RPE for a strength or bodyweight exercise in a given week.
export function exerciseRpe(ex: ProgramExercise, plan: ProgramPlan, week: number, adjust = 0) {
  const shift = plan.weeks.find((w) => w.week === week)?.rpeShift ?? 0;
  return clamp(Math.round((ex.targetRpe + shift + adjust) * 2) / 2, 5, 10);
}

// Suggested weight for one exercise, or 0 if there's no number to base it on yet.
export function suggestedWeight(ex: ProgramExercise, rpe: number, baselines: Map<string, Result>) {
  if (ex.kind !== "strength") return 0;
  const base = baselines.get(ex.baselineMetric || ex.id);
  return base && /est\. max/.test(base.unit) ? weightFor(base.value, ex.reps, rpe) : 0;
}

// Superset position labels: A1, A2 ... for grouped exercises, "" otherwise.
export function groupLabels(exercises: { group?: string }[]): string[] {
  const counts: Record<string, number> = {};
  return exercises.map((ex) => {
    const g = ex.group?.trim();
    if (!g || exercises.filter((e) => e.group?.trim() === g).length < 2) return "";
    counts[g] = (counts[g] ?? 0) + 1;
    return `${g}${counts[g]}`;
  });
}

// Short prescription used on the program and home screens.
export function describeExercise(ex: ProgramExercise, rpe: number, weight: number) {
  if (ex.kind === "conditioning") return `${ex.sets} × ${ex.target}`;
  if (ex.kind === "power") return `${ex.sets} × ${ex.reps}${ex.target ? ` · ${ex.target}` : ""}`;
  return `${ex.sets} × ${ex.reps} @ RPE ${fmtRpe(rpe)}${weight ? ` · ~${weight} lb` : ""}`;
}

// One-line version for lists: "4 × 8 @ RPE 8", "4 × 3", "3 × 10 minutes easy".
export function shortPrescription(ex: ProgramExercise, rpe: number) {
  if (ex.kind === "conditioning") return `${ex.sets} × ${ex.target.split(/[,;.(]/)[0].trim()}`;
  if (ex.kind === "power") return `${ex.sets} × ${ex.reps}`;
  return `${ex.sets} × ${ex.reps} @ RPE ${fmtRpe(rpe)}`;
}

// "6:00 AM, ~70 min" → "~70 min"
export const sessionLength = (timing: string) => timing.match(/~?\d+\s*min/)?.[0] ?? "";

export function buildSessionPlan(
  plan: ProgramPlan,
  day: ProgramDay,
  week: number,
  baselines: Map<string, Result>,
  adjust: { rpe: number; note: string },
): WorkoutPlan {
  const weekInfo = plan.weeks.find((w) => w.week === week);
  const intro = [
    `Week ${week}${weekInfo?.focus ? `: ${weekInfo.focus}` : ""}.`,
    day.purpose,
    day.timing,
    adjust.note,
    "Suggested weights come from your estimated maxes; blank boxes mean pick a weight that fits the target.",
  ]
    .filter(Boolean)
    .join(" ");

  const exercises: PlanExercise[] = day.exercises.map((ex) => {
    const instructions = [ex.target, ex.notes].filter(Boolean).join(". ");
    const shared = {
      id: ex.id,
      name: ex.name,
      group: ex.group,
      purpose: ex.purpose,
      instructions,
      restSeconds: ex.restSeconds,
    };

    // Jumps, throws, sprints and conditioning: record a result per set or round.
    if (ex.kind === "conditioning" || ex.kind === "power") {
      const power = ex.kind === "power";
      return {
        ...shared,
        metric: ex.baselineMetric || ex.id,
        kind: "measure",
        unit: ex.unit || "seconds",
        better: ex.better,
        sets: Array.from({ length: ex.sets }, (_, i) => ({
          label: power ? `Set ${i + 1}` : `Round ${i + 1}`,
          target: power ? `${ex.reps} reps · record your best` : ex.target,
          isTest: false,
          suggestedWeight: 0,
          targetReps: 0,
        })),
      };
    }

    const rpe = exerciseRpe(ex, plan, week, adjust.rpe);
    const weight = suggestedWeight(ex, rpe, baselines);
    return {
      ...shared,
      metric: ex.baselineMetric || ex.id,
      kind: "strength",
      unit: "lb",
      better: "higher",
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        label: `Set ${i + 1}`,
        target: `${ex.reps} reps · RPE ${fmtRpe(rpe)}${ex.kind === "bodyweight" ? " · add weight if needed" : ""}`,
        isTest: false,
        suggestedWeight: weight,
        targetReps: ex.reps,
        targetRpe: rpe,
      })),
    };
  });

  return { title: day.title, intro, exercises };
}

// Opens the workout for one program day in a given week. A workout that
// hasn't been started yet is rebuilt, so it reflects swaps, revisions and
// this morning's check-in.
export async function startProgramDay(
  program: Program,
  week: number,
  day: ProgramDay,
  checkIn: CheckIn | null,
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from("workouts")
    .select("id, status")
    .eq("program_id", program.id)
    .eq("program_week", week)
    .eq("program_day", day.dayOfWeek)
    .maybeSingle();
  if (findError) throw findError;
  if (existing && existing.status !== "planned") return existing.id;

  const [{ data: session }, baselines] = await Promise.all([supabase.auth.getSession(), loadLatestBaselines()]);
  if (!session.session) throw new Error("Not signed in");
  const plan = buildSessionPlan(program.plan, day, week, baselines, checkInAdjustment(checkIn));

  if (existing) {
    const { error } = await supabase.from("workouts").update({ title: plan.title, plan }).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("workouts")
    .insert({
      user_id: session.session.user.id,
      kind: "program",
      title: plan.title,
      plan,
      program_id: program.id,
      program_week: week,
      program_day: day.dayOfWeek,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// After a swap during a workout: rebuild the plan from the program but keep
// everything already logged (logs are keyed by exercise id, which don't change
// for the exercises that stayed).
export async function refreshWorkoutFromProgram(workout: Workout, checkIn: CheckIn | null): Promise<void> {
  if (!workout.program_id || !workout.program_week || !workout.program_day) return;
  const [program, baselines] = await Promise.all([loadProgram(workout.program_id), loadLatestBaselines()]);
  const day = program.plan.days.find((d) => d.dayOfWeek === workout.program_day);
  if (!day) return;
  const plan = buildSessionPlan(program.plan, day, workout.program_week, baselines, checkInAdjustment(checkIn));
  const { error } = await supabase.from("workouts").update({ plan }).eq("id", workout.id);
  if (error) throw error;
}
