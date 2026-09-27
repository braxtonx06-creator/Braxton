// Saves the onboarding journal to Supabase (the `journals` table, one row per user).
// Row level security means each signed-in user can only read and write their own row.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase";

// Milestone 1 kept the journal on the phone under this key.
const LEGACY_KEY = "journal/v1";

export type Journal = {
  answers: Record<string, string>;
  // Set once the user finishes onboarding; until then the app sends them back to it.
  completedAt?: string;
};

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  return data.session.user.id;
}

export async function loadJournal(): Promise<Journal> {
  const { data, error } = await supabase
    .from("journals")
    .select("answers, completed_at")
    .maybeSingle();
  if (error) throw error;
  if (data) return { answers: data.answers ?? {}, completedAt: data.completed_at ?? undefined };

  // No journal in the cloud yet: move one saved on this phone (Milestone 1) up to Supabase.
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const journal: Journal = { answers: {}, ...JSON.parse(legacy) };
    await saveJournal(journal);
    await AsyncStorage.removeItem(LEGACY_KEY);
    return journal;
  }
  return { answers: {} };
}

export async function saveJournal(journal: Journal): Promise<void> {
  const { error } = await supabase.from("journals").upsert({
    user_id: await currentUserId(),
    answers: journal.answers,
    completed_at: journal.completedAt ?? null,
  });
  if (error) throw error;
}

// Deletes everything the coach knows: journal, check-ins, coach messages and training data.
export async function deleteJournal(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from("journals").delete().eq("user_id", userId);
  if (error) throw error;
  for (const table of ["check_ins", "coach_messages", "baselines", "workouts", "training_goals"]) {
    const { error: tableError } = await supabase.from(table).delete().eq("user_id", userId);
    if (tableError) throw tableError;
  }
  await AsyncStorage.removeItem(LEGACY_KEY);
}

// Loads the journal each time a screen comes into view, so it never shows
// stale answers after editing. `journal` is null until the first load finishes.
export function useJournal() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadJournal()
      .then(setJournal)
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(reload);

  return { journal, error, reload };
}
