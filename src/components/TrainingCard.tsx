import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/components/theme";
import type { CheckIn } from "@/lib/checkIn";
import { groupLabels, isoWeekday, programWeek, requestProgram, startProgramDay, WEEKDAYS } from "@/lib/program";
import { FOCUSES, formatResult, getTestWorkoutId, TrainingSummary } from "@/lib/training";

// The home screen's training card walks through:
// goals -> testing workout -> program (build, review, then today's session) + your numbers.
export function TrainingCard({ summary, checkIn }: { summary: TrainingSummary; checkIn: CheckIn | null }) {
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

  const focusText = summary.goals?.focuses
    .map((id) => FOCUSES.find((f) => f.id === id)?.label ?? id)
    .join(" · ");

  // 1. No goals yet.
  if (!summary.goals) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>TRAINING</Text>
        <Text style={styles.heading}>Set up your training</Text>
        <Text style={styles.body}>
          Tell your coach what you're training for. Then you'll take a testing workout so your program starts from real numbers.
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
          Warm-ups, then 2 reps with one left in the tank on your main lifts, plus tests for your other goals. About an hour.
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

  // 3. Test done: the program, then the numbers.
  return (
    <>
      <ProgramCard summary={summary} checkIn={checkIn} />
      <NumbersCard summary={summary} building={building} error={error} onRetake={openTest} />
    </>
  );
}

function ProgramCard({ summary, checkIn }: { summary: TrainingSummary; checkIn: CheckIn | null }) {
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
          <Button label={pending.status === "draft" ? "Review program" : "Open"} onPress={() => router.push("/training")} />
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

  // c) Active: today's session, or the next one.
  const today = isoWeekday();
  const day = program.plan.days.find((d) => d.dayOfWeek === today);
  const workout = day && summary.programWorkouts.find((w) => w.week === week && w.day === day.dayOfWeek);
  const next = program.plan.days.find((d) => d.dayOfWeek > today) ?? program.plan.days[0];

  const open = () =>
    act(async () => {
      const id = await startProgramDay(program, week, day!, checkIn);
      router.push(`/workout/${id}`);
    });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>WEEK {week} · TODAY</Text>
        <View style={styles.links}>
          <Pressable hitSlop={8} onPress={() => router.push("/chat")}>
            <Text style={styles.link}>Ask coach</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push("/training")}>
            <Text style={styles.link}>Full program</Text>
          </Pressable>
        </View>
      </View>
      {revision && (
        <Pressable onPress={() => router.push("/training")}>
          <Text style={styles.focus}>{revision} ›</Text>
        </Pressable>
      )}
      {!summary.goals?.liftDays.length && (
        <Pressable onPress={() => router.push("/goals")}>
          <Text style={styles.focus}>Set your lifting and MMA days so your coach stops guessing ›</Text>
        </Pressable>
      )}
      {day ? (
        <>
          <Text style={styles.heading}>{day.title}</Text>
          {!!day.timing && <Text style={styles.focus}>{day.timing}</Text>}
          {!!day.purpose && <Text style={styles.body}>{day.purpose}</Text>}
          {day.exercises.map((ex, i) => (
            <Text key={ex.id} style={styles.exerciseLine}>
              {groupLabels(day.exercises)[i] ? `${groupLabels(day.exercises)[i]}  ` : ""}
              {ex.name} ·{" "}
              {ex.kind === "conditioning"
                ? `${ex.sets} round${ex.sets === 1 ? "" : "s"}`
                : `${ex.sets} × ${ex.reps}`}
            </Text>
          ))}
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Button
              label={
                workout?.status === "completed"
                  ? "View workout"
                  : workout?.status === "in_progress"
                    ? "Continue workout"
                    : "Start workout"
              }
              onPress={open}
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.heading}>No lifting today</Text>
          <Text style={styles.body}>
            Recover{summary.goals?.classDays.includes(today) ? " and hit your class" : ""}. Next up: {WEEKDAYS[next.dayOfWeek]},{" "}
            {next.title}.
          </Text>
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function NumbersCard({
  summary,
  building,
  error,
  onRetake,
}: {
  summary: TrainingSummary;
  building: boolean;
  error: string | null;
  onRetake: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>YOUR NUMBERS</Text>
        <Pressable hitSlop={8} onPress={() => router.push(`/workout/${summary.test!.id}`)}>
          <Text style={styles.link}>View test</Text>
        </Pressable>
      </View>
      {summary.baselines.map((b) => {
        const shown = formatResult(b.value, b.unit);
        return (
          <View key={b.metric} style={styles.resultRow}>
            <Text style={styles.resultName}>{b.name}</Text>
            <Text style={styles.resultValue}>
              {shown.value} <Text style={styles.resultUnit}>{shown.unit}</Text>
            </Text>
          </View>
        );
      })}
      {building ? (
        <View style={styles.building}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.body}>Your coach is designing a new test…</Text>
        </View>
      ) : (
        // A new test replaces these numbers (the latest result per test is used).
        <Pressable hitSlop={8} onPress={onRetake}>
          <Text style={styles.retake}>Retake test</Text>
        </Pressable>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
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
  links: { flexDirection: "row", gap: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.muted, fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  focus: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  heading: { color: colors.text, fontSize: 19, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  building: { flexDirection: "row", alignItems: "center", gap: 10 },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  error: { color: "#F87171", fontSize: 14 },
  retake: { color: colors.muted, fontSize: 14, fontWeight: "600", textAlign: "center" },
  exerciseLine: { color: colors.text, fontSize: 15, lineHeight: 21 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  resultName: { color: colors.text, fontSize: 16, fontWeight: "600", flexShrink: 1 },
  resultValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  resultUnit: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
