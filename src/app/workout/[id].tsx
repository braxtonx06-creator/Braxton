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
import Svg, { Path } from "react-native-svg";

import { ErrorState } from "@/components/ErrorState";
import { SwapBox } from "@/components/SwapBox";
import { RestTimer } from "@/components/RestTimer";
import { colors, fonts, radius } from "@/components/theme";
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
import { loadTodayCheckIn, useTodayCheckIn } from "@/lib/checkIn";
import { groupLabels, refreshWorkoutFromProgram, WEEKDAYS_SHORT } from "@/lib/program";
import { readinessFrom } from "@/lib/readiness";

const fmtRest = (s: number) =>
  s >= 60 && s % 60 === 0
    ? `${s / 60} min`
    : s >= 60
      ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      : `${s} s`;

// The instructions repeat the target already shown under the name, so drop it.
function notesOnly(ex: { instructions?: string; sets: { target: string }[] }) {
  const target = ex.sets[0]?.target ?? "";
  const text = ex.instructions ?? "";
  if (!target || !text.startsWith(target)) return text;
  return text.slice(target.length).replace(/^[.\s]+/, "");
}

// One block of the session: a single exercise, or a superset done back to back.
type Block = { exercises: { ex: PlanExercise; label: string }[]; superset: boolean };

function toBlocks(exercises: PlanExercise[]): Block[] {
  const labels = groupLabels(exercises);
  const blocks: Block[] = [];
  exercises.forEach((ex, i) => {
    const last = blocks[blocks.length - 1];
    if (labels[i] && last?.superset && last.exercises[0].ex.group === ex.group) {
      last.exercises.push({ ex, label: labels[i] });
    } else {
      blocks.push({ exercises: [{ ex, label: labels[i] }], superset: !!labels[i] });
    }
  });
  return blocks;
}

function blockName(block: Block, index: number, count: number) {
  if (block.superset) return `SUPERSET × ${block.exercises[0].ex.sets.length}`;
  const measure = block.exercises.every(({ ex }) => ex.kind === "measure");
  if (measure && index === count - 1 && count > 1) return "FINISHER";
  if (measure) return "CONDITIONING";
  return index === 0 ? "MAIN LIFT" : "ACCESSORY";
}

