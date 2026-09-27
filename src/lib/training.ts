// Training data: goals, workouts (plan + log) and tested numbers (baselines).
// All of it lives in Supabase behind row level security.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

// ---------- Goals ----------

export const FOCUSES = [
  { id: "strength", label: "Strength", hint: "Lift heavier: bench, squat, deadlift, pull" },
  { id: "speed", label: "Speed & power", hint: "Explosiveness, jumps, sprints" },
  { id: "muscle", label: "Muscle & look", hint: "Build muscle and change how you look" },
  { id: "conditioning", label: "Conditioning", hint: "Engine: endurance and work capacity" },
  { id: "sport", label: "Sport performance", hint: "Train for your sport (MMA, triathlon...)" },
] as const;

export type TrainingGoals = { focuses: string[]; primaryFocus: string };

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
};

export type PlanExercise = {
  id: string;
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
};

export async function loadWorkout(id: string): Promise<Workout> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, kind, title, plan, log, status")
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

export function estimatedMax(weight: number, reps: number, rpe: number): number | null {
  const repsToFailure = reps + (10 - rpe);
  if (weight <= 0 || reps < 1 || repsToFailure > 12) return null;
  return weight / PERCENT_OF_MAX[Math.round(repsToFailure)];
}

const num = (s?: string) => {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// The weight/reps/value a set counts as: what was typed, else the suggestion.
export function effectiveSet(set: PlanSet, log: SetLog | undefined) {
  return {
    weight: num(log?.weight) ?? (set.suggestedWeight || null),
    reps: num(log?.reps) ?? (set.targetReps || null),
    rpe: num(log?.rpe),
    value: num(log?.value),
  };
}

export type Result = { metric: string; name: string; value: number; unit: string; better: "higher" | "lower" };

// Best estimated max (strength) or best attempt (measure) for each exercise.
export function computeResults(plan: WorkoutPlan, log: WorkoutLog): Result[] {
  const results: Result[] = [];
  for (const ex of plan.exercises) {
    const values: number[] = [];
    ex.sets.forEach((set, i) => {
      const entry = log[setKey(ex.id, i)];
      if (!entry?.done) return;
      const s = effectiveSet(set, entry);
      if (ex.kind === "strength") {
        // No RPE entered: assume the test set's target (RPE 9), or failure otherwise (conservative).
        const rpe = s.rpe ?? (set.isTest ? 9 : 10);
        const max = s.weight && s.reps ? estimatedMax(s.weight, s.reps, Math.min(Math.max(rpe, 5), 10)) : null;
        if (max) values.push(max);
      } else if (s.value !== null && s.value > 0) {
        values.push(s.value);
      }
    });
    if (!values.length) continue;
    const best = ex.better === "lower" ? Math.min(...values) : Math.max(...values);
    results.push({
      metric: ex.id,
      name: ex.name,
      value: ex.kind === "strength" ? Math.round(best) : Math.round(best * 100) / 100,
      unit: ex.kind === "strength" ? "lb est. max" : ex.unit,
      better: ex.better,
    });
  }
  return results;
}

// Finishes the workout and saves its results as the user's baselines.
export async function completeWorkout(workout: Workout, log: WorkoutLog): Promise<Result[]> {
  const results = computeResults(workout.plan, log);
  const uid = await userId();
  const { error } = await supabase
    .from("workouts")
    .update({ log, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", workout.id);
  if (error) throw error;
  if (results.length) {
    const { error: baselineError } = await supabase.from("baselines").insert(
      results.map((r) => ({
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
};

export async function loadTrainingSummary(): Promise<TrainingSummary> {
  const [goals, test, baselines] = await Promise.all([
    supabase.from("training_goals").select("focuses, primary_focus").maybeSingle(),
    supabase
      .from("workouts")
      .select("id, status")
      .eq("kind", "test")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("baselines")
      .select("metric, name, value, unit, better, measured_on")
      .order("measured_on", { ascending: false }),
  ]);
  for (const r of [goals, test, baselines]) if (r.error) throw r.error;

  // Latest value per metric.
  const latest = new Map<string, Result>();
  for (const b of baselines.data ?? []) {
    if (!latest.has(b.metric)) latest.set(b.metric, { ...b, value: Number(b.value) } as Result);
  }
  return {
    goals: goals.data ? { focuses: goals.data.focuses, primaryFocus: goals.data.primary_focus } : null,
    test: test.data as TrainingSummary["test"],
    baselines: [...latest.values()],
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
