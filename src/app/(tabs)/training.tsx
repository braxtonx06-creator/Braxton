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
import { WeekCard } from "@/components/WeekCard";
import { colors, disabledFill, disabledText, fonts, radius } from "@/components/theme";
import { useTodayCheckIn } from "@/lib/checkIn";
import {
  approveProgram,
  discardProgram,
  isoWeekday,
  loadProgramState,
  loadProgramWorkouts,
  Program,
  programWeek,
  ProgramWorkoutRef,
  requestProgram,
  requestRevision,
  sessionLength,
  waitForProgram,
  WEEKDAYS,
  WEEKDAYS_SHORT,
} from "@/lib/program";
import { readinessFrom } from "@/lib/readiness";

const isDeload = (focus: string) => /deload/i.test(focus);

// The 4-week block at a glance: where you are in the block and this week in
// one list. Tap a day to see its exercises and start it (day/[day].tsx).
// New and revised programs are reviewed here before they go live.
export default function ProgramScreen() {
  const [active, setActive] = useState<Program | null>(null);
  const [pending, setPending] = useState<Program | null>(null);
  const [done, setDone] = useState<ProgramWorkoutRef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  // The coach needs the user's week before it can swap or revise anything.
  const [weekSet, setWeekSet] = useState<boolean | null>(null);
  const { checkIn } = useTodayCheckIn();

  const load = useCallback(() => {
    setError(null);
    loadProgramState()
      .then(async (state) => {
        setActive(state.active);
        setPending(state.pending);
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

  const openDay = (d: number) => router.push(`/day/${d}?program=${program.id}`);

  const kicker = isRevision ? "REVISED PROGRAM · REVIEW" : isDraft ? "NEW PROGRAM · REVIEW" : `WEEK ${week} OF 4`;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: tint }]}>{kicker}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {plan.name}
        </Text>
        {isActive && !!weekInfo?.focus && (
          <Text style={styles.focus} numberOfLines={1}>
            This week: {weekInfo.focus}
          </Text>
        )}
        <View style={styles.links}>
          <Pressable hitSlop={8} onPress={() => setShowWhy(!showWhy)}>
            <Text style={styles.link}>{showWhy ? "Hide" : "About this block"} ›</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push("/goals")}>
            <Text style={styles.link}>Edit goals ›</Text>
          </Pressable>
        </View>
      </View>

      {showWhy && (
        <View style={styles.card}>
          <Text style={styles.body}>{plan.summary}</Text>
          {(plan.rationale ?? []).map((r, i) => (
            <Text key={i} style={styles.bullet}>
              • {r}
            </Text>
          ))}
        </View>
      )}

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

      {/* This week in one block, Monday to Sunday. Tap a day for its workout. */}
      <View style={styles.list}>
        <Text style={styles.listTitle}>{isActive ? "THIS WEEK" : "EACH WEEK"}</Text>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const day = days.find((x) => x.dayOfWeek === d);
          const isToday = isActive && d === today;
          const workout = workoutFor(d);
          const finished = workout?.status === "completed";
          const length = day ? sessionLength(day.timing) : "";
          return (
            <Pressable
              key={d}
              style={[styles.dayRow, isToday && { backgroundColor: colors.raised }]}
              disabled={!day}
              onPress={() => openDay(d)}
              accessibilityLabel={day ? `${WEEKDAYS[d]}: ${day.title}` : `${WEEKDAYS[d]}: rest`}
            >
              <Text style={[styles.dayName, isToday && { color: tint }]}>{WEEKDAYS_SHORT[d].toUpperCase()}</Text>
              <View style={styles.dayMid}>
                {day ? (
                  <>
                    <Text style={[styles.dayTitle, finished && styles.dayTitleDone]} numberOfLines={1}>
                      {day.title}
                    </Text>
                    <Text style={styles.dayMeta} numberOfLines={1}>
                      {isToday ? "Today · " : ""}
                      {workout?.status === "in_progress" ? "In progress · " : ""}
                      {day.exercises.length} exercises{length ? ` · ${length}` : ""}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.rest}>Rest</Text>
                )}
              </View>
              {day && (finished ? <Check color={colors.muted} /> : <Chevron />)}
            </Pressable>
          );
        })}
      </View>

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

function Chevron() {
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
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14, paddingBottom: 140 },
  header: { gap: 4 },
  focus: { color: colors.soft, fontFamily: fonts.medium, fontSize: 14 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  links: { flexDirection: "row", gap: 18, marginTop: 6 },
  link: { color: colors.soft, fontFamily: fonts.bold, fontSize: 13 },
  quote: { color: colors.text, fontFamily: fonts.medium, fontSize: 14, fontStyle: "italic" },
  warn: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  bullet: { color: colors.soft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 12 },
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

  list: { backgroundColor: colors.card, borderRadius: radius, paddingVertical: 8, overflow: "hidden" },
  listTitle: {
    color: colors.muted,
    fontFamily: fonts.heavy,
    fontSize: 12,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 11 },
  dayName: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1, width: 34 },
  dayMid: { flex: 1, gap: 2 },
  dayTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  dayTitleDone: { color: colors.muted },
  dayMeta: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  rest: { color: colors.faint, fontFamily: fonts.medium, fontSize: 14 },

  button: { borderRadius: 18, height: 56, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 17 },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 15 },
  askCoach: { alignSelf: "center", paddingVertical: 6 },
  askCoachText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
});
