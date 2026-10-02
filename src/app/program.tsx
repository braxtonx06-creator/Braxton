import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

import { ErrorState } from "@/components/ErrorState";
import { SwapBox } from "@/components/SwapBox";
import { WeekCard } from "@/components/WeekCard";
import { colors, radius } from "@/components/theme";
import { loadTodayCheckIn } from "@/lib/checkIn";
import {
  approveProgram,
  describeExercise,
  discardProgram,
  exerciseRpe,
  groupLabels,
  isoWeekday,
  loadProgramState,
  loadProgramWorkouts,
  Program,
  ProgramDay,
  programWeek,
  ProgramWorkoutRef,
  requestProgram,
  requestRevision,
  startProgramDay,
  suggestedWeight,
  waitForProgram,
  WEEKDAYS,
} from "@/lib/program";
import { loadLatestBaselines, Result } from "@/lib/training";

// The 4-week block: review a new or revised program, see why everything is
// there, swap exercises, chat with the coach about changes, and open any day
// of the current week.
export default function ProgramScreen() {
  const [active, setActive] = useState<Program | null>(null);
  const [pending, setPending] = useState<Program | null>(null);
  const [baselines, setBaselines] = useState<Map<string, Result>>(new Map());
  const [done, setDone] = useState<ProgramWorkoutRef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null); // "day:exerciseId"
  const [swapNote, setSwapNote] = useState<string | null>(null);
  // The coach needs the user's week before it can swap or revise anything.
  const [weekSet, setWeekSet] = useState<boolean | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([loadProgramState(), loadLatestBaselines()])
      .then(async ([state, b]) => {
        setActive(state.active);
        setPending(state.pending);
        setBaselines(b);
        setDone(state.active ? await loadProgramWorkouts(state.active.id) : []);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(load);

  // While the coach is writing, check back until it's done.
  const generatingId = pending?.status === "generating" ? pending.id : null;
  useEffect(() => {
    if (!generatingId) return;
    let cancelled = false;
    waitForProgram(generatingId)
      .catch(() => {}) // a failure shows up as the program's 'failed' status
      .finally(() => !cancelled && load());
    return () => {
      cancelled = true;
    };
  }, [generatingId, load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!loaded) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

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

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // ----- Being written -----
  if (pending?.status === "generating") {
    return (
      <Screen onBack={back}>
        <Text style={styles.kicker}>{pending.revision_of ? "REVISING" : "NEW PROGRAM"}</Text>
        <Text style={styles.title}>{pending.revision_of ? "Revising your program" : "Writing your program"}</Text>
        {pending.request && <Text style={styles.quote}>"{pending.request}"</Text>}
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.body}>
            Your coach is building every day around your schedule and the science behind it. This takes a minute or two;
            you can leave this screen.
          </Text>
        </View>
      </Screen>
    );
  }

  // ----- Failed -----
  if (pending?.status === "failed") {
    const retry = () =>
      run("retry", async () => {
        await discardProgram(pending.id);
        if (pending.revision_of && pending.request) await requestRevision(pending.revision_of, pending.request);
        else await requestProgram();
        load();
      });
    return (
      <Screen onBack={back}>
        <Text style={styles.kicker}>PROGRAM</Text>
        <Text style={styles.title}>That didn't work</Text>
        <Text style={styles.body}>{pending.error ?? "The coach couldn't write the program."}</Text>
        <Button label="Try again" busy={busy === "retry"} onPress={retry} />
        <Pressable
          style={styles.secondary}
          onPress={() => run("dismiss", async () => (await discardProgram(pending.id), load()))}
        >
          <Text style={styles.secondaryText}>Dismiss</Text>
        </Pressable>
      </Screen>
    );
  }

  const program = pending?.status === "draft" ? pending : active;
  if (!program) {
    return <ErrorState message="No program yet. Build one from the Training card." onRetry={() => router.replace("/")} />;
  }

  const plan = program.plan;
  const isDraft = program.status === "draft";
  const isRevision = !!program.revision_of;
  const week = program.status === "active" ? Math.min(programWeek(program), 4) : 1;
  const today = isoWeekday();

  const approve = () =>
    run("approve", async () => {
      await approveProgram(program);
      if (isRevision) load();
      else back();
    });

  const rewrite = () =>
    run("rewrite", async () => {
      await discardProgram(program.id);
      if (!isRevision) await requestProgram();
      load();
    });

  const openDay = (day: ProgramDay) =>
    run(`day-${day.dayOfWeek}`, async () => {
      const checkIn = await loadTodayCheckIn();
      const id = await startProgramDay(program, week, day, checkIn);
      router.push(`/workout/${id}`);
    });

  return (
    <Screen onBack={back}>
      <Text style={styles.kicker}>
        {isRevision ? "REVISED PROGRAM · REVIEW" : isDraft ? "NEW PROGRAM · REVIEW" : `WEEK ${week} OF 4`}
      </Text>
      <Text style={styles.title}>{plan.name}</Text>
      <Text style={styles.body}>{plan.summary}</Text>
      <Pressable hitSlop={8} onPress={() => router.push("/goals")}>
        <Text style={styles.link}>Edit my goals ›</Text>
      </Pressable>
      {swapNote && <Text style={styles.note}>{swapNote}</Text>}
      {weekSet === false && (
        <Text style={styles.warn}>Set your week below first: your coach needs your lifting and MMA days to swap or change anything.</Text>
      )}

      {isRevision && (
        <View style={[styles.card, styles.cardAccent]}>
          <Text style={styles.cardTitle}>WHAT CHANGED</Text>
          {program.request && <Text style={styles.quote}>You asked: "{program.request}"</Text>}
          {(plan.changes ?? []).map((c, i) => (
            <Text key={i} style={styles.bullet}>
              • {c}
            </Text>
          ))}
        </View>
      )}

      {!!plan.rationale?.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WHY THIS BLOCK WORKS</Text>
          {plan.rationale.map((r, i) => (
            <Text key={i} style={styles.bullet}>
              • {r}
            </Text>
          ))}
        </View>
      )}

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
          <Button
            label={isRevision ? "Use the revised program" : "Start this program"}
            busy={busy === "approve"}
            onPress={approve}
          />
          <Pressable style={styles.secondary} disabled={!!busy} onPress={rewrite}>
            <Text style={styles.secondaryText}>{isRevision ? "Keep my current program" : "Write a different one"}</Text>
          </Pressable>
        </>
      )}

      {plan.days.map((day) => {
        const workout = done.find((w) => w.week === week && w.day === day.dayOfWeek);
        const isToday = program.status === "active" && day.dayOfWeek === today;
        const labels = groupLabels(day.exercises);
        return (
          <View key={day.dayOfWeek} style={[styles.card, isToday && styles.cardAccent]}>
            <View style={styles.row}>
              <Text style={styles.dayName}>
                {WEEKDAYS[day.dayOfWeek]}
                {isToday ? " · Today" : ""}
              </Text>
              {workout?.status === "completed" && <Text style={styles.doneTag}>Done ✓</Text>}
            </View>
            <Text style={styles.dayTitle}>{day.title}</Text>
            {!!day.timing && <Text style={styles.muted}>{day.timing}</Text>}
            {!!day.purpose && <Text style={styles.purpose}>{day.purpose}</Text>}
            {day.exercises.map((ex, i) => {
              const rpe = exerciseRpe(ex, plan, week);
              const key = `${day.dayOfWeek}:${ex.id}`;
              return (
                <View key={ex.id} style={styles.exercise}>
                  <View style={styles.row}>
                    <Text style={styles.exName}>
                      {labels[i] ? <Text style={styles.group}>{labels[i]} </Text> : null}
                      {ex.name}
                    </Text>
                    <Pressable hitSlop={8} onPress={() => setSwapping(swapping === key ? null : key)}>
                      <Text style={styles.link}>{swapping === key ? "Cancel" : "Swap"}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.exPrescription}>
                    {describeExercise(ex, rpe, suggestedWeight(ex, rpe, baselines))}
                  </Text>
                  {!!ex.purpose && <Text style={styles.exPurpose}>{ex.purpose}</Text>}
                  {swapping === key && (
                    <SwapBox
                      programId={program.id}
                      dayOfWeek={day.dayOfWeek}
                      exerciseId={ex.id}
                      exerciseName={ex.name}
                      onSwapped={(r) => {
                        setSwapping(null);
                        setSwapNote(`Swapped in ${r.name}. ${r.why}`);
                        load();
                      }}
                    />
                  )}
                </View>
              );
            })}
            {labels.some(Boolean) && (
              <Text style={styles.muted}>Same letter = superset: alternate the exercises, rest after the round.</Text>
            )}
            {program.status === "active" && (
              <Pressable
                style={[styles.dayButton, workout?.status === "completed" && styles.dayButtonDone]}
                disabled={!!busy}
                onPress={() => openDay(day)}
              >
                {busy === `day-${day.dayOfWeek}` ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {workout?.status === "completed" ? "View" : workout?.status === "in_progress" ? "Continue" : "Start"}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        );
      })}

      <WeekCard onChange={(w) => setWeekSet(w.liftDays.length > 0)} />

      {!isRevision && program.status === "active" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WANT SOMETHING CHANGED?</Text>
          <Text style={styles.muted}>
            Talk it through with your coach: too much with class, a different split, more conditioning, shorter
            sessions... If you agree on a change, you'll review the rewritten program before it replaces this one.
          </Text>
          <Button label="Chat with your coach" disabled={weekSet === false} onPress={() => router.push("/chat")} />
        </View>
      )}
    </Screen>
  );
}

