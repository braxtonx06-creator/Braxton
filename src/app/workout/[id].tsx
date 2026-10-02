import { router, useLocalSearchParams } from "expo-router";
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

import { ErrorState } from "@/components/ErrorState";
import { SwapBox } from "@/components/SwapBox";
import { RestTimer } from "@/components/RestTimer";
import { colors, radius } from "@/components/theme";
import {
  completeWorkout,
  computeResults,
  formatResult,
  loadWorkout,
  PlanExercise,
  Result,
  saveWorkoutLog,
  SetLog,
  setKey,
  Workout,
  WorkoutLog,
  wasPerformed,
} from "@/lib/training";
import { loadTodayCheckIn } from "@/lib/checkIn";
import { groupLabels, refreshWorkoutFromProgram } from "@/lib/program";

// The whole workout on one screen: every exercise and set is visible, and you
// fill in what you did as you go. Ticking a set saves it and starts the rest timer.
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [log, setLog] = useState<WorkoutLog>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  // The exercise being typed into gets highlighted, so numbers land in the right card.
  const [activeExercise, setActiveExercise] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const started = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    loadWorkout(id)
      .then((w) => {
        setWorkout(w);
        setLog(w.log ?? {});
        started.current = w.status !== "planned";
        if (w.status === "completed") setResults(w.results ?? computeResults(w.plan, w.log));
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id]);

  useEffect(load, [load]);

  // Save shortly after typing stops, and right away when a set is ticked.
  const persist = useCallback(
    (next: WorkoutLog, immediately: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const run = () => {
        const first = !started.current;
        started.current = true;
        saveWorkoutLog(id, next, first)
          .then(() => setSaveError(null))
          .catch((e: Error) => setSaveError(`Not saved: ${e.message}`));
      };
      if (immediately) run();
      else saveTimer.current = setTimeout(run, 800);
    },
    [id],
  );

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!workout) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const completed = workout.status === "completed";
  const labels = groupLabels(workout.plan.exercises);
  // Program exercises can be swapped until you've logged a set of them.
  const canSwap = (ex: PlanExercise) =>
    !completed &&
    workout.kind === "program" &&
    !!workout.program_id &&
    !ex.sets.some((_, i) => wasPerformed(log[setKey(ex.id, i)]));
  const totalSets = workout.plan.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const doneSets = Object.values(log).filter(wasPerformed).length;

  const update = (key: string, patch: Partial<SetLog>, immediately = false) => {
    const next = { ...log, [key]: { ...log[key], ...patch } };
    setLog(next);
    persist(next, immediately);
  };

  const toggleDone = (ex: PlanExercise, index: number) => {
    const key = setKey(ex.id, index);
    const set = ex.sets[index];
    const entry = log[key] ?? {};
    if (entry.done) return update(key, { done: false }, true);
    // Blank boxes count as the suggestion, so tapping ✓ on a set done as written is enough.
    update(
      key,
      {
        done: true,
        weight: entry.weight || (set.suggestedWeight ? String(set.suggestedWeight) : entry.weight),
        reps: entry.reps || (set.targetReps ? String(set.targetReps) : entry.reps),
      },
      true,
    );
    if (ex.restSeconds > 0) setRestEndsAt(Date.now() + ex.restSeconds * 1000);
  };

  const finish = async () => {
    const doIt = async () => {
      setFinishing(true);
      try {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const r = await completeWorkout(workout, log);
        setResults(r);
        setWorkout({ ...workout, status: "completed" });
        setRestEndsAt(null);
        setActiveExercise(null);
      } catch (e) {
        setSaveError(`Couldn't finish: ${(e as Error).message}`);
      } finally {
        setFinishing(false);
      }
    };
    const message = !computeResults(workout.plan, log).length
      ? "Nothing is logged yet, so this won't save any numbers. Finish anyway?"
      : doneSets < totalSets
        ? `You've logged ${doneSets} of ${totalSets} sets. Finish anyway?`
        : "Save your results?";
    if (Platform.OS === "web") {
      if (window.confirm(message)) doIt();
      return;
    }
    Alert.alert("Finish workout", message, [
      { text: "Keep going", style: "cancel" },
      { text: "Finish", onPress: doIt },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.kicker}>
            {workout.kind === "test" ? "TESTING WORKOUT" : `WEEK ${workout.program_week ?? ""} WORKOUT`}
          </Text>
          <Text style={styles.title}>{workout.plan.title}</Text>
          {!completed && <Text style={styles.muted}>{workout.plan.intro}</Text>}

          {results && <ResultsCard results={results} kind={workout.kind} />}

          {!completed && (
            <Text style={styles.progress}>
              {doneSets} of {totalSets} sets done
            </Text>
          )}

          {swapNote && <Text style={styles.note}>{swapNote}</Text>}

          {workout.plan.exercises.map((ex, exIndex) => (
            <View key={ex.id} style={[styles.card, !completed && activeExercise === ex.id && styles.cardActive]}>
              <View style={styles.exHeader}>
                <Text style={styles.exName}>
                  {labels[exIndex] ? <Text style={styles.group}>{labels[exIndex]} </Text> : null}
                  {ex.name}
                </Text>
                {canSwap(ex) && (
                  <Pressable hitSlop={8} onPress={() => setSwapping(swapping === ex.id ? null : ex.id)}>
                    <Text style={styles.swap}>{swapping === ex.id ? "Cancel" : "Swap"}</Text>
                  </Pressable>
                )}
              </View>
              {!completed && !!ex.purpose && <Text style={styles.purpose}>{ex.purpose}</Text>}
              {!completed && <Text style={styles.instructions}>{ex.instructions}</Text>}
              {labels[exIndex] && !completed && (
                <Text style={styles.rest}>
                  Superset {ex.group}: alternate with the other {ex.group} exercise{labels.filter((l) => l.startsWith(ex.group ?? "")).length > 2 ? "s" : ""}, rest after the round
                </Text>
              )}
              {swapping === ex.id && workout.program_id && workout.program_day && (
                <SwapBox
                  programId={workout.program_id}
                  dayOfWeek={workout.program_day}
                  exerciseId={ex.id}
                  exerciseName={ex.name}
                  onSwapped={async (r) => {
                    setSwapping(null);
                    setSwapNote(`Swapped in ${r.name}. ${r.why}`);
                    await refreshWorkoutFromProgram(workout, await loadTodayCheckIn());
                    load();
                  }}
                />
              )}
              {ex.restSeconds > 0 && !completed && (
                <Text style={styles.rest}>
                  Rest {Math.floor(ex.restSeconds / 60)}:{String(ex.restSeconds % 60).padStart(2, "0")} between sets
                </Text>
              )}
              {ex.sets.map((set, i) => {
                const key = setKey(ex.id, i);
                const entry = log[key] ?? {};
                return (
                  <View key={key} style={[styles.setRow, entry.done && styles.setDone]}>
                    <View style={styles.setHeader}>
                      <Text style={[styles.setLabel, set.isTest && styles.testLabel]}>{set.label}</Text>
                      <Text style={styles.setTarget}>{set.target}</Text>
                    </View>
                    <View style={styles.inputs}>
                      {ex.kind === "strength" ? (
                        <>
                          <NumberBox
                            label="lb"
                            value={entry.weight}
                            placeholder={set.suggestedWeight ? String(set.suggestedWeight) : "–"}
                            editable={!completed}
                            onFocus={() => setActiveExercise(ex.id)}
                            onChange={(t) => update(key, { weight: t })}
                          />
                          <NumberBox
                            label="reps"
                            value={entry.reps}
                            placeholder={set.targetReps ? String(set.targetReps) : "–"}
                            editable={!completed}
                            onFocus={() => setActiveExercise(ex.id)}
                            onChange={(t) => update(key, { reps: t })}
                          />
                          <NumberBox
                            label="RPE"
                            value={entry.rpe}
                            placeholder={set.isTest ? "9" : "–"}
                            editable={!completed}
                            onFocus={() => setActiveExercise(ex.id)}
                            onChange={(t) => update(key, { rpe: t })}
                          />
                        </>
                      ) : (
                        <NumberBox
                          label={ex.unit}
                          value={entry.value}
                          placeholder={/sec/i.test(ex.unit) ? "m:ss" : "–"}
                          allowTime={/sec/i.test(ex.unit)}
                          wide
                          editable={!completed}
                          onFocus={() => setActiveExercise(ex.id)}
                            onChange={(t) => update(key, { value: t })}
                        />
                      )}
                      <Pressable
                        style={[styles.doneButton, entry.done && styles.doneButtonOn]}
                        disabled={completed}
                        onPress={() => toggleDone(ex, i)}
                        accessibilityLabel={`${ex.name} ${set.label} done`}
                      >
                        <Text style={[styles.doneText, entry.done && styles.doneTextOn]}>✓</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {saveError && <Text style={styles.error}>{saveError}</Text>}

          {!completed && (
            <Pressable style={[styles.finish, finishing && styles.disabled]} disabled={finishing} onPress={finish}>
              {finishing ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.finishText}>{workout.kind === "test" ? "Finish test" : "Finish workout"}</Text>
              )}
            </Pressable>
          )}
          <Text style={styles.muted}>
            RPE = how hard the set was: 10 is nothing left, 9 is one rep left in the tank, 8 is two left.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <RestTimer endsAt={restEndsAt} onChange={setRestEndsAt} />
    </SafeAreaView>
  );
}

function NumberBox({
  label,
  value,
  placeholder,
  editable,
  wide,
  allowTime,
  onFocus,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder: string;
  editable: boolean;
  wide?: boolean;
  allowTime?: boolean;
  onFocus?: () => void;
  onChange: (text: string) => void;
}) {
  return (
    <View style={[styles.box, wide && styles.boxWide]}>
      <TextInput
        style={styles.boxInput}
        value={value ?? ""}
        onChangeText={(t) => onChange(t.replace(allowTime ? /[^0-9.,:]/g : /[^0-9.,]/g, ""))}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={allowTime ? "numbers-and-punctuation" : "decimal-pad"}
        editable={editable}
        selectTextOnFocus
        onFocus={onFocus}
      />
      <Text style={styles.boxLabel}>{label}</Text>
    </View>
  );
}

function ResultsCard({ results, kind }: { results: Result[]; kind: Workout["kind"] }) {
  return (
    <View style={[styles.card, styles.resultsCard]}>
      <Text style={styles.kicker}>YOUR NUMBERS</Text>
      {results.length ? (
        results.map((r) => {
          const shown = formatResult(r.value, r.unit);
          return (
            <View key={r.metric} style={styles.resultRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.resultName}>
                  {r.name} {r.isPR && <Text style={styles.pr}> PR </Text>}
                </Text>
                {r.previous !== undefined && (
                  <Text style={styles.muted}>was {formatResult(r.previous, r.unit).value}</Text>
                )}
              </View>
              <Text style={styles.resultValue}>
                {shown.value} <Text style={styles.resultUnit}>{shown.unit}</Text>
              </Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.muted}>No sets were ticked, so there are no numbers yet.</Text>
      )}
      <Text style={styles.muted}>
        {kind === "test"
          ? "Your coach will build your program from these."
          : "PRs raise the weights your program suggests from now on."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12, paddingBottom: 140 },
  back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  progress: { color: colors.text, fontSize: 14, fontWeight: "700" },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, gap: 8 },
  exName: { color: colors.text, fontSize: 19, fontWeight: "800", flexShrink: 1 },
  exHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  group: { color: colors.accent, fontWeight: "800" },
  swap: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  purpose: { color: colors.text, fontSize: 14, lineHeight: 20 },
  note: { color: colors.good, fontSize: 14, lineHeight: 20 },
  instructions: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  rest: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  setRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8, gap: 6 },
  setDone: { opacity: 0.55 },
  setHeader: { flexDirection: "row", gap: 8, alignItems: "baseline", flexWrap: "wrap" },
  setLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  testLabel: { color: colors.accent },
  setTarget: { color: colors.muted, fontSize: 13, flexShrink: 1 },
  inputs: { flexDirection: "row", gap: 8, alignItems: "center" },
  box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  boxWide: { flex: 3 },
  boxInput: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "700", paddingVertical: 10, minWidth: 0 },
  boxLabel: { color: colors.muted, fontSize: 12 },
  doneButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonOn: { backgroundColor: colors.good, borderColor: colors.good },
  doneText: { color: colors.muted, fontSize: 20, fontWeight: "800" },
  doneTextOn: { color: "#0E0F12" },
  finish: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  finishText: { color: colors.onAccent, fontSize: 17, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  error: { color: "#F87171", fontSize: 14 },
  resultsCard: { borderWidth: 1, borderColor: colors.accent },
  cardActive: { borderWidth: 1, borderColor: colors.accent },
  pr: { color: "#0E0F12", backgroundColor: colors.good, fontSize: 12, fontWeight: "800", overflow: "hidden" },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  resultName: { color: colors.text, fontSize: 16, fontWeight: "600", flexShrink: 1 },
  resultValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  resultUnit: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
