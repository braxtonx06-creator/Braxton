// Gets today's coach sentence from the coach-sentence Edge Function
// (supabase/functions/coach-sentence). The function calls Claude, so the
// Anthropic API key never has to be inside the app.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchCoachSentence(): Promise<string> {
  const now = new Date();
  const { data, error } = await supabase.functions.invoke<{ sentence: string }>("coach-sentence", {
    body: {
      date: localDate(now),
      weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
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
  return data.sentence;
}

// `enabled` is false until the journal is finished; the coach needs it first.
export function useCoachSentence(enabled: boolean) {
  const [sentence, setSentence] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchCoachSentence()
      .then(setSentence)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (enabled && sentence === null) load();
  }, [enabled, sentence, load]);

  return { sentence, error, retry: load };
}
