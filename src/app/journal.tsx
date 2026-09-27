import { router } from "expo-router";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/components/theme";
import { onboardingQuestions as questions } from "@/data/onboarding";
import { deleteJournal, useJournal } from "@/lib/journal";

// Shows what the coach knows about the user, with options to redo or delete it.
export default function JournalScreen() {
  const { journal } = useJournal();

  const confirmDelete = () => {
    const doDelete = async () => {
      await deleteJournal();
      router.replace("/onboarding");
    };
    // Alert.alert has no buttons on web, so fall back to the browser's confirm there.
    if (Platform.OS === "web") {
      if (window.confirm("Delete all your journal answers?")) doDelete();
      return;
    }
    Alert.alert("Delete your journal?", "This removes all your answers from this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Text style={styles.back}>‹ Today</Text>
        </Pressable>
        <Text style={styles.title}>Your journal</Text>
        <Text style={styles.muted}>What your coach knows about you so far.</Text>

        {journal &&
          questions.map((q) => (
            <View key={q.id} style={styles.card}>
              <Text style={styles.question}>{q.prompt}</Text>
              <Text style={journal.answers[q.id]?.trim() ? styles.answer : styles.muted}>
                {journal.answers[q.id]?.trim() || "Not answered"}
              </Text>
            </View>
          ))}

        <Pressable style={[styles.button, styles.edit]} onPress={() => router.push("/onboarding")}>
          <Text style={styles.editText}>Edit answers</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.delete]} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Delete my journal</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 6 },
  question: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  answer: { color: colors.text, fontSize: 16, lineHeight: 22 },
  button: { borderRadius: radius, paddingVertical: 16, alignItems: "center" },
  edit: { backgroundColor: colors.card, marginTop: 8 },
  editText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  delete: { borderWidth: 1, borderColor: "#7F1D1D" },
  deleteText: { color: "#F87171", fontSize: 16, fontWeight: "600" },
});
