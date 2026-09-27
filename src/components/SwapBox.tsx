import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/components/theme";
import { swapExercise } from "@/lib/program";

const REASONS = ["Don't have the equipment", "Pain or discomfort", "Don't like it", "Want more challenge"];

// Tell the coach why an exercise should go; it picks a replacement with the same purpose.
export function SwapBox({
  programId,
  dayOfWeek,
  exerciseId,
  exerciseName,
  onSwapped,
}: {
  programId: string;
  dayOfWeek: number;
  exerciseId: string;
  exerciseName: string;
  onSwapped: (result: { name: string; why: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swap = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await swapExercise(programId, dayOfWeek, exerciseId, reason.trim());
      onSwapped({ name: result.exercise.name, why: result.why });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Why swap {exerciseName}?</Text>
      <View style={styles.chips}>
        {REASONS.map((r) => (
          <Pressable key={r} style={[styles.chip, reason === r && styles.chipOn]} onPress={() => setReason(r)}>
            <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={REASONS.includes(reason) ? "" : reason}
        onChangeText={setReason}
        placeholder="Or say it in your own words"
        placeholderTextColor={colors.muted}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, (busy || !reason.trim()) && styles.disabled]} disabled={busy || !reason.trim()} onPress={swap}>
        {busy ? (
          <View style={styles.row}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>Finding a replacement…</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>Swap exercise</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 8, marginTop: 6 },
  title: { color: colors.text, fontSize: 14, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    fontSize: 14,
  },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  disabled: { opacity: 0.5 },
  error: { color: "#F87171", fontSize: 13 },
});
