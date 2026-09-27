// The morning check-in, saved in Supabase (`check_ins`, one row per user per day).

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

export type CheckIn = {
  sleepHours: number;
  sleepQuality: number; // 1-5
  feeling: number; // 1-5
  updatedAt: string;
};

export async function loadTodayCheckIn(): Promise<CheckIn | null> {
  const { data, error } = await supabase
    .from("check_ins")
    .select("sleep_hours, sleep_quality, feeling, updated_at")
    .eq("day", localDate())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    sleepHours: Number(data.sleep_hours),
    sleepQuality: data.sleep_quality,
    feeling: data.feeling,
    updatedAt: data.updated_at,
  };
}

export async function saveTodayCheckIn(input: Omit<CheckIn, "updatedAt">): Promise<CheckIn> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("check_ins")
    .upsert({
      user_id: session.session.user.id,
      day: localDate(),
      sleep_hours: input.sleepHours,
      sleep_quality: input.sleepQuality,
      feeling: input.feeling,
    })
    .select("updated_at")
    .single();
  if (error) throw error;
  return { ...input, updatedAt: data.updated_at };
}

// Today's check-in for a screen. `loaded` is false until the first load finishes.
export function useTodayCheckIn() {
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadTodayCheckIn()
      .then((c) => {
        setCheckIn(c);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(reload);

  return { checkIn, setCheckIn, loaded, error, reload };
}
