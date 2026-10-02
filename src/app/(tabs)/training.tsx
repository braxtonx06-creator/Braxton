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
import Svg, { Path } from "react-native-svg";

import { ErrorState } from "@/components/ErrorState";
import { SwapBox } from "@/components/SwapBox";
import { WeekCard } from "@/components/WeekCard";
import { colors, disabledFill, disabledText, fonts, radius } from "@/components/theme";
import { loadTodayCheckIn, useTodayCheckIn } from "@/lib/checkIn";
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
  WEEKDAYS_SHORT,
} from "@/lib/program";
import { readinessFrom } from "@/lib/readiness";
import { loadLatestBaselines, Result } from "@/lib/training";

const isDeload = (focus: string) => /deload/i.test(focus);

// The 4-week block as a training board: where you are in the block, this
// week's days, and a card per session. Today's card is open and lit in
// today's readiness color; tap any other card to see its exercises, swap one,
// or start it. New and revised programs are reviewed here before they go live.
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
  const [open, setOpen] = useState<number[]>([]); // days opened by tapping
  const [showWhy, setShowWhy] = useState(false);
  // The coach needs the user's week before it can swap or revise anything.
  const [weekSet, setWeekSet] = useState<boolean | null>(null);
  const { checkIn } = useTodayCheckIn();

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

  // Today's readiness color is the only color on the board.
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!loaded) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.muted} />
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

  // ----- Being written -----
  if (pending?.status === "generating") {
    return (
      <Screen>
        <Text style={[styles.kicker, { color: tint }]}>{pending.revision_of ? "REVISING" : "NEW PROGRAM"}</Text>
        <Text style={styles.title}>{pending.revision_of ? "Revising your program" : "Writing your program"}</Text>
        {pending.request && <Text style={styles.quote}>"{pending.request}"</Text>}
        <View style={styles.card}>
          <View style={styles.rowStart}>
            <ActivityIndicator color={tint} />
            <Text style={styles.body}>
              Your coach is building every day around your schedule. This takes a minute or two; you can leave this
              screen.
            </Text>
          </View>
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
      <Screen>
        <Text style={styles.kicker}>PROGRAM</Text>
        <Text style={styles.title}>That didn't work</Text>
        <Text style={styles.body}>{pending.error ?? "The coach couldn't write the program."}</Text>
        <Button label="Try again" tint={tint} busy={busy === "retry"} onPress={retry} />
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
    return (
      <ErrorState message="No program yet. Build one from the Training card." onRetry={() => router.replace("/")} />
    );
  }

  const plan = program.plan;
  const isDraft = program.status === "draft";
  const isActive = program.status === "active";
  const isRevision = !!program.revision_of;
  const week = isActive ? Math.min(programWeek(program), 4) : 1;
  const today = isoWeekday();
  const weekInfo = plan.weeks.find((w) => w.week === week);
  const days = [...plan.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  // Cards: today and what's coming first; days already behind you this week go last.
  const upcoming = isActive ? days.filter((d) => d.dayOfWeek >= today) : days;
  const earlier = isActive ? days.filter((d) => d.dayOfWeek < today) : [];
  const workoutFor = (day: number) => done.find((w) => w.week === week && w.day === day);

  const approve = () =>
    run("approve", async () => {
      await approveProgram(program);
      load();
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

  // A draft shows every day open so it can be reviewed; otherwise only today
  // starts open.
  const isOpen = (day: number) => isDraft || open.includes(day) !== (isActive && day === today);
  const toggle = (day: number) => setOpen(open.includes(day) ? open.filter((d) => d !== day) : [...open, day]);

  const kicker = isRevision
    ? "REVISED PROGRAM · REVIEW"
    : isDraft
      ? "NEW PROGRAM · REVIEW"
      : `WEEK ${week} OF 4${weekInfo?.focus ? ` · ${weekInfo.focus.toUpperCase()}` : ""}`;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: tint }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={styles.title}>{plan.name}</Text>
        <Text style={styles.body}>{plan.summary}</Text>
        <View style={styles.links}>
          {!!plan.rationale?.length && (
            <Pressable hitSlop={8} onPress={() => setShowWhy(!showWhy)}>
              <Text style={styles.link}>{showWhy ? "Hide why" : "Why this block works"} ›</Text>
            </Pressable>
          )}
          <Pressable hitSlop={8} onPress={() => router.push("/goals")}>
            <Text style={styles.link}>Edit goals ›</Text>
          </Pressable>
        </View>
      </View>

      {showWhy && !!plan.rationale?.length && (
        <View style={styles.card}>
          {plan.rationale.map((r, i) => (
            <Text key={i} style={styles.bullet}>
              • {r}
            </Text>
          ))}
        </View>
      )}

      {swapNote && <Text style={styles.note}>{swapNote}</Text>}
      {weekSet === false && (
        <Text style={styles.warn}>
          Set your week below first: your coach needs your lifting and MMA days to swap or change anything.
        </Text>
      )}

      {isRevision && (
        <View style={[styles.card, { borderWidth: 1, borderColor: tint }]}>
          <Text style={styles.cardTitle}>WHAT CHANGED</Text>
          {program.request && <Text style={styles.quote}>You asked: "{program.request}"</Text>}
          {(plan.changes ?? []).map((c, i) => (
            <Text key={i} style={styles.bullet}>
              • {c}
            </Text>
          ))}
        </View>
      )}

      {/* The 4-week block */}
      <View style={styles.weeks}>
        {plan.weeks.map((w) => {
          const now = isActive && w.week === week;
          const past = isActive && w.week < week;
          const deload = isDeload(w.focus);
          return (
            <View key={w.week} style={[styles.week, now && { borderColor: tint }]}>
              <Text style={[styles.weekLabel, now && styles.weekLabelNow]}>{deload ? "Deload" : `Wk ${w.week}`}</Text>
              <View
                style={[
                  styles.weekBar,
                  { backgroundColor: deload ? colors.text : tint, opacity: deload ? 0.7 : past ? 0.5 : now ? 0.85 : 1 },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* This week, Monday to Sunday */}
      <View style={styles.strip}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const index = days.findIndex((day) => day.dayOfWeek === d);
          const finished = workoutFor(d)?.status === "completed";
          const isToday = isActive && d === today;
          return (
            <View key={d} style={styles.stripDay}>
              <Text style={[styles.stripName, isToday && styles.stripNameToday]}>{WEEKDAYS_SHORT[d].slice(0, 1)}</Text>
              {index < 0 ? (
                <View style={styles.dot}>
                  <Text style={styles.restText}>rest</Text>
                </View>
              ) : finished ? (
                <View style={[styles.dot, styles.dotDone]}>
                  <Check color={colors.muted} />
                </View>
              ) : (
                <Pressable
                  style={[styles.dot, isToday ? { backgroundColor: tint } : styles.dotPlanned]}
                  onPress={() => toggle(d)}
                  accessibilityLabel={`${WEEKDAYS[d]}: ${days[index].title}`}
                >
                  <Text style={[styles.dotText, isToday && styles.dotTextToday]}>{index + 1}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {isDraft && (
        <>
          <Button
            label={isRevision ? "Use the revised program" : "Start this program"}
            tint={tint}
            busy={busy === "approve"}
            onPress={approve}
          />
          <Pressable style={styles.secondary} disabled={!!busy} onPress={rewrite}>
            <Text style={styles.secondaryText}>{isRevision ? "Keep my current program" : "Write a different one"}</Text>
          </Pressable>
        </>
      )}

      {[...upcoming, ...earlier].map((day) => {
        const workout = workoutFor(day.dayOfWeek);
        const finished = workout?.status === "completed";
        const isToday = isActive && day.dayOfWeek === today;
        const expanded = isOpen(day.dayOfWeek);
        const labels = groupLabels(day.exercises);
        const shown = day.exercises.slice(0, 2).map((ex) => ex.name);
        const more = day.exercises.length - shown.length;
        return (
          <View key={day.dayOfWeek} style={styles.dayWrap}>
            {day === earlier[0] && <Text style={styles.cardTitle}>EARLIER THIS WEEK</Text>}
            <View style={[styles.dayCard, isToday && { borderColor: tint + "66" }]}>
              <Pressable onPress={() => toggle(day.dayOfWeek)} style={styles.dayTop} disabled={isDraft}>
                <View style={styles.dayHead}>
                  <Text style={[styles.dayName, isToday && { color: tint }]}>
                    {isToday
                      ? `TODAY · ${WEEKDAYS_SHORT[day.dayOfWeek].toUpperCase()}`
                      : WEEKDAYS_SHORT[day.dayOfWeek].toUpperCase()}
                  </Text>
                  {finished ? (
                    <View style={styles.doneTag}>
                      <Check color={colors.text} size={12} />
                      <Text style={styles.doneText}>DONE</Text>
                    </View>
                  ) : workout?.status === "in_progress" ? (
                    <Text style={styles.dayMeta}>In progress</Text>
                  ) : (
                    <Text style={styles.dayMeta}>{day.exercises.length} exercises</Text>
                  )}
                </View>
                <View style={styles.rowTop}>
                  <Text style={[styles.dayTitle, isToday && styles.dayTitleToday]}>{day.title}</Text>
                  {!isDraft && <Chevron open={expanded} />}
                </View>
                {!!day.timing && <Text style={styles.timing}>{day.timing}</Text>}
                {!expanded && (
                  <View style={styles.chips}>
                    {shown.map((name) => (
                      <Text key={name} style={styles.chip} numberOfLines={1}>
                        {name}
                      </Text>
                    ))}
                    {more > 0 && <Text style={styles.chip}>+{more} more</Text>}
                  </View>
                )}
              </Pressable>

              {expanded && (
                <View style={styles.dayBody}>
                  {!!day.purpose && <Text style={styles.purpose}>{day.purpose}</Text>}
                  {day.exercises.map((ex, i) => {
                    const rpe = exerciseRpe(ex, plan, week);
                    const weight = suggestedWeight(ex, rpe, baselines);
                    const key = `${day.dayOfWeek}:${ex.id}`;
                    return (
                      <View key={ex.id} style={styles.exercise}>
                        <View style={styles.rowTop}>
                          <View style={styles.exText}>
                            <Text style={styles.exName}>
                              {labels[i] ? <Text style={styles.group}>{labels[i]} </Text> : null}
                              {ex.name}
                            </Text>
                            <Text style={styles.exPrescription}>{describeExercise(ex, rpe, 0)}</Text>
                          </View>
                          {weight > 0 && (
                            <Text style={[styles.exWeight, i === 0 && isToday && { color: tint }]}>
                              {weight}
                              <Text style={styles.exUnit}> lb</Text>
                            </Text>
                          )}
                        </View>
                        {!!ex.purpose && <Text style={styles.exPurpose}>{ex.purpose}</Text>}
                        <Pressable hitSlop={8} onPress={() => setSwapping(swapping === key ? null : key)}>
                          <Text style={styles.swap}>{swapping === key ? "Cancel" : "Swap"}</Text>
                        </Pressable>
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
                    <Text style={styles.timing}>
                      Same letter = superset: alternate the exercises, rest after the round.
                    </Text>
                  )}
                  {isActive && (
                    <Pressable
                      style={[
                        styles.dayButton,
                        isToday && !finished ? { backgroundColor: tint } : styles.dayButtonQuiet,
                      ]}
                      disabled={!!busy}
                      onPress={() => openDay(day)}
                    >
                      {busy === `day-${day.dayOfWeek}` ? (
                        <ActivityIndicator color={isToday && !finished ? colors.onAccent : colors.text} />
                      ) : (
                        <Text style={[styles.dayButtonText, !(isToday && !finished) && styles.dayButtonTextQuiet]}>
                          {finished
                            ? "View workout"
                            : workout?.status === "in_progress"
                              ? "Continue workout"
                              : "Start workout"}
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        );
      })}

      <WeekCard onChange={(w) => setWeekSet(w.liftDays.length > 0)} />

      {!isRevision && isActive && (
        <Pressable
          style={styles.askCoach}
          hitSlop={8}
          disabled={weekSet === false}
          onPress={() => router.push("/chat")}
        >
          <Text style={[styles.askCoachText, weekSet === false && disabledText]}>
            Want something changed? Ask your coach
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Button({
  label,
  tint,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  tint: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.button, { backgroundColor: tint }, disabled && !busy && disabledFill]}
      disabled={busy || disabled}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={[styles.buttonText, disabled && disabledText]}>{label}</Text>
      )}
    </Pressable>
  );
}

function Check({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.faint}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={open ? "M6 15l6-6 6 6" : "M9 6l6 6-6 6"} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14, paddingBottom: 140 },
  header: { gap: 4 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  links: { flexDirection: "row", gap: 18, marginTop: 6 },
  link: { color: colors.soft, fontFamily: fonts.bold, fontSize: 13 },
  quote: { color: colors.text, fontFamily: fonts.medium, fontSize: 14, fontStyle: "italic" },
  note: { color: colors.soft, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  warn: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  bullet: { color: colors.soft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 8 },
  cardTitle: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1 },

  weeks: { flexDirection: "row", gap: 6 },
  week: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  weekLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11 },
  weekLabelNow: { color: colors.text, fontFamily: fonts.bold },
  weekBar: { height: 4, borderRadius: 2 },

  strip: { flexDirection: "row", justifyContent: "space-between" },
  stripDay: { alignItems: "center", gap: 6, flex: 1 },
  stripName: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11 },
  stripNameToday: { color: colors.text, fontFamily: fonts.bold },
  dot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: colors.raised },
  dotPlanned: { borderWidth: 1, borderColor: colors.line },
  dotText: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  dotTextToday: { color: colors.onAccent, fontFamily: fonts.heavy },
  restText: { color: colors.faint, fontFamily: fonts.medium, fontSize: 11 },

  dayWrap: { gap: 10 },
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  dayTop: { padding: 16, gap: 6 },
  dayHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayName: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1 },
  dayMeta: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  dayTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17, flexShrink: 1 },
  dayTitleToday: { fontFamily: fonts.heavy, fontSize: 21 },
  timing: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 12,
    backgroundColor: colors.raised,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
    maxWidth: 160,
  },
  doneTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.raised,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  doneText: { color: colors.text, fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.8 },

  dayBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  purpose: { color: colors.soft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 10, gap: 4 },
  exText: { flexShrink: 1, gap: 2 },
  exName: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  group: { color: colors.muted, fontFamily: fonts.heavy },
  exPrescription: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  exWeight: { color: colors.text, fontFamily: fonts.heavy, fontSize: 20, fontVariant: ["tabular-nums"] },
  exUnit: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  exPurpose: { color: colors.faint, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  swap: { color: colors.soft, fontFamily: fonts.bold, fontSize: 13 },

  dayButton: { borderRadius: 16, height: 50, alignItems: "center", justifyContent: "center", marginTop: 4 },
  dayButtonQuiet: { backgroundColor: colors.raised },
  dayButtonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 16 },
  dayButtonTextQuiet: { color: colors.text },

  button: { borderRadius: 18, height: 56, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 17 },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 15 },
  askCoach: { alignSelf: "center", paddingVertical: 6 },
  askCoachText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
});
