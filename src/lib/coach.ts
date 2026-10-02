// Gets today's coach message from the coach-sentence Edge Function
// (supabase/functions/coach-sentence). The function calls Claude, so the
// Anthropic API key never has to be inside the app.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

export type CoachMessage = {
  sentence: string;
  // One line of knowledge behind the advice (missing on older saved messages).
  why?: string | null;
};

export async function fetchCoachMessage(): Promise<CoachMessage> {
  const { data, error } = await supabase.functions.invoke<CoachMessage>("coach-sentence", {
    body: {
      date: localDate(),
      weekday: new Date().toLocaleDateString("en-US", { weekday: "long" }),
    },
  });
  if (error) {
    // The function replies with { error: "..." }; show that instead of a generic HTTP message.
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if (!data?.sentence) throw new Error("The coach returned nothing");
  return data;
}

// `enabled` is false until the coach has what it needs (journal, check-in or skip).
// `version` changes whenever the check-in is saved, which asks the coach again.
export function useCoachMessage(enabled: boolean, version: string) {
  const [message, setMessage] = useState<CoachMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setMessage(null);
    fetchCoachMessage()
      .then(setMessage)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, version, load]);

  return { message, error, retry: load };
}
