import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CheckInCard } from "@/components/CheckInCard";
import { ErrorState } from "@/components/ErrorState";
import { colors, radius } from "@/components/theme";
import { placeholderRundown as today } from "@/data/today";
import { useTodayCheckIn } from "@/lib/checkIn";
import { useCoachMessage } from "@/lib/coach";
import { useJournal } from "@/lib/journal";

export default function HomeScreen() {
  const { journal, error, reload } = useJournal();
  const checkIns = useTodayCheckIn();
  const [skippedCheckIn, setSkippedCheckIn] = useState(false);

  // The coach waits for the morning check-in (or a skip) so it only runs once,
  // and runs again whenever the check-in is saved.
  const checkInDone = checkIns.checkIn !== null;
  const coach = useCoachMessage(
    !!journal?.completedAt && checkIns.loaded && (checkInDone || skippedCheckIn),
    checkIns.checkIn?.updatedAt ?? "none",
  );
  const { food } = today;

  const loadError = error ?? checkIns.error;
  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => {
          reload();
          checkIns.reload();
        }}
      />
    );
  }
  if (!journal || !checkIns.loaded) return <View style={styles.safe} />;
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

        {/* After checking in, the summary sits under the coach (tap Edit to change it). */}
        {checkInDone && <CheckInCard checkIn={checkIns.checkIn} onSaved={checkIns.setCheckIn} />}

        <Section title="Training · sample">
          {today.training.map((s) => (
            <View key={s.title} style={styles.session}>
              <View style={styles.row}>
                <Text style={styles.sessionTime}>{s.time}</Text>
                {s.source === "coach" && <Text style={styles.tag}>IN PERSON</Text>}
              </View>
              <Text style={styles.sessionTitle}>{s.title}</Text>
              <Text style={styles.body}>{s.detail}</Text>
            </View>
          ))}
        </Section>

        <Section title="Food · sample">
          <View style={styles.stats}>
            <Stat label="Calories" value={food.calories.toLocaleString()} />
            <Stat label="Protein" value={`${food.proteinG} g`} />
            <Stat label="Carbs" value={`${food.carbsG} g`} />
            <Stat label="Fat" value={`${food.fatG} g`} />
          </View>
          <Text style={styles.body}>{food.note}</Text>
        </Section>

        <Text style={styles.footer}>Training and food are sample data. Real plans come in later milestones.</Text>
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
  content: { padding: 20, gap: 14, paddingBottom: 48 },
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stats: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
  stat: { gap: 2 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  session: { gap: 4, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  sessionTime: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  sessionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  tag: {
    color: colors.coachTag,
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.coachTag,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  footer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
});
