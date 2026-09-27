// Training data: goals, workouts (plan + log) and tested numbers (baselines).
// All of it lives in Supabase behind row level security.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { localDate } from "@/lib/dates";
import { loadProgramState, loadProgramWorkouts, Program, ProgramWorkoutRef } from "@/lib/program";
import { supabase } from "@/lib/supabase";

// ---------- Goals ----------

export const FOCUSES = [
  { id: "strength", label: "Strength", hint: "Lift heavier: bench, squat, deadlift, pull" },
  { id: "speed", label: "Speed & power", hint: "Explosiveness, jumps, sprints" },
  { id: "muscle", label: "Muscle & look", hint: "Build muscle and change how you look" },
  { id: "conditioning", label: "Conditioning", hint: "Engine: endurance and work capacity" },
  { id: "sport", label: "Sport performance", hint: "Train for your sport (MMA, triathlon...)" },
] as const;

export type TrainingGoals = {
  focuses: string[];
  primaryFocus: string;
  liftDays: number[]; // 1 = Monday ... 7 = Sunday
  classDays: number[]; // MMA / combat classes
  classTime: string;
  sessionMinutes: number;
};

async function userId() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  return data.session.user.id;
}

export async function saveGoals(goals: TrainingGoals) {
  const { error } = await supabase.from("training_goals").upsert({
    user_id: await userId(),
    focuses: goals.focuses,
    primary_focus: goals.primaryFocus,
    lift_days: goals.liftDays,
    class_days: goals.classDays,
    class_time: goals.classTime,
    session_minutes: goals.sessionMinutes,
  });
  if (error) throw error;
}

// ---------- Workouts ----------

export type PlanSet = {
  label: string;
  target: string;
  isTest: boolean;
  suggestedWeight: number; // 0 = no suggestion
  targetReps: number; // 0 = not a rep target
  targetRpe?: number; // program sets: used when the user doesn't type an RPE
};

export type PlanExercise = {
  id: string;
  // Which tested number this exercise feeds (e.g. bench_press). Defaults to id.
  metric?: string;
  group?: string; // superset letter ("A"): same letter = done back to back
  purpose?: string; // why this exercise is in the session
  name: string;
  kind: "strength" | "measure";
  unit: string;
  better: "higher" | "lower";
  instructions: string;
  restSeconds: number;
  sets: PlanSet[];
};

export type WorkoutPlan = { title: string; intro: string; exercises: PlanExercise[] };

// What the user typed for one set. Kept as text so half-typed numbers survive.
export type SetLog = { weight?: string; reps?: string; rpe?: string; value?: string; done?: boolean };
export type WorkoutLog = Record<string, SetLog>;
export const setKey = (exerciseId: string, index: number) => `${exerciseId}:${index}`;

export type Workout = {
  id: string;
  kind: "test" | "program";
  title: string;
  plan: WorkoutPlan;
  log: WorkoutLog;
  status: "planned" | "in_progress" | "completed";
  program_id: string | null;
  program_week: number | null;
  program_day: number | null;
  results: Result[] | null;
};

export async function loadWorkout(id: string): Promise<Workout> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, kind, title, plan, log, status, program_id, program_week, program_day, results")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Workout;
}

// Saves what's been logged so far. The first save also marks the workout started.
export async function saveWorkoutLog(id: string, log: WorkoutLog, firstSave: boolean) {
  const { error } = await supabase
    .from("workouts")
    .update(firstSave ? { log, status: "in_progress", started_at: new Date().toISOString() } : { log })
    .eq("id", id)
    .neq("status", "completed");
  if (error) throw error;
}

