import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ErrorState";
import { colors, disabledFill, disabledText, radius } from "@/components/theme";
import { onboardingQuestions as questions } from "@/data/onboarding";
import { Journal, loadJournal, saveJournal } from "@/lib/journal";

export default function OnboardingScreen() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Resume where the user left off: the first unanswered question.
  const load = useCallback(() => {
    setLoadError(null);
    loadJournal()
      .then((j) => {
        setJournal(j);
        const firstEmpty = questions.findIndex((q) => !j.answers[q.id]?.trim());
        setIndex(firstEmpty === -1 || j.completedAt ? 0 : firstEmpty);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(load, [load]);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!journal) return <View style={styles.safe} />;

  const question = questions[index];
  const answer = journal.answers[question.id] ?? "";
  const isLast = index === questions.length - 1;
  const canContinue = (!question.required || answer.trim().length > 0) && !saving;

  const setAnswer = (text: string) =>
    setJournal({ ...journal, answers: { ...journal.answers, [question.id]: text } });

  // Save after every step so closing the app never loses answers.
  const next = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (isLast) {
        await saveJournal({ ...journal, completedAt: new Date().toISOString() });
        // Return to the home screen if it's underneath us, otherwise open it.
        router.dismissTo("/");
      } else {
        await saveJournal(journal);
        setIndex(index + 1);
      }
    } catch (e) {
      setSaveError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.content}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((index + 1) / questions.length) * 100}%` }]} />
          </View>
          <Text style={styles.step}>
            {index + 1} of {questions.length}
            {index === 0 ? " · Let's get to know you" : ""}
          </Text>

          <Text style={styles.prompt}>{question.prompt}</Text>
          {question.hint && <Text style={styles.hint}>{question.hint}</Text>}

          <TextInput
            key={question.id}
            style={[styles.input, !question.short && styles.multiline]}
            value={answer}
            onChangeText={setAnswer}
            placeholder={question.required ? "Your answer" : "Your answer (optional)"}
            placeholderTextColor={colors.muted}
            multiline={!question.short}
            autoFocus
            returnKeyType={question.short ? "next" : "default"}
            onSubmitEditing={question.short && canContinue ? next : undefined}
          />
          {saveError && <Text style={styles.error}>{saveError}</Text>}
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.secondary, index === 0 && styles.hidden]}
            disabled={index === 0}
            onPress={() => setIndex(index - 1)}
          >
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.primary, !canContinue && disabledFill]}
            disabled={!canContinue}
            onPress={next}
          >
            <Text style={[styles.primaryText, !canContinue && disabledText]}>{isLast ? "Finish" : answer.trim() ? "Next" : "Skip"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flex: 1, padding: 20, gap: 12 },
  progressTrack: { height: 4, backgroundColor: colors.line, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  step: { color: colors.muted, fontSize: 13, marginBottom: 12 },
  prompt: { color: colors.text, fontSize: 26, fontWeight: "800", lineHeight: 32 },
  hint: { color: colors.muted, fontSize: 15 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    fontSize: 17,
    marginTop: 8,
  },
  multiline: { minHeight: 140, textAlignVertical: "top" },
  buttons: { flexDirection: "row", gap: 12, padding: 20 },
  button: { flex: 1, borderRadius: radius, paddingVertical: 16, alignItems: "center" },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.onAccent, fontSize: 17, fontWeight: "700" },
  secondary: { backgroundColor: colors.card },
  secondaryText: { color: colors.text, fontSize: 17, fontWeight: "600" },
  hidden: { opacity: 0 },
  error: { color: "#F87171", fontSize: 14 },
});