// The whole workout on one screen, in blocks (A main lift, B superset, C
// finisher). Fill in what you did as you go: ticking a set saves it and starts
// the rest timer. One big button at the bottom starts and finishes it.
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
  const { checkIn } = useTodayCheckIn();

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

  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!workout) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const completed = workout.status === "completed";
  const blocks = toBlocks(workout.plan.exercises);
  // Program exercises can be swapped until you've logged a set of them.
  const canSwap = (ex: PlanExercise) =>
    !completed &&
    workout.kind === "program" &&
    !!workout.program_id &&
    !ex.sets.some((_, i) => wasPerformed(log[setKey(ex.id, i)]));
  const totalSets = workout.plan.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const doneSets = Object.values(log).filter(wasPerformed).length;
  const notStarted = !started.current && doneSets === 0;

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

  // Marks the workout started (saves the start time) without logging anything.
  const start = () => {
    persist(log, true);
    setWorkout({ ...workout, status: "in_progress" });
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

  const kicker =
    workout.kind === "test"
      ? "TESTING WORKOUT"
      : [
          workout.program_day ? WEEKDAYS_SHORT[workout.program_day].toUpperCase() : "",
          `WEEK ${workout.program_week ?? ""}`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityLabel="Back"
          >
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.text}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M15 6l-6 6 6 6" />
            </Svg>
          </Pressable>

          <View style={styles.header}>
            <Text style={[styles.kicker, { color: tint }]}>{kicker}</Text>
            <Text style={styles.title}>{workout.plan.title}</Text>
            <View style={styles.meta}>
              <Text style={styles.metaText}>{workout.plan.exercises.length} exercises</Text>
              <Text style={styles.metaText}>
                {completed || notStarted ? `${totalSets} sets` : `${doneSets} of ${totalSets} sets done`}
              </Text>
            </View>
            {!completed && !!workout.plan.intro && <Text style={styles.intro}>{workout.plan.intro}</Text>}
          </View>

          {results && <ResultsCard results={results} kind={workout.kind} tint={tint} />}

          {swapNote && <Text style={styles.note}>{swapNote}</Text>}

          {blocks.map((block, b) => {
            const first = block.exercises[0].ex;
            const rest = first.restSeconds;
            return (
              <View key={first.id} style={styles.block}>
                <View style={styles.blockHead}>
                  <Text style={styles.blockName}>
                    {String.fromCharCode(65 + b)} · {blockName(block, b, blocks.length)}
                  </Text>
                  {rest > 0 && (
                    <Text style={styles.blockRest}>
                      rest {fmtRest(rest)}
                      {block.superset ? " after the round" : ""}
                    </Text>
                  )}
                </View>

                {block.exercises.map(({ ex, label }, n) => {
                  const top = Math.max(0, ...ex.sets.map((s) => s.suggestedWeight));
                  // Test workouts have different targets per set (warm-ups, a top set), so show each one.
                  const varied = ex.sets.some((s) => s.target !== ex.sets[0].target);
                  const active = !completed && activeExercise === ex.id;
                  return (
                    <View
                      key={ex.id}
                      style={[styles.exercise, n > 0 && styles.exerciseNext, active && styles.exerciseActive]}
                    >
                      <View style={styles.exHeader}>
                        <View style={styles.exText}>
                          <Text style={styles.exName}>
                            {label ? <Text style={styles.group}>{label} </Text> : null}
                            {ex.name}
                          </Text>
                          <Text style={styles.exTarget}>
                            {varied
                              ? `${ex.sets.length} sets`
                              : ex.sets.length === 1
                                ? ex.sets[0]?.target
                                : `${ex.sets.length} × ${ex.sets[0]?.target}`}
                          </Text>
                        </View>
                        {top > 0 && (
                          <Text style={[styles.exWeight, b === 0 && { color: tint }]}>
                            {top}
                            <Text style={styles.exUnit}> lb</Text>
                          </Text>
                        )}
                      </View>
                      {!completed && !!ex.purpose && <Text style={styles.purpose}>{ex.purpose}</Text>}
                      {!completed && !!notesOnly(ex) && <Text style={styles.instructions}>{notesOnly(ex)}</Text>}
                      {canSwap(ex) && (
                        <Pressable hitSlop={8} onPress={() => setSwapping(swapping === ex.id ? null : ex.id)}>
                          <Text style={styles.swap}>{swapping === ex.id ? "Cancel" : "Swap"}</Text>
                        </Pressable>
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
                      {ex.sets.map((set, i) => {
                        const key = setKey(ex.id, i);
                        const entry = log[key] ?? {};
                        return (
                          <View key={key} style={styles.setRow}>
                            {varied && (
                              <Text style={styles.setTarget}>
                                <Text style={[styles.setTargetLabel, set.isTest && { color: tint }]}>{set.label}</Text>
                                {"  "}
                                {set.target}
                              </Text>
                            )}
                            <View style={styles.inputs}>
                              <View style={[styles.boxes, entry.done && styles.setDone]}>
                                {!varied && <Text style={styles.setLabel}>{i + 1}</Text>}
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
                                    label={/sec/i.test(ex.unit) ? "time" : ex.unit}
                                    value={entry.value}
                                    placeholder={/sec/i.test(ex.unit) ? "m:ss" : "–"}
                                    allowTime={/sec/i.test(ex.unit)}
                                    wide
                                    editable={!completed}
                                    onFocus={() => setActiveExercise(ex.id)}
                                    onChange={(t) => update(key, { value: t })}
                                  />
                                )}
                              </View>
                              <Pressable
                                style={[styles.doneButton, entry.done && { backgroundColor: tint, borderColor: tint }]}
                                disabled={completed}
                                onPress={() => toggleDone(ex, i)}
                                accessibilityLabel={`${ex.name} ${set.label} done`}
                              >
                                <Svg
                                  width={20}
                                  height={20}
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke={entry.done ? colors.onAccent : colors.faint}
                                  strokeWidth={3}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <Path d="M5 12.5l4.5 4.5L19 7.5" />
                                </Svg>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })}

          {saveError && <Text style={styles.error}>{saveError}</Text>}

          <Text style={styles.footnote}>
            RPE = how hard the set was: 10 is nothing left, 9 is one rep left in the tank, 8 is two left.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {!completed && (
        <View style={styles.bottom}>
          <Pressable
            style={[styles.bigButton, { backgroundColor: tint }]}
            disabled={finishing}
            onPress={notStarted ? start : finish}
          >
            {finishing ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.bigButtonText}>
                {notStarted ? "Start workout" : workout.kind === "test" ? "Finish test" : "Finish workout"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
      <RestTimer endsAt={restEndsAt} onChange={setRestEndsAt} tint={tint} bottom={completed ? 24 : 112} />
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
        placeholderTextColor={colors.faint}
        keyboardType={allowTime ? "numbers-and-punctuation" : "decimal-pad"}
        editable={editable}
        selectTextOnFocus
        onFocus={onFocus}
      />
      <Text style={styles.boxLabel}>{label}</Text>
    </View>
  );
}

function ResultsCard({ results, kind, tint }: { results: Result[]; kind: Workout["kind"]; tint: string }) {
  return (
    <View style={[styles.results, { borderColor: tint }]}>
      <Text style={[styles.kicker, { color: tint }]}>YOUR NUMBERS</Text>
      {results.length ? (
        results.map((r) => {
          const shown = formatResult(r.value, r.unit);
          return (
            <View key={r.metric} style={styles.resultRow}>
              <View style={{ flexShrink: 1, gap: 2 }}>
                <View style={styles.resultNameRow}>
                  <Text style={styles.resultName}>{r.name}</Text>
                  {r.isPR && <Text style={[styles.pr, { backgroundColor: tint }]}>PR</Text>}
                </View>
                {r.previous !== undefined && (
                  <Text style={styles.resultWas}>was {formatResult(r.previous, r.unit).value}</Text>
                )}
              </View>
              <Text style={styles.resultValue}>
                {shown.value}
                <Text style={styles.resultUnit}> {shown.unit}</Text>
              </Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.resultWas}>No sets were ticked, so there are no numbers yet.</Text>
      )}
      <Text style={styles.resultWas}>
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
  content: { padding: 20, gap: 14, paddingBottom: 200 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  header: { gap: 6 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  meta: { flexDirection: "row", gap: 14 },
  metaText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  intro: { color: colors.soft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  note: { color: colors.soft, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },

  block: { backgroundColor: colors.card, borderRadius: radius, overflow: "hidden" },
  blockHead: {
    backgroundColor: colors.raised,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  blockName: { color: colors.text, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1 },
  blockRest: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },

  exercise: { padding: 16, gap: 8, borderWidth: 1, borderColor: "transparent" },
  exerciseNext: { borderTopColor: colors.line },
  exerciseActive: { borderColor: colors.faint },
  exHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  exText: { flexShrink: 1, gap: 3 },
  exName: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  group: { color: colors.muted, fontFamily: fonts.heavy },
  exTarget: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  exWeight: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 30,
    lineHeight: 34,
    fontVariant: ["tabular-nums"],
  },
  exUnit: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  purpose: { color: colors.soft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  instructions: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  swap: { color: colors.soft, fontFamily: fonts.bold, fontSize: 13 },

  setRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  setDone: { opacity: 0.6 },
  setLabel: { color: colors.faint, fontFamily: fonts.heavy, fontSize: 14, width: 14, textAlign: "center" },
  setTarget: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, width: "100%" },
  setTargetLabel: { color: colors.text, fontFamily: fonts.bold },
  inputs: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center" },
  boxes: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center" },
  box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  boxWide: { flex: 3 },
  boxInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.heavy,
    fontSize: 18,
    paddingVertical: 11,
    minWidth: 0,
  },
  boxLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  doneButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  footnote: { color: colors.faint, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 14 },

  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  bigButton: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  bigButtonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 17, letterSpacing: 0.3 },

  results: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 12, borderWidth: 1 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  resultNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultName: { color: colors.text, fontFamily: fonts.bold, fontSize: 16, flexShrink: 1 },
  pr: {
    color: colors.onAccent,
    fontFamily: fonts.black,
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  resultWas: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  resultValue: { color: colors.text, fontFamily: fonts.black, fontSize: 26, fontVariant: ["tabular-nums"] },
  resultUnit: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
});
