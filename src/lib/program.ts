// The 4-week program: loading it, approving it, and turning a program day into
// a workout with suggested weights.
//
// The coach (the `program` Edge Function) writes sets, reps and target RPE.
// The weights are calculated here from the user's estimated maxes, so they are
// exact, move with the week's progression, and drop a little after a bad night.

import { FunctionsHttpError } from "@supabase/supabase-js";

import type { CheckIn } from "@/lib/checkIn";
import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { loadLatestBaselines, PlanExercise, Result, weightFor, WorkoutPlan } from "@/lib/training";

export type ProgramExercise = {
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

export type ProgramDay = { dayOfWeek: number; title: string; timing: string; exercises: ProgramExercise[] };

export type ProgramPlan = {
  name: string;
  summary: string;
  weeks: { week: number; focus: string; rpeShift: number }[];
  days: ProgramDay[];
};

export type Program = {
  id: string;
  status: "draft" | "active" | "replaced" | "completed";
  name: string;
  plan: ProgramPlan;
  starts_on: string | null;
};

export type ProgramWorkoutRef = { id: string; week: number; day: number; status: string };

export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// 1 = Monday ... 7 = Sunday.
export const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;

// ---------- Loading and approving ----------

// The program the home screen should show: the active one, else a draft to review.
export async function loadCurrentProgram(): Promise<Program | null> {
  const { data, error } = await supabase
    .from("programs")
    .select("id, status, name, plan, starts_on")
    .in("status", ["active", "draft"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Program[];
  return rows.find((p) => p.status === "active") ?? rows[0] ?? null;
}

export async function loadDraftProgram(): Promise<Program | null> {
  const { data, error } = await supabase
    .from("programs")
    .select("id, status, name, plan, starts_on")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Program | null;
}

export async function loadProgramWorkouts(programId: string): Promise<ProgramWorkoutRef[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, program_week, program_day, status")
    .eq("program_id", programId);
  if (error) throw error;
  return (data ?? []).map((w) => ({ id: w.id, week: w.program_week, day: w.program_day, status: w.status }));
}

// Asks the program Edge Function for a program (or the existing draft).
export async function requestProgram(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ programId: string }>("program", { body: {} });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if (!data?.programId) throw new Error("The coach returned no program");
  return data.programId;
}

// Monday of this week, so program days line up with real weekdays.
function mondayOfThisWeek() {
  const d = new Date();
  d.setDate(d.getDate() - (isoWeekday(d) - 1));
  return localDate(d);
}

// The user approves the draft: it becomes the active program, starting this week.
export async function approveProgram(id: string) {
  const { error: oldError } = await supabase.from("programs").update({ status: "replaced" }).eq("status", "active");
  if (oldError) throw oldError;
  const { error } = await supabase
    .from("programs")
    .update({ status: "active", starts_on: mondayOfThisWeek() })
    .eq("id", id);
  if (error) throw error;
}

// The user wants a different program: drop the draft so a new one gets written.
export async function discardDraft(id: string) {
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
    day.timing,
    adjust.note,
    "Suggested weights come from your estimated maxes; blank boxes mean pick a weight that fits the target.",
  ]
    .filter(Boolean)
    .join(" ");

  const exercises: PlanExercise[] = day.exercises.map((ex) => {
    const instructions = [ex.target, ex.notes].filter(Boolean).join(". ");
    if (ex.kind === "conditioning") {
      return {
        id: ex.id,
        name: ex.name,
        kind: "measure",
        unit: ex.unit || "seconds",
        better: ex.better,
        instructions,
        restSeconds: ex.restSeconds,
        sets: Array.from({ length: ex.sets }, (_, i) => ({
          label: `Round ${i + 1}`,
          target: ex.target,
          isTest: false,
          suggestedWeight: 0,
          targetReps: 0,
        })),
      };
    }
    const rpe = exerciseRpe(ex, plan, week, adjust.rpe);
    const weight = suggestedWeight(ex, rpe, baselines);
    return {
      id: ex.id,
      metric: ex.baselineMetric || ex.id,
      name: ex.name,
      kind: "strength",
      unit: "lb",
      better: "higher",
      instructions,
      restSeconds: ex.restSeconds,
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

// Opens (or creates) the workout for one program day in a given week.
export async function startProgramDay(
  program: Program,
  week: number,
  day: ProgramDay,
  checkIn: CheckIn | null,
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from("workouts")
    .select("id")
    .eq("program_id", program.id)
    .eq("program_week", week)
    .eq("program_day", day.dayOfWeek)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const [{ data: session }, baselines] = await Promise.all([supabase.auth.getSession(), loadLatestBaselines()]);
  if (!session.session) throw new Error("Not signed in");
  const plan = buildSessionPlan(program.plan, day, week, baselines, checkInAdjustment(checkIn));

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
