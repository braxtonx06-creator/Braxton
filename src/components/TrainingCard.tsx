import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/components/theme";
import { FOCUSES, getTestWorkoutId, TrainingSummary } from "@/lib/training";

// The home screen's training card walks through: goals -> testing workout -> your numbers.
export function TrainingCard({ summary }: { summary: TrainingSummary }) {
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

  // 3. Test done: show the numbers.
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>YOUR NUMBERS</Text>
        <Pressable hitSlop={8} onPress={() => router.push(`/workout/${summary.test!.id}`)}>
          <Text style={styles.link}>View test</Text>
        </Pressable>
      </View>
      {summary.baselines.map((b) => (
        <View key={b.metric} style={styles.resultRow}>
          <Text style={styles.resultName}>{b.name}</Text>
          <Text style={styles.resultValue}>
            {b.value} <Text style={styles.resultUnit}>{b.unit}</Text>
          </Text>
        </View>
      ))}
      <Text style={styles.body}>Your coach builds your 4-week program from these next.</Text>
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
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.muted, fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  focus: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  heading: { color: colors.text, fontSize: 19, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  building: { flexDirection: "row", alignItems: "center", gap: 10 },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: "#F87171", fontSize: 14 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  resultName: { color: colors.text, fontSize: 16, fontWeight: "600", flexShrink: 1 },
  resultValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  resultUnit: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
