import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ErrorState";
import { colors, radius } from "@/components/theme";
import { ChatMessage, clearChat, loadChat, sendChat } from "@/lib/chat";
import { loadProgramState, requestRevision } from "@/lib/program";

const STARTERS = [
  "Is this too much with my MMA classes?",
  "Why is this program set up the way it is?",
  "I like lifting almost every day. Can we keep that?",
];

// Talk your program through with the coach. When you agree on a change, the
// coach offers to rewrite the program; you still review it before it's used.
export default function ChatScreen() {
  const [programId, setProgramId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([loadProgramState(), loadChat()])
      .then(([state, chat]) => {
        setProgramId(state.active?.id ?? null);
        setMessages(chat);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(load);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!loaded) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const alert = (title: string, message: string) =>
    Platform.OS === "web" ? window.alert(message) : Alert.alert(title, message);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || !programId || sending) return;
    // Show their message right away; swap in the saved copy when the coach answers.
    const temp: ChatMessage = { id: "pending", role: "user", content: message, proposal: null, created_at: "" };
    setMessages((m) => [...m, temp]);
    setText("");
    setSending(true);
    try {
      const saved = await sendChat(programId, message);
      setMessages((m) => [...m.filter((x) => x !== temp), ...saved]);
    } catch (e) {
      setMessages((m) => m.filter((x) => x !== temp));
      setText(message);
      alert("Your coach didn't answer", (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const rewrite = async (proposal: string) => {
    if (!programId) return;
    setRewriting(true);
    try {
      await requestRevision(programId, proposal);
      router.replace("/program");
    } catch (e) {
      alert("Couldn't start the rewrite", (e as Error).message);
      setRewriting(false);
    }
  };

  const startOver = () => {
    const doClear = () => clearChat().then(load, (e: Error) => alert("Couldn't clear the chat", e.message));
    if (Platform.OS === "web") {
      if (window.confirm("Clear this conversation? Your program stays the same.")) doClear();
      return;
    }
    Alert.alert("Clear this conversation?", "Your program stays the same.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: doClear },
    ]);
  };

  // Only the newest coach message can be turned into a rewrite.
  const lastCoach = [...messages].reverse().find((m) => m.role === "coach");

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={back} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          {messages.length > 0 && (
            <Pressable onPress={startOver} hitSlop={8} disabled={sending}>
              <Text style={styles.muted}>Start over</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          <Text style={styles.kicker}>COACH</Text>
          <Text style={styles.title}>Talk about your program</Text>
          <Text style={styles.body}>
            Ask why something is there, or tell your coach what feels off. If you agree on a change, you can have the
            program rewritten, and you'll review it before it's used.
          </Text>

          {!programId && (
            <Text style={styles.warn}>You need an active program first. Build one from the Training card.</Text>
          )}

          {programId && messages.length === 0 && (
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <Pressable key={s} style={styles.starter} onPress={() => send(s)} disabled={sending}>
                  <Text style={styles.starterText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.role === "user" ? styles.mine : styles.theirs]}>
              <Text style={styles.bubbleText}>{m.content}</Text>
              {m.role === "coach" && m.proposal && (
                <View style={styles.proposal}>
                  <Text style={styles.proposalLabel}>PROPOSED CHANGE</Text>
                  <Text style={styles.proposalText}>{m.proposal}</Text>
                  {m === lastCoach && (
                    <Pressable
                      style={[styles.button, rewriting && styles.disabled]}
                      disabled={rewriting || sending}
                      onPress={() => rewrite(m.proposal!)}
                    >
                      {rewriting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>Rewrite my program</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}

          {sending && (
            <View style={[styles.bubble, styles.theirs, styles.row]}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.muted}>Your coach is thinking…</Text>
            </View>
          )}
        </ScrollView>

        {programId && (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Message your coach"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[styles.send, (!text.trim() || sending) && styles.disabled]}
              disabled={!text.trim() || sending}
              onPress={() => send(text)}
            >
              <Text style={styles.buttonText}>Send</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14 },
  warn: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  starters: { gap: 8, marginTop: 6 },
  starter: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  starterText: { color: colors.text, fontSize: 15 },
  bubble: { borderRadius: radius, padding: 12, maxWidth: "88%", gap: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.accent },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.card },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  proposal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8, gap: 6 },
  proposalLabel: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  proposalText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  send: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
});
