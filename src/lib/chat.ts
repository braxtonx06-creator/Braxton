// Chatting with the coach about anything it covers: training, food, sleep,
// recovery, body weight. The coach can't change the program itself: when you
// agree on a change, its reply carries a `proposal`, and "Rewrite my program"
// sends that to the coach as a revision to review.

import { FunctionsHttpError } from "@supabase/supabase-js";

import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

export type ChatMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
  proposal: string | null;
  created_at: string;
};

const COLUMNS = "id, role, content, proposal, created_at";

// The most recent part of the conversation, oldest first.
export async function loadChat(limit = 50): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("coach_chats")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ChatMessage[]).reverse();
}

// Sends a message and returns it plus the coach's reply, as saved.
export async function sendChat(message: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>("program", {
    body: { mode: "chat", message, date: localDate() },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw error;
  }
  if (!data?.messages?.length) throw new Error("The coach returned nothing");
  return data.messages;
}

// Starts the conversation over (the program is untouched).
export async function clearChat(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  const { error } = await supabase.from("coach_chats").delete().eq("user_id", data.session.user.id);
  if (error) throw error;
}