function Screen({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={onBack}>
            <Text style={styles.back}>‹ Today</Text>
          </Pressable>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Button({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.button, (busy || disabled) && styles.disabled]} disabled={busy || disabled} onPress={onPress}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
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
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  quote: { color: colors.text, fontSize: 14, fontStyle: "italic" },
  note: { color: colors.good, fontSize: 14, lineHeight: 20 },
  warn: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  bullet: { color: colors.text, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  weeks: { flexDirection: "row", gap: 6 },
  week: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 8, gap: 2 },
  weekNow: { borderWidth: 1, borderColor: colors.accent },
  weekLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
  weekFocus: { color: colors.muted, fontSize: 11 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, gap: 6 },
  cardAccent: { borderWidth: 1, borderColor: colors.accent },
  cardTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  dayName: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  dayTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  purpose: { color: colors.text, fontSize: 14, lineHeight: 20 },
  doneTag: { color: colors.good, fontSize: 13, fontWeight: "700" },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8, gap: 2 },
  exName: { color: colors.text, fontSize: 15, fontWeight: "700", flexShrink: 1 },
  group: { color: colors.accent, fontWeight: "800" },
  exPrescription: { color: colors.text, fontSize: 13 },
  exPurpose: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 15, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  dayButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  dayButtonDone: { backgroundColor: colors.line },
});
