import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Avatar, useAvatar } from "@/components/Avatar";
import { CheckInCard } from "@/components/CheckInCard";
import { ErrorState } from "@/components/ErrorState";
import { ReadinessDial } from "@/components/ReadinessDial";
import { TrainingCard } from "@/components/TrainingCard";
import { colors, fonts } from "@/components/theme";
import { loadCheckInStreak, useTodayCheckIn } from "@/lib/checkIn";
import { useCoachMessage } from "@/lib/coach";
import { localDate } from "@/lib/dates";
import { totalsOf, useTodayMeals } from "@/lib/food";
import { useJournal } from "@/lib/journal";
import { readinessFrom } from "@/lib/readiness";
import { useTrainingSummary } from "@/lib/training";
import { useWeights } from "@/lib/weight";

const QUALITY = ["", "Terrible", "Poor", "Okay", "Good", "Great"];

// Today: one call (push / steady / recover) from your check-in, the coach's
// line, today's focus, and your numbers at a glance.
export default function TodayScreen() {
  const { journal, error, reload } = useJournal();
  const checkIns = useTodayCheckIn();
  const training = useTrainingSummary();
  const avatar = useAvatar();
  const { meals } = useTodayMeals();
  const { weights } = useWeights(1);
  const food = totalsOf(meals ?? []);
  const [skippedCheckIn, setSkippedCheckIn] = useState(false);
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadCheckInStreak()
        .then(setStreak)
        .catch(() => setStreak(null)); // the streak is a bonus; never block Today on it
    }, [checkIns.checkIn?.updatedAt]),
  );

  // The coach waits for the morning check-in (or a skip) so it only runs once,
  // and runs again whenever the check-in is saved.
  const checkIn = checkIns.checkIn;
  const coach = useCoachMessage(
    !!journal?.completedAt && checkIns.loaded && (checkIn !== null || skippedCheckIn),
    checkIn?.updatedAt ?? "none",
  );

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

  const name = journal.answers.name?.trim() || "there";
  const readiness = checkIn ? readinessFrom(checkIn) : null;
  const tint = readiness?.color ?? colors.text;
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const askCheckIn = (!checkIn && !skippedCheckIn) || editingCheckIn;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={[styles.topLine, { backgroundColor: tint }]} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/you")} accessibilityLabel="Your profile">
            <Avatar id={avatar} name={name} size={44} ring={tint} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.date}>{date}</Text>
            <Text style={styles.name}>{name}</Text>
          </View>
          {streak !== null && streak > 0 && (
            <View style={styles.streak}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill={tint}>
                <Path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z" />
              </Svg>
              <Text style={styles.streakValue}>{streak}</Text>
              <Text style={styles.streakLabel}>day streak</Text>
            </View>
          )}
        </View>

        {askCheckIn ? (
          <CheckInCard
            checkIn={checkIn}
            startEditing={editingCheckIn}
            onSaved={(c) => {
              checkIns.setCheckIn(c);
              setEditingCheckIn(false);
            }}
            onSkip={() => setSkippedCheckIn(true)}
          />
        ) : (
          <View style={styles.call}>
            <View style={styles.callText}>
              <Text style={[styles.verdict, { color: tint }, readiness?.level === "recover" && styles.verdictLong]}>
                {readiness?.verdict ?? "TODAY"}
              </Text>
              {coach.message ? (
                <Pressable onPress={() => setShowWhy(!showWhy)} hitSlop={6}>
                  <Text style={styles.line}>{coach.message.sentence}</Text>
                  {showWhy && coach.message.why ? (
                    <Text style={styles.why}>{coach.message.why}</Text>
                  ) : coach.message.why ? (
                    <Text style={styles.whyLink}>Why ›</Text>
                  ) : null}
                </Pressable>
              ) : coach.error ? (
                <Pressable onPress={coach.retry} hitSlop={6}>
                  <Text style={styles.why}>Couldn't reach your coach. Tap to retry.</Text>
                </Pressable>
              ) : (
                <View style={styles.thinking}>
                  <ActivityIndicator color={colors.muted} size="small" />
                  <Text style={styles.why}>Your coach is thinking…</Text>
                </View>
              )}
            </View>
            {readiness && <ReadinessDial percent={readiness.percent} color={readiness.color} />}
          </View>
        )}

        <TrainingCard summary={training.summary} checkIn={checkIn} tint={readiness?.color ?? colors.accent} />

        <View style={styles.tiles}>
          <Tile
            label="WEIGHT"
            value={weights?.[0] ? String(weights[0].pounds) : "—"}
            note={weights?.[0]?.day === localDate() ? "lb today" : "Log it"}
            onPress={() => router.push("/weight")}
          />
          <Tile
            label="FOOD"
            value={meals?.length ? String(food.calories) : "—"}
            note={meals?.length ? `kcal · ${Math.round(food.protein_g)}g protein` : "Snap a meal"}
            onPress={() => router.push("/food")}
          />
          <Tile
            label="SLEEP"
            value={checkIn ? `${checkIn.sleepHours}h` : "—"}
            note={checkIn ? QUALITY[checkIn.sleepQuality] : "Check in"}
            onPress={checkIn ? () => setEditingCheckIn(true) : undefined}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ label, value, note, onPress }: { label: string; value: string; note: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress} disabled={!onPress}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileNote}>{note}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topLine: { height: 3 },
  content: { padding: 20, gap: 16, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1 },
  date: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  name: { color: colors.text, fontFamily: fonts.heavy, fontSize: 17 },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  streakValue: { color: colors.text, fontFamily: fonts.black, fontSize: 15 },
  streakLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  call: { flexDirection: "row", alignItems: "center", gap: 14 },
  callText: { flex: 1, gap: 6 },
  verdict: { fontFamily: fonts.black, fontSize: 56, lineHeight: 58, letterSpacing: -0.5 },
  verdictLong: { fontSize: 40, lineHeight: 44 },
  line: { color: colors.soft, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  whyLink: { color: colors.muted, fontFamily: fonts.bold, fontSize: 13, marginTop: 4 },
  why: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 4 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 4 },
  tileLabel: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1 },
  tileValue: { color: colors.text, fontFamily: fonts.black, fontSize: 24 },
  tileNote: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11 },
});
