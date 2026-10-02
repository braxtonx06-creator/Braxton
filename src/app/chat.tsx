import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import Svg, { Path } from "react-native-svg";

import { ErrorState } from "@/components/ErrorState";
import { colors, disabledFill, disabledText, fonts } from "@/components/theme";
import { ChatMessage, clearChat, loadChat, sendChat } from "@/lib/chat";
import { useTodayCheckIn } from "@/lib/checkIn";
import { loadProgramState, requestRevision } from "@/lib/program";
import { readinessFrom } from "@/lib/readiness";

const STARTERS = [
  "What should I eat before MMA tonight?",
  "Is my program too much with my MMA classes?",
  "I slept badly. What should I change today?",
];

// Chat with the coach about training, food, sleep and recovery. When you agree
// on a program change, the coach offers to rewrite the program; you still
// review it before it's used.
export default function ChatScreen() {
  // A message typed on the home screen arrives here and is sent once.
  const { message: fromHome } = useLocalSearchParams<{ message?: string }>();
  const sentFromHome = useRef(false);
  const [programId, setProgramId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;

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

  const alert = (title: string, message: string) =>
    Platform.OS === "web" ? window.alert(message) : Alert.alert(title, message);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || sending) return;
    // Show their message right away; swap in the saved copy when the coach answers.
    const temp: ChatMessage = { id: "pending", role: "user", content: message, proposal: null, created_at: "" };
    setMessages((m) => [...m, temp]);
    setText("");
    setSending(true);
    try {
      const saved = await sendChat(message);
      setMessages((m) => [...m.filter((x) => x !== temp), ...saved]);
    } catch (e) {
      setMessages((m) => m.filter((x) => x !== temp));
      setText(message);
      alert("Your coach didn't answer", (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  useFocusEffect(load);

  useEffect(() => {
    if (!loaded || !fromHome || sentFromHome.current) return;
    sentFromHome.current = true;
    send(fromHome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fromHome]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!loaded) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const rewrite = async (proposal: string) => {
    if (!programId) return;
    setRewriting(true);
    try {
      await requestRevision(programId, proposal);
      router.replace("/training");
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
          <Pressable style={styles.close} onPress={back} hitSlop={8} accessibilityLabel="Close chat">
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
              <Path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </Svg>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Coach</Text>
            <Text style={styles.subtitle}>Knows your program, check-ins and goals</Text>
          </View>
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
          {messages.length === 0 && !sending && (
            <View style={styles.starters}>
              <Text style={styles.muted}>Ask about training, food, sleep or recovery.</Text>
              {STARTERS.map((s) => (
                <Pressable key={s} style={styles.starter} onPress={() => send(s)} disabled={sending}>
                  <Text style={styles.starterText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <View key={m.id} style={[styles.bubble, styles.mine, { backgroundColor: tint }]}>
                <Text style={styles.mineText}>{m.content}</Text>
              </View>
            ) : (
              <View key={m.id} style={[styles.bubble, styles.theirs]}>
                <Text style={[styles.theirsText, styles.pad]}>{m.content}</Text>
                {m.proposal && (
                  <View style={styles.proposal}>
                    <Text style={styles.proposalLabel}>PROPOSED CHANGE</Text>
                    <Text style={styles.proposalText}>{m.proposal}</Text>
                    {m === lastCoach && programId && (
                      <Pressable
                        style={[styles.button, sending && !rewriting && disabledFill]}
                        disabled={rewriting || sending}
                        onPress={() => rewrite(m.proposal!)}
                      >
                        {rewriting ? (
                          <ActivityIndicator color={colors.bg} />
                        ) : (
                          <Text style={[styles.buttonText, sending && disabledText]}>Rewrite my program</Text>
                        )}
                      </Pressable>
                    )}
                    <Text style={styles.hint}>You review it before anything changes.</Text>
                  </View>
                )}
              </View>
            ),
          )}

          {sending && (
            <View style={[styles.bubble, styles.theirs, styles.row, styles.pad]}>
              <ActivityIndicator color={colors.muted} />
              <Text style={styles.muted}>Your coach is thinking…</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message your coach"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[styles.send, { backgroundColor: tint }, (!text.trim() || sending) && disabledFill]}
            disabled={!text.trim() || sending}
            onPress={() => send(text)}
            accessibilityLabel="Send"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" strokeWidth={2.2}>
              <Path
                d="M12 19V5M5 12l7-7 7 7"
                stroke={!text.trim() || sending ? colors.faint : colors.onAccent}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 2 },
  title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18 },
  subtitle: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  content: { paddingHorizontal: 16, paddingVertical: 18, gap: 12 },
  muted: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  starters: { gap: 8 },
  starter: { backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  starterText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  bubble: { borderRadius: 18, overflow: "hidden" },
  pad: { paddingHorizontal: 14, paddingVertical: 12 },
  mine: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mineText: { color: colors.onAccent, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  theirs: { alignSelf: "flex-start", maxWidth: "86%", backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  theirsText: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  proposal: { backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  proposalLabel: { color: colors.text, fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1 },
  proposalText: { color: colors.soft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: colors.text,
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: colors.bg, fontFamily: fonts.heavy, fontSize: 15 },
  hint: { color: colors.faint, fontFamily: fonts.medium, fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
});
