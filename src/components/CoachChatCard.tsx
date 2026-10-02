import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius } from "@/components/theme";
import { ChatMessage, loadChat } from "@/lib/chat";

// Home screen box for messaging the coach: shows the coach's last reply and
// sends what you type to the chat screen.
export function CoachChatCard() {
  const [last, setLast] = useState<ChatMessage | null>(null);
  const [text, setText] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadChat(1)
        .then((m) => setLast(m[0] ?? null))
        .catch(() => setLast(null)); // the preview is optional; the chat screen shows real errors
    }, []),
  );

  const send = () => {
    const message = text.trim();
    if (!message) return;
    setText("");
    router.push({ pathname: "/chat", params: { message } });
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>MESSAGE YOUR COACH</Text>
        <Pressable hitSlop={8} onPress={() => router.push("/chat")}>
          <Text style={styles.link}>{last ? "Open chat" : "Chat"}</Text>
        </Pressable>
      </View>
      {last ? (
        <Pressable onPress={() => router.push("/chat")}>
          <Text style={styles.preview} numberOfLines={3}>
            {last.role === "coach" ? "Coach: " : "You: "}
            {last.content}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.muted}>Ask anything: what to eat before class, how to adjust after a bad night, your program.</Text>
      )}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message your coach"
          placeholderTextColor={colors.muted}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <Pressable style={[styles.send, !text.trim() && styles.disabled]} disabled={!text.trim()} onPress={send}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.muted, fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  preview: { color: colors.text, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  composer: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  send: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  sendText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
