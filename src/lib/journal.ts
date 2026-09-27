// Saves the onboarding journal on the phone with AsyncStorage.
// Milestone 2 moves this to Supabase so the coach can read it from the server.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

const KEY = "journal/v1";

export type Journal = {
  answers: Record<string, string>;
  // Set once the user finishes onboarding; until then the app sends them back to it.
  completedAt?: string;
};

const empty: Journal = { answers: {} };

export async function loadJournal(): Promise<Journal> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? { ...empty, ...JSON.parse(raw) } : empty;
}

export async function saveJournal(journal: Journal): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(journal));
}

export async function deleteJournal(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// Loads the journal each time a screen comes into view, so it never shows
// stale answers after editing. `journal` is null until the first load finishes.
export function useJournal() {
  const [journal, setJournal] = useState<Journal | null>(null);

  const reload = useCallback(() => {
    loadJournal().then(setJournal);
  }, []);

  useFocusEffect(reload);

  return { journal, reload };
}
