import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { ErrorState } from "@/components/ErrorState";
import { SwapBox } from "@/components/SwapBox";
import { colors, fonts, radius } from "@/components/theme";
import { loadTodayCheckIn, useTodayCheckIn } from "@/lib/checkIn";
import {
  exerciseRpe,
  groupLabels,
  isoWeekday,
  loadProgram,
  loadProgramWorkouts,
  Program,
  programWeek,
  ProgramWorkoutRef,
  sessionLength,
  shortPrescription,
  startProgramDay,
  suggestedWeight,
  WEEKDAYS,
} from "@/lib/program";
import { readinessFrom } from "@/lib/readiness";
import { loadLatestBaselines, Result } from "@/lib/training";

// One day of the program: the exercises in short, tap one for the why and to
// swap it, and the button to start (or continue, or view) the workout.
export default function DayScreen() {
  const params = useLocalSearchParams<{ day: string; program: string }>();
  const dayOfWeek = Number(params.day);
  const [program, setProgram] = useState<Program | null>(null);
  const [baselines, setBaselines] = useState<Map<string, Result>>(new Map());
  const [workouts, setWorkouts] = useState<ProgramWorkoutRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;

  const load = useCallback(() => {
    setError(null);
    Promise.all([loadProgram(params.program), loadLatestBaselines(), loadProgramWorkouts(params.program)])
      .then(([p, b, w]) => {
        setProgram(p);
        setBaselines(b);
        setWorkouts(w);
      })
      .catch((e: Error) => setError(e.message));
  }, [params.program]);

  useFocusEffect(load);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!program) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const day = program.plan.days.find((d) => d.dayOfWeek === dayOfWeek);
  if (!day) return <ErrorState message="That day isn't in your program." onRetry={() => router.back()} />;

  const isActive = program.status === "active";
  const week = isActive ? Math.min(programWeek(program), 4) : 1;
  const isToday = isActive && dayOfWeek === isoWeekday();
  const workout = workouts.find((w) => w.week === week && w.day === dayOfWeek);
  const finished = workout?.status === "completed";
  const labels = groupLabels(day.exercises);
  const length = sessionLength(day.timing);

  const start = async () => {
    setStarting(true);
    try {
      const id = await startProgramDay(program, week, day, await loadTodayCheckIn());
      router.push(`/workout/${id}`);
    } catch (e) {
      const message = (e as Error).message;
      Platform.OS === "web" ? window.alert(message) : Alert.alert("Something went wrong", message);
    } finally {
      setStarting(false);
    }
  };

  const buttonLabel = finished
    ? "View workout"
    : workout?.status === "in_progress"
      ? "Continue workout"
      : "Start workout";
  const loud = isToday && !finished;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/training"))}
            accessibilityLabel="Back"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
              <Path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>

          <View style={styles.header}>
            <Text style={[styles.kicker, isToday && { color: tint }]}>
              {isToday ? "TODAY" : WEEKDAYS[dayOfWeek].toUpperCase()}
              {isActive ? ` · WEEK ${week}` : ""}
            </Text>
            <Text style={styles.title}>{day.title}</Text>
            <Text style={styles.meta}>
              {day.exercises.length} exercises{length ? ` · ${length}` : ""}
              {finished ? " · done" : ""}
            </Text>
          </View>

          {swapNote && <Text style={styles.note}>{swapNote}</Text>}

          <View style={styles.card}>
            {day.exercises.map((ex, i) => {
              const rpe = exerciseRpe(ex, program.plan, week);
              const weight = suggestedWeight(ex, rpe, baselines);
              const open = openEx === ex.id;
              return (
                <View key={ex.id} style={[styles.exercise, i > 0 && styles.exerciseLine]}>
                  <Pressable style={styles.exRow} onPress={() => setOpenEx(open ? null : ex.id)}>
                    <Text style={styles.label}>{labels[i] || ex.group?.trim() || ""}</Text>
                    <View style={styles.exText}>
                      <Text style={styles.exName} numberOfLines={open ? undefined : 1}>
                        {ex.name}
                      </Text>
                      <Text style={styles.exSets} numberOfLines={1}>
                        {shortPrescription(ex, rpe)}
                      </Text>
                    </View>
                    {weight > 0 && (
                      <Text style={[styles.exWeight, i === 0 && isToday && { color: tint }]}>
                        {weight}
                        <Text style={styles.exUnit}> lb</Text>
                      </Text>
                    )}
                  </Pressable>
                  {open && (
                    <View style={styles.more}>
                      {!!ex.purpose && <Text style={styles.purpose}>{ex.purpose}</Text>}
                      {ex.kind === "conditioning" && !!ex.target && <Text style={styles.purpose}>{ex.target}</Text>}
                      {!!ex.notes && <Text style={styles.purpose}>{ex.notes}</Text>}
                      <Pressable hitSlop={8} onPress={() => setSwapping(swapping === ex.id ? null : ex.id)}>
                        <Text style={styles.swap}>{swapping === ex.id ? "Cancel" : "Swap exercise"}</Text>
                      </Pressable>
                      {swapping === ex.id && (
                        <SwapBox
                          programId={program.id}
                          dayOfWeek={dayOfWeek}
                          exerciseId={ex.id}
                          exerciseName={ex.name}
                          onSwapped={(r) => {
                            setSwapping(null);
                            setOpenEx(null);
                            setSwapNote(`Swapped in ${r.name}.`);
                            load();
                          }}
                        />
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Tap an exercise for why it's there.{labels.some(Boolean) ? " Same letter = superset." : ""}
          </Text>
        </ScrollView>

        {isActive && (
          <View style={styles.footer}>
            <Pressable
              style={[styles.button, loud ? { backgroundColor: tint } : styles.buttonQuiet]}
              disabled={starting}
              onPress={start}
            >
              {starting ? (
                <ActivityIndicator color={loud ? colors.onAccent : colors.text} />
              ) : (
                <Text style={[styles.buttonText, !loud && styles.buttonTextQuiet]}>{buttonLabel}</Text>
              )}
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
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  header: { gap: 4 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  meta: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14 },
  note: { color: colors.soft, fontFamily: fonts.medium, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16 },
  exercise: { paddingVertical: 12, gap: 8 },
  exerciseLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  exRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { color: colors.faint, fontFamily: fonts.heavy, fontSize: 13, width: 22 },
  exText: { flex: 1, gap: 2 },
  exName: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  exSets: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  exWeight: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18, fontVariant: ["tabular-nums"] },
  exUnit: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  more: { paddingLeft: 34, gap: 6 },
  purpose: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  swap: { color: colors.soft, fontFamily: fonts.bold, fontSize: 13 },
  hint: { color: colors.faint, fontFamily: fonts.medium, fontSize: 12, textAlign: "center" },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.line },
  button: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  buttonQuiet: { backgroundColor: colors.raised },
  buttonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 17 },
  buttonTextQuiet: { color: colors.text },
});
