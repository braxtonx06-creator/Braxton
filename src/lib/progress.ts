// Everything the Progress and You tabs show: your main lift and the road to
// its goal, PRs, sessions, sleep and streak. Read-only, worked out from data
// the app already saves (baselines, workouts, check-ins, the journal).

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { loadCheckInStreak } from "@/lib/checkIn";
import { localDate } from "@/lib/dates";
import { loadJournal } from "@/lib/journal";
import { loadProgramState, loadProgramWorkouts } from "@/lib/program";
import { supabase } from "@/lib/supabase";
import { FOCUSES, Result } from "@/lib/training";

export type Point = { date: string; value: number };
export type Best = Result & { date: string };

export type ProgressData = {
  // The lift the screen is built around: bench if you've tested it, else your first strength number.
  hero: { metric: string; name: string; value: number; goal: number | null; history: Point[] } | null;
  recent: Best[]; // newest number per metric, newest first
  block: { done: number; total: number } | null; // sessions in the active program
  sessions: number; // all finished workouts
  avgSleep: number | null; // last 7 days of check-ins
  streak: number;
  bodyWeight: number | null; // from the journal until weight logging exists
  focuses: string[];
  week: { lifts: number; classes: number } | null;
};

// "I'm training to lift 315 on bench" → 315. Looks for a number next to the
// lift's name that's above where you are now.
export function goalFromText(text: string, keyword: string, current: number): number | null {
  const near = new RegExp(
    `(\\d{2,4})\\s*(?:lbs?|pounds)?[^.\\n\\d]{0,25}\\b${keyword}|\\b${keyword}[^.\\n\\d]{0,25}?(\\d{2,4})`,
    "gi",
  );
  for (const m of text.matchAll(near)) {
    const n = Number(m[1] ?? m[2]);
    if (n > current) return n;
  }
  return null;
}

// "180lbs body weight" / "I weigh 180" → 180.
export function bodyWeightFromText(text: string): number | null {
  const m =
    text.match(/(\d{2,3})\s*(?:lbs?|pounds)?\s*(?:of\s+)?body\s*weight/i) ??
    text.match(/(?:body\s*weight|weigh)[^\d\n]{0,15}(\d{2,3})/i);
  return m ? Number(m[1]) : null;
}

const isStrength = (unit: string) => /lb est/i.test(unit);

export async function loadProgress(): Promise<ProgressData> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);

  const [baselines, workouts, checkIns, journal, programs, streak, goals] = await Promise.all([
    supabase
      .from("baselines")
      .select("metric, name, value, unit, better, measured_on")
      .order("measured_on", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("workouts").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("check_ins").select("sleep_hours").gte("day", localDate(weekAgo)),
    loadJournal(),
    loadProgramState(),
    loadCheckInStreak(),
    supabase.from("training_goals").select("focuses, lift_days, class_days").maybeSingle(),
  ]);
  for (const r of [baselines, workouts, checkIns, goals]) if (r.error) throw r.error;

  const rows: Best[] = (baselines.data ?? []).map((b) => ({
    metric: b.metric,
    name: b.name,
    value: Number(b.value),
    unit: b.unit,
    better: b.better,
    date: b.measured_on,
  }));

  // Newest number per metric, newest first.
  const latest = new Map<string, Best>();
  for (const r of rows) latest.set(r.metric, r);
  const recent = [...latest.values()].reverse();

  const heroMetric =
    (latest.has("bench_press") && "bench_press") || recent.find((r) => isStrength(r.unit))?.metric || null;
  let hero: ProgressData["hero"] = null;
  if (heroMetric) {
    const now = latest.get(heroMetric)!;
    const keyword = heroMetric.split("_")[0];
    const text = [journal.answers.goals, journal.answers.lifeGoals].filter(Boolean).join("\n");
    hero = {
      metric: heroMetric,
      name: now.name,
      value: now.value,
      goal: goalFromText(text, keyword, now.value),
      history: rows.filter((r) => r.metric === heroMetric).map((r) => ({ date: r.date, value: r.value })),
    };
  }

  let block: ProgressData["block"] = null;
  if (programs.active) {
    const done = (await loadProgramWorkouts(programs.active.id)).filter((w) => w.status === "completed").length;
    block = { done, total: programs.active.plan.days.length * programs.active.plan.weeks.length };
  }

  const sleeps = (checkIns.data ?? []).map((c) => Number(c.sleep_hours));
  const focuses: string[] = goals.data?.focuses ?? [];

  return {
    hero,
    recent,
    block,
    sessions: workouts.count ?? 0,
    avgSleep: sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null,
    streak,
    bodyWeight: bodyWeightFromText(journal.answers.numbers ?? ""),
    focuses: focuses.map((id) => FOCUSES.find((f) => f.id === id)?.label ?? id),
    week: goals.data ? { lifts: goals.data.lift_days?.length ?? 0, classes: goals.data.class_days?.length ?? 0 } : null,
  };
}

export function useProgress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadProgress()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(reload);

  return { data, error, reload };
}

// 7.1 → "7h 05m"
export function formatHours(hours: number) {
  const mins = Math.round(hours * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

// "2026-09-27" → "Sep 27"
export function shortDate(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
