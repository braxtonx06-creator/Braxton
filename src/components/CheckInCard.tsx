import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/components/theme";
import { CheckIn, saveTodayCheckIn } from "@/lib/checkIn";

const LABELS = ["", "Terrible", "Poor", "Okay", "Good", "Great"];

// Morning check-in: a quick form, then a one-line summary with Edit.
export function CheckInCard({
  checkIn,
  onSaved,
  onSkip,
  startEditing = false,
}: {
  checkIn: CheckIn | null;
  startEditing?: boolean;
  onSaved: (c: CheckIn) => void;
  onSkip?: () => void;
}) {
  const [editing, setEditing] = useState(checkIn === null || startEditing);
  const [sleepHours, setSleepHours] = useState(checkIn?.sleepHours ?? 7.5);
  const [sleepQuality, setSleepQuality] = useState(checkIn?.sleepQuality ?? 0);
  const [feeling, setFeeling] = useState(checkIn?.feeling ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (checkIn && !editing) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>Morning check-in</Text>
          <Pressable hitSlop={8} onPress={() => setEditing(true)}>
            <Text style={styles.link}>Edit</Text>
          </Pressable>
        </View>
        <View style={styles.stats}>
          <Stat value={`${checkIn.sleepHours} h`} label="Sleep" />
          <Stat value={LABELS[checkIn.sleepQuality]} label="Sleep quality" />
          <Stat value={LABELS[checkIn.feeling]} label="Feeling" />
        </View>
      </View>
    );
  }

  const canSave = sleepQuality > 0 && feeling > 0 && !saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTodayCheckIn({ sleepHours, sleepQuality, feeling });
      setEditing(false);
      onSaved(saved);
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, styles.active]}>
      <Text style={styles.title}>Morning check-in</Text>

      <Text style={styles.question}>How long did you sleep?</Text>
      <View style={styles.stepper}>
        <StepButton label="−" onPress={() => setSleepHours(Math.max(0, sleepHours - 0.5))} />
        <Text style={styles.stepValue}>{sleepHours.toFixed(1)} h</Text>
        <StepButton label="+" onPress={() => setSleepHours(Math.min(16, sleepHours + 0.5))} />
      </View>

      <Text style={styles.question}>How well did you sleep?</Text>
      <Scale value={sleepQuality} onChange={setSleepQuality} />

      <Text style={styles.question}>How do you feel?</Text>
      <Scale value={feeling} onChange={setFeeling} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.button, !canSave && styles.disabled]} disabled={!canSave} onPress={save}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Save check-in</Text>}
      </Pressable>
      {onSkip && !checkIn && (
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={styles.skip}>Skip for today</Text>
        </Pressable>
      )}
    </View>
  );
}

function Scale({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.scale}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          style={[styles.scaleItem, value === n && styles.scaleItemOn]}
          onPress={() => onChange(n)}
          accessibilityLabel={LABELS[n]}
        >
          <Text style={[styles.scaleNumber, value === n && styles.scaleTextOn]}>{n}</Text>
          <Text style={[styles.scaleLabel, value === n && styles.scaleTextOn]}>{LABELS[n]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.stepButton} onPress={onPress} hitSlop={6}>
      <Text style={styles.stepButtonText}>{label}</Text>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  active: { borderWidth: 1, borderColor: colors.accent },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.muted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  question: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 4 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonText: { color: colors.text, fontSize: 24, fontWeight: "600" },
  stepValue: { color: colors.text, fontSize: 24, fontWeight: "800", minWidth: 80, textAlign: "center" },
  scale: { flexDirection: "row", gap: 6 },
  scaleItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  scaleItemOn: { backgroundColor: colors.accent },
  scaleNumber: { color: colors.text, fontSize: 17, fontWeight: "700" },
  scaleLabel: { color: colors.muted, fontSize: 10 },
  scaleTextOn: { color: colors.onAccent },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  skip: { color: colors.muted, fontSize: 14, textAlign: "center" },
  error: { color: "#F87171", fontSize: 14 },
  stats: { flexDirection: "row", gap: 22, flexWrap: "wrap" },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12 },
});
