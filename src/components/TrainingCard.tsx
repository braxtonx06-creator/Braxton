import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius } from "@/components/theme";
import type { CheckIn } from "@/lib/checkIn";
import { isoWeekday, programWeek, requestProgram, startProgramDay, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/program";
import { FOCUSES, getTestWorkoutId, TrainingSummary } from "@/lib/training";

// The home screen's training card walks through:
// goals -> testing workout -> program (build, review), then today's session.
// `tint` is today's readiness color.
export function TrainingCard({
  summary,
  checkIn,
  tint = colors.accent,
}: {
  summary: TrainingSummary;
  checkIn: CheckIn | null;
  tint?: string;
}) {
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openTest = async () => {
    setBuilding(true);
    setError(null);
    try {
      const id = await getTestWorkoutId();
      router.push(`/workout/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  const focusText = summary.goals?.focuses.map((id) => FOCUSES.find((f) => f.id === id)?.label ?? id).join(" · ");

  // 1. No goals yet.
  if (!summary.goals) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>TRAINING</Text>
        <Text style={styles.heading}>Set up your training</Text>
        <Text style={styles.body}>
          Tell your coach what you're training for. Then you'll take a testing workout so your program starts from real
          numbers.
        </Text>
        <Button label="Pick your goals" onPress={() => router.push("/goals")} />
      </View>
    );
  }

  const testDone = summary.test?.status === "completed";

  // 2. Goals set, test not finished.
  if (!testDone) {
    const inProgress = summary.test && summary.test.status !== "completed";
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>TRAINING</Text>
          <Pressable hitSlop={8} onPress={() => router.push("/goals")}>
            <Text style={styles.link}>Goals</Text>
          </Pressable>
        </View>
        <Text style={styles.focus}>{focusText}</Text>
        <Text style={styles.heading}>Testing workout</Text>
        <Text style={styles.body}>
          Warm-ups, then 2 reps with one left in the tank on your main lifts, plus tests for your other goals. About an
          hour.
        </Text>
        {building ? (
          <View style={styles.building}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.body}>
              {inProgress ? "Opening your test…" : "Your coach is designing your test. This can take a minute…"}
            </Text>
          </View>
        ) : (
          <Button label={inProgress ? "Continue test" : "Build my test"} onPress={openTest} />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  // 3. Test done: the program (your numbers live on the Progress tab).
  return <ProgramCard summary={summary} checkIn={checkIn} tint={tint} />;
}

function ProgramCard({ summary, checkIn, tint }: { summary: TrainingSummary; checkIn: CheckIn | null; tint: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const program = summary.program;
  const pending = summary.pending;

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // The coach writes in the background; the program screen shows progress.
  const build = () =>
    act(async () => {
      await requestProgram();
      router.push("/training");
    });

  // The coach plans around the user's real week, so it needs it before writing a program.
  if (!program && !pending && !summary.goals?.liftDays.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>YOUR PROGRAM</Text>
        <Text style={styles.heading}>Set your training days</Text>
        <Text style={styles.body}>
          Tell your coach which days you lift and which days you have MMA, so your program fits your real week.
        </Text>
        <Button label="Set my week" onPress={() => router.push("/goals")} />
      </View>
    );
  }

  // a) No active program yet: build, wait, review, or retry.
  if (!program) {
    const heading =
      pending?.status === "generating"
        ? "Your coach is writing your program…"
        : pending?.status === "draft"
          ? pending.plan.name
          : pending?.status === "failed"
            ? "Writing your program didn't work"
            : "Build your 4-week program";
    return (
      <View style={styles.card}>
        <Text style={styles.title}>YOUR PROGRAM</Text>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.body}>
          {pending?.status === "draft"
            ? pending.plan.summary
            : pending?.status === "generating"
              ? "This takes a minute or two. It keeps going if you leave the app."
              : "Built from your numbers, goals and week, with the reason behind every exercise. You review it before it starts."}
        </Text>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : pending ? (
          <Button
            label={pending.status === "draft" ? "Review program" : "Open"}
            onPress={() => router.push("/training")}
          />
        ) : (
          <Button label="Build my program" onPress={build} />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const week = programWeek(program);
  const revision =
    pending?.revision_of === program.id
      ? pending.status === "draft"
        ? "Your revised program is ready to review"
        : pending.status === "generating"
          ? "Your coach is revising your program…"
          : "Revising your program didn't work"
      : null;

  // b) The 4 weeks are over (the monthly review comes in the next milestone).
  if (week > 4) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>YOUR PROGRAM</Text>
        <Text style={styles.heading}>Block complete</Text>
        <Text style={styles.body}>You finished {program.plan.name}. Time for the next block.</Text>
        {busy ? <ActivityIndicator color={colors.accent} /> : <Button label="Build my next block" onPress={build} />}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  // c) Active: today's focus, big, with one button.
  const today = isoWeekday();
  const day = program.plan.days.find((d) => d.dayOfWeek === today);
  const workout = day && summary.programWorkouts.find((w) => w.week === week && w.day === day.dayOfWeek);
  const next = program.plan.days.find((d) => d.dayOfWeek > today) ?? program.plan.days[0];
  const classToday = summary.goals?.classDays.includes(today);

  const open = () =>
    act(async () => {
      const id = await startProgramDay(program, week, day!, checkIn);
      router.push(`/workout/${id}`);
    });

  return (
    <Pressable style={styles.card} onPress={() => router.push("/training")}>
      <View style={styles.row}>
        <Text style={styles.title}>WEEK {week} OF 4</Text>
        {!!day?.timing && <Text style={styles.timing}>{day.timing}</Text>}
      </View>
      {revision && <Text style={[styles.notice, { color: tint }]}>{revision} ›</Text>}
      {day ? (
        <>
          <Text style={styles.label}>Today's focus</Text>
          <Text style={styles.focusTitle}>{day.title.toUpperCase()}</Text>
          <View style={styles.footer}>
            <Text style={styles.footnote}>
              {classToday ? `MMA ${summary.goals?.classTime || "tonight"}` : `${day.exercises.length} exercises`}
            </Text>
            {busy ? (
              <ActivityIndicator color={tint} />
            ) : (
              <Pressable style={[styles.start, { backgroundColor: tint }]} onPress={open} hitSlop={6}>
                <Text style={styles.startText}>
                  {workout?.status === "completed" ? "VIEW" : workout?.status === "in_progress" ? "CONTINUE" : "START"}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Today</Text>
          <Text style={styles.focusTitle}>{classToday ? "MMA + RECOVERY" : "REST DAY"}</Text>
          <Text style={styles.footnote}>
            Next: {WEEKDAYS_SHORT[next.dayOfWeek]} · {next.title}
          </Text>
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </Pressable>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 18, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.4 },
  timing: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  link: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  focus: { color: colors.soft, fontFamily: fonts.semibold, fontSize: 13 },
  notice: { fontFamily: fonts.bold, fontSize: 13 },
  label: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  focusTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 30, lineHeight: 32, letterSpacing: 0.3 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  footnote: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, flexShrink: 1 },
  start: { borderRadius: 16, paddingVertical: 13, paddingHorizontal: 22 },
  startText: { color: colors.onAccent, fontFamily: fonts.black, fontSize: 15, letterSpacing: 0.5 },
  heading: { color: colors.text, fontFamily: fonts.heavy, fontSize: 20 },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  building: { flexDirection: "row", alignItems: "center", gap: 10 },
  button: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 16 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 14 },
});
