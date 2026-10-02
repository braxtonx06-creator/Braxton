import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CheckInCard } from "@/components/CheckInCard";
import { CoachChatCard } from "@/components/CoachChatCard";
import { ErrorState } from "@/components/ErrorState";
import { TrainingCard } from "@/components/TrainingCard";
import { colors, radius } from "@/components/theme";
import { placeholderRundown as today } from "@/data/today";
import { useTodayCheckIn } from "@/lib/checkIn";
import { useCoachMessage } from "@/lib/coach";
import { useJournal } from "@/lib/journal";
import { useTrainingSummary } from "@/lib/training";

export default function HomeScreen() {
  const { journal, error, reload } = useJournal();
  const checkIns = useTodayCheckIn();
  const training = useTrainingSummary();
  const [skippedCheckIn, setSkippedCheckIn] = useState(false);

  // The coach waits for the morning check-in (or a skip) so it only runs once,
  // and runs again whenever the check-in is saved.
  const checkInDone = checkIns.checkIn !== null;
  const coach = useCoachMessage(
    !!journal?.completedAt && checkIns.loaded && (checkInDone || skippedCheckIn),
    checkIns.checkIn?.updatedAt ?? "none",
  );
  const { food } = today;

  const loadError = error ?? checkIns.error ?? training.error;
  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => {
          reload();
          checkIns.reload();
          training.reload();
        }}
      />
    );
  }
  if (!journal || !checkIns.loaded || !training.summary) return <View style={styles.safe} />;
  // First open: the coach needs to meet you before it can plan your day.
  if (!journal.completedAt) return <Redirect href="/onboarding" />;

  const name = journal.answers.name?.trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.date}>{today.date}</Text>
          <Link href="/journal" asChild>
            <Pressable hitSlop={12}>
              <Text style={styles.journalLink}>Journal</Text>
            </Pressable>
          </Link>
        </View>
        <Text style={styles.title}>{name ? `Today, ${name}` : "Today"}</Text>

        {/* Before checking in, the check-in card comes first. */}
        {!checkInDone && !skippedCheckIn && (
          <CheckInCard checkIn={null} onSaved={checkIns.setCheckIn} onSkip={() => setSkippedCheckIn(true)} />
        )}

        {/* The coach's sentence and why, written by Claude from your journal and check-in */}
        <View style={styles.coach}>
          <Text style={styles.coachLabel}>COACH</Text>
          {!checkInDone && !skippedCheckIn ? (
            <Text style={styles.body}>Check in above and I'll tell you how to attack today.</Text>
          ) : coach.message ? (
            <>
              <Text style={styles.coachText}>{coach.message.sentence}</Text>
              {coach.message.why && <Text style={styles.why}>Why: {coach.message.why}</Text>}
            </>
          ) : coach.error ? (
            <>
              <Text style={styles.body}>Couldn't reach your coach: {coach.error}</Text>
              <Pressable onPress={coach.retry} hitSlop={8}>
                <Text style={styles.journalLink}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.thinking}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.body}>Your coach is thinking…</Text>
            </View>
          )}
        </View>

        <CoachChatCard />

        {/* After checking in, the summary sits under the coach (tap Edit to change it). */}
        {checkInDone && <CheckInCard checkIn={checkIns.checkIn} onSaved={checkIns.setCheckIn} />}

        <TrainingCard summary={training.summary} checkIn={checkIns.checkIn} />

        <Section title="Food · sample">
          <View style={styles.stats}>
            <Stat label="Calories" value={food.calories.toLocaleString()} />
            <Stat label="Protein" value={`${food.proteinG} g`} />
            <Stat label="Carbs" value={`${food.carbsG} g`} />
            <Stat label="Fat" value={`${food.fatG} g`} />
          </View>
          <Text style={styles.body}>{food.note}</Text>
        </Section>

        <Text style={styles.footer}>Food is sample data for now. Meal logging comes in a later milestone.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 120 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: colors.muted, fontSize: 14 },
  journalLink: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  thinking: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.text, fontSize: 34, fontWeight: "800", marginBottom: 4 },
  coach: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    padding: 16,
    gap: 6,
  },
  coachLabel: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  coachText: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: "600" },
  why: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  cardTitle: { color: colors.muted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  stats: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
  stat: { gap: 2 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  footer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
});
