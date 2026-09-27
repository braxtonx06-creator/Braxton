import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ErrorState";
import { colors, radius } from "@/components/theme";
import { loadTodayCheckIn } from "@/lib/checkIn";
import {
  approveProgram,
  discardDraft,
  exerciseRpe,
  isoWeekday,
  loadCurrentProgram,
  loadProgramWorkouts,
  Program,
  ProgramDay,
  programWeek,
  ProgramWorkoutRef,
  requestProgram,
  startProgramDay,
  suggestedWeight,
  WEEKDAYS,
} from "@/lib/program";
import { loadLatestBaselines, Result } from "@/lib/training";

// The whole 4-week block. A draft can be approved or rewritten; an active
// program lets you open any day of the current week.
export default function ProgramScreen() {
  const [program, setProgram] = useState<Program | null>(null);
  const [baselines, setBaselines] = useState<Map<string, Result>>(new Map());
  const [done, setDone] = useState<ProgramWorkoutRef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([loadCurrentProgram(), loadLatestBaselines()])
      .then(async ([p, b]) => {
        setProgram(p);
        setBaselines(b);
        setDone(p ? await loadProgramWorkouts(p.id) : []);
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
  if (!program) {
    return <ErrorState message="No program yet. Build one from the Training card." onRetry={() => router.replace("/")} />;
  }

  const plan = program.plan;
  const isDraft = program.status === "draft";
  const week = isDraft ? 1 : Math.min(programWeek(program), 4);
  const today = isoWeekday();

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (e) {
      const message = (e as Error).message;
      Platform.OS === "web" ? window.alert(message) : Alert.alert("Something went wrong", message);
    } finally {
      setBusy(null);
    }
  };

  const approve = () =>
    run("approve", async () => {
      await approveProgram(program.id);
      router.canGoBack() ? router.back() : router.replace("/");
    });

  const rewrite = () =>
    run("rewrite", async () => {
      await discardDraft(program.id);
      await requestProgram();
      load();
    });

  const openDay = (day: ProgramDay) =>
    run(`day-${day.dayOfWeek}`, async () => {
      const checkIn = await loadTodayCheckIn();
      const id = await startProgramDay(program, week, day, checkIn);
      router.push(`/workout/${id}`);
    });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Text style={styles.back}>‹ Today</Text>
        </Pressable>
        <Text style={styles.kicker}>{isDraft ? "NEW PROGRAM · REVIEW" : `WEEK ${week} OF 4`}</Text>
        <Text style={styles.title}>{plan.name}</Text>
        <Text style={styles.body}>{plan.summary}</Text>

        <View style={styles.weeks}>
          {plan.weeks.map((w) => (
            <View key={w.week} style={[styles.week, !isDraft && w.week === week && styles.weekNow]}>
              <Text style={styles.weekLabel}>Week {w.week}</Text>
              <Text style={styles.weekFocus}>{w.focus}</Text>
            </View>
          ))}
        </View>

        {isDraft && (
          <>
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={!!busy} onPress={approve}>
              {busy === "approve" ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start this program</Text>}
            </Pressable>
            <Pressable style={styles.secondary} disabled={!!busy} onPress={rewrite}>
              {busy === "rewrite" ? (
                <View style={styles.row}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.body}>Writing a new program, this can take a minute…</Text>
                </View>
              ) : (
                <Text style={styles.secondaryText}>Write a different one</Text>
              )}
            </Pressable>
          </>
        )}

        {plan.days.map((day) => {
          const workout = done.find((w) => w.week === week && w.day === day.dayOfWeek);
          const isToday = !isDraft && day.dayOfWeek === today;
          return (
            <View key={day.dayOfWeek} style={[styles.card, isToday && styles.cardToday]}>
              <View style={styles.row}>
                <Text style={styles.dayName}>
                  {WEEKDAYS[day.dayOfWeek]}
                  {isToday ? " · Today" : ""}
                </Text>
                {workout?.status === "completed" && <Text style={styles.doneTag}>Done ✓</Text>}
              </View>
              <Text style={styles.dayTitle}>{day.title}</Text>
              {!!day.timing && <Text style={styles.muted}>{day.timing}</Text>}
              {day.exercises.map((ex) => {
                const rpe = exerciseRpe(ex, plan, week);
                const weight = suggestedWeight(ex, rpe, baselines);
                const prescription =
                  ex.kind === "conditioning"
                    ? `${ex.sets} × ${ex.target}`
                    : `${ex.sets} × ${ex.reps} @ RPE ${rpe}${weight ? ` · ~${weight} lb` : ""}`;
                return (
                  <View key={ex.id} style={styles.exercise}>
                    <Text style={styles.exName}>{ex.name}</Text>
                    <Text style={styles.exPrescription}>{prescription}</Text>
                  </View>
                );
              })}
              {!isDraft && (
                <Pressable
                  style={[styles.dayButton, workout?.status === "completed" && styles.dayButtonDone]}
                  disabled={!!busy}
                  onPress={() => openDay(day)}
                >
                  {busy === `day-${day.dayOfWeek}` ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {workout?.status === "completed" ? "View" : workout ? "Continue" : "Start"}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  muted: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  weeks: { flexDirection: "row", gap: 6 },
  week: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 8, gap: 2 },
  weekNow: { borderWidth: 1, borderColor: colors.accent },
  weekLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
  weekFocus: { color: colors.muted, fontSize: 11 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, gap: 6 },
  cardToday: { borderWidth: 1, borderColor: colors.accent },
  dayName: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  dayTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  doneTag: { color: colors.good, fontSize: 13, fontWeight: "700" },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 6 },
  exName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  exPrescription: { color: colors.muted, fontSize: 13 },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  dayButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  dayButtonDone: { backgroundColor: colors.line },
});