// Asks the test-workout Edge Function for a test (or the unfinished one).
export async function getTestWorkoutId(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ workoutId: string }>("test-workout", {
    body: {},
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if (!data?.workoutId) throw new Error("The coach returned no workout");
  return data.workoutId;
}

// ---------- Results ----------

// Share of a 1-rep max you can lift for N reps to failure (RPE chart).
// Reps "to failure" = reps done + reps left in the tank (10 - RPE).
const PERCENT_OF_MAX = [1, 1, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.68];

// Half-RPEs (8.5) land between chart rows, so interpolate. Past 12 reps the
// chart stops, so higher-rep accessory work uses the Epley formula instead.
function percentOfMax(repsToFailure: number) {
  if (repsToFailure > 12) return 1 / (1 + repsToFailure / 30);
  const low = Math.floor(repsToFailure);
  const high = Math.min(low + 1, 12);
  const t = repsToFailure - low;
  return PERCENT_OF_MAX[low] * (1 - t) + PERCENT_OF_MAX[high] * t;
}

export function estimatedMax(weight: number, reps: number, rpe: number): number | null {
  const repsToFailure = reps + (10 - rpe);
  if (weight <= 0 || reps < 1 || repsToFailure > 30) return null;
  return weight / percentOfMax(repsToFailure);
}

// The weight for `reps` at `rpe`, from an estimated max, rounded to 5 lb.
export function weightFor(max: number, reps: number, rpe: number): number {
  const repsToFailure = Math.min(Math.max(reps + (10 - rpe), 1), 30);
  return Math.round((max * percentOfMax(repsToFailure)) / 5) * 5;
}

// Parses a typed number. "4:50" (minutes:seconds) becomes 290 seconds.
const num = (s?: string) => {
  const text = (s ?? "").trim().replace(",", ".");
  if (text.includes(":")) {
    const [min, sec] = text.split(":");
    const total = (parseFloat(min) || 0) * 60 + (parseFloat(sec) || 0);
    return total > 0 ? total : null;
  }
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
};

// A set counts as done if it was ticked or any number was typed into it.
export function wasPerformed(entry: SetLog | undefined) {
  return !!entry && (!!entry.done || [entry.weight, entry.reps, entry.value].some((v) => v?.trim()));
}

// Timed results read better as 4:50 than 290 seconds.
export function formatResult(value: number, unit: string) {
  if (/sec/i.test(unit) && value >= 60) {
    const whole = Math.round(value);
    return { value: `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`, unit: "min" };
  }
  return { value: String(value), unit };
}

// The weight/reps/value a set counts as: what was typed, else the suggestion.
export function effectiveSet(set: PlanSet, log: SetLog | undefined) {
  return {
    weight: num(log?.weight) ?? (set.suggestedWeight || null),
    reps: num(log?.reps) ?? (set.targetReps || null),
    rpe: num(log?.rpe),
    value: num(log?.value),
  };
}

export type Result = {
  metric: string;
  name: string;
  value: number;
  unit: string;
  better: "higher" | "lower";
  isPR?: boolean; // program workouts: beat the previous number
  previous?: number;
};

// Best estimated max (strength) or best attempt (measure) for each exercise.
export function computeResults(plan: WorkoutPlan, log: WorkoutLog): Result[] {
  const results: Result[] = [];
  for (const ex of plan.exercises) {
    const values: number[] = [];
    ex.sets.forEach((set, i) => {
      const entry = log[setKey(ex.id, i)];
      if (!wasPerformed(entry)) return;
      const s = effectiveSet(set, entry);
      if (ex.kind === "strength") {
        // No RPE entered: assume the set's target, the test target (RPE 9), or failure (conservative).
        const rpe = s.rpe ?? set.targetRpe ?? (set.isTest ? 9 : 10);
        const max = s.weight && s.reps ? estimatedMax(s.weight, s.reps, Math.min(Math.max(rpe, 5), 10)) : null;
        if (max) values.push(max);
      } else if (s.value !== null && s.value > 0) {
        values.push(s.value);
      }
    });
    if (!values.length) continue;
    const best = ex.better === "lower" ? Math.min(...values) : Math.max(...values);
    results.push({
      metric: ex.metric || ex.id,
      name: ex.name,
      value: ex.kind === "strength" ? Math.round(best) : Math.round(best * 100) / 100,
      unit: ex.kind === "strength" ? "lb est. max" : ex.unit,
      better: ex.better,
    });
  }
  return results;
}

// Latest saved number per metric (newest first).
export async function loadLatestBaselines(): Promise<Map<string, Result>> {
  const { data, error } = await supabase
    .from("baselines")
    .select("metric, name, value, unit, better")
    .order("measured_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, Result>();
  for (const b of data ?? []) {
    if (!latest.has(b.metric)) latest.set(b.metric, { ...b, value: Number(b.value) } as Result);
  }
  return latest;
}

const beats = (r: Result, old: Result) => (r.better === "lower" ? r.value < old.value : r.value > old.value);

// Finishes the workout and saves its numbers.
// A test replaces every number it measured. A program workout only saves a
// number that's new or better than before (a PR), so one off day never
// lowers the weights the app suggests.
export async function completeWorkout(workout: Workout, typedLog: WorkoutLog): Promise<Result[]> {
  // Sets with numbers typed in count as done, even if ✓ wasn't tapped.
  const log = Object.fromEntries(
    Object.entries(typedLog).map(([key, entry]) => [key, wasPerformed(entry) ? { ...entry, done: true } : entry]),
  );
  const current = await loadLatestBaselines();
  const results = computeResults(workout.plan, log).map((r) => {
    const old = current.get(r.metric);
    return workout.kind === "program" && old ? { ...r, isPR: beats(r, old), previous: old.value } : r;
  });
  const toSave = workout.kind === "test" ? results : results.filter((r) => r.isPR !== false);
  const uid = await userId();
  const { error } = await supabase
    .from("workouts")
    .update({ log, results, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", workout.id);
  if (error) throw error;
  if (toSave.length) {
    const { error: baselineError } = await supabase.from("baselines").insert(
      toSave.map((r) => ({
        user_id: uid,
        workout_id: workout.id,
        metric: r.metric,
        name: r.name,
        value: r.value,
        unit: r.unit,
        better: r.better,
        measured_on: localDate(),
      })),
    );
    if (baselineError) throw baselineError;
  }
  return results;
}

// ---------- Home screen summary ----------

export type TrainingSummary = {
  goals: TrainingGoals | null;
  test: { id: string; status: Workout["status"] } | null;
  baselines: Result[];
  program: Program | null; // the active program
  pending: Program | null; // a program being written, waiting for review, or failed
  programWorkouts: ProgramWorkoutRef[];
};

export async function loadTrainingSummary(): Promise<TrainingSummary> {
  const [goals, test, latest, programs] = await Promise.all([
    supabase
      .from("training_goals")
      .select("focuses, primary_focus, lift_days, class_days, class_time, session_minutes")
      .maybeSingle(),
    supabase
      .from("workouts")
      .select("id, status")
      .eq("kind", "test")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadLatestBaselines(),
    loadProgramState(),
  ]);
  for (const r of [goals, test]) if (r.error) throw r.error;

  return {
    goals: goals.data
      ? {
          focuses: goals.data.focuses,
          primaryFocus: goals.data.primary_focus,
          liftDays: goals.data.lift_days ?? [],
          classDays: goals.data.class_days ?? [],
          classTime: goals.data.class_time ?? "",
          sessionMinutes: goals.data.session_minutes ?? 75,
        }
      : null,
    test: test.data as TrainingSummary["test"],
    baselines: [...latest.values()],
    program: programs.active,
    pending: programs.pending,
    programWorkouts: programs.active ? await loadProgramWorkouts(programs.active.id) : [],
  };
}

export function useTrainingSummary() {
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadTrainingSummary()
      .then(setSummary)
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(reload);

  return { summary, error, reload };
}
