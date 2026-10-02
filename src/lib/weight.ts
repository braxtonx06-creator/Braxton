// Body weight: one number per day in the `body_weights` table.

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

export type WeighIn = { day: string; pounds: number };

export async function saveWeight(pounds: number) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  const { error } = await supabase
    .from("body_weights")
    .upsert({ user_id: data.session.user.id, day: localDate(), pounds }, { onConflict: "user_id,day" });
  if (error) throw error;
}

// Newest first.
export async function loadWeights(limit = 30): Promise<WeighIn[]> {
  const { data, error } = await supabase
    .from("body_weights")
    .select("day, pounds")
    .order("day", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((w) => ({ day: w.day, pounds: Number(w.pounds) }));
}

export function useWeights(limit = 30) {
  const [weights, setWeights] = useState<WeighIn[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadWeights(limit)
      .then(setWeights)
      .catch((e: Error) => setError(e.message));
  }, [limit]);

  useFocusEffect(reload);

  return { weights, error, reload };
}
