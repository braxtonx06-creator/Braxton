import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, disabledFill, disabledText, fonts, radius } from "@/components/theme";
import { WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/program";
import { loadTrainingSummary, saveWeek, Week } from "@/lib/training";

const SESSION_LENGTHS = [45, 60, 75, 90];

// The user's weekly schedule, editable in place. Collapsed to a summary once
// it's set; open by default while it's missing, since the coach needs it.
// `onChange` fires with the saved week once loaded and after every save.
export function WeekCard({ onChange }: { onChange?: (week: Week) => void }) {
  const [week, setWeek] = useState<Week | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load once; onChange is a callback, not something to reload on.
  useEffect(() => {
    loadTrainingSummary()
      .then((s) => {
        const w = {
          liftDays: s.goals?.liftDays ?? [],
          classDays: s.goals?.classDays ?? [],
          classTime: s.goals?.classTime ?? "",
          sessionMinutes: s.goals?.sessionMinutes ?? 75,
        };
        setWeek(w);
        setEditing(!w.liftDays.length);
        onChange?.(w);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!week) {
    return (
      <View style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.muted} />}
      </View>
    );
  }

  const names = (days: number[]) => (days.length ? days.map((d) => WEEKDAYS_SHORT[d]).join(", ") : "none");

  if (!editing) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>YOUR WEEK</Text>
          <Pressable hitSlop={8} onPress={() => setEditing(true)}>
            <Text style={styles.link}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.line}>
          Lifting: {names(week.liftDays)} · up to {week.sessionMinutes} min
        </Text>
        <Text style={styles.line}>
          MMA / classes: {names(week.classDays)}
          {week.classTime ? ` (${week.classTime})` : ""}
        </Text>
      </View>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const cleaned = { ...week, classTime: week.classTime.trim() };
      await saveWeek(cleaned);
      setWeek(cleaned);
      setEditing(false);
      onChange?.(cleaned);
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: "liftDays" | "classDays", d: number) => {
    const days = week[key];
    setWeek({ ...week, [key]: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });
  };

  return (
    <View style={[styles.card, !week.liftDays.length && styles.cardAccent]}>
      <Text style={styles.title}>YOUR WEEK</Text>
      <Text style={styles.muted}>Your coach plans around this exactly, so it never has to guess.</Text>

      <Text style={styles.question}>Which days can you lift?</Text>
      <Days selected={week.liftDays} onToggle={(d) => toggle("liftDays", d)} label="Lift" />

      <Text style={styles.question}>Which days do you have MMA or other classes?</Text>
      <Days selected={week.classDays} onToggle={(d) => toggle("classDays", d)} label="Class" />
      {week.classDays.length > 0 && (
        <TextInput
          style={styles.input}
          value={week.classTime}
          onChangeText={(classTime) => setWeek({ ...week, classTime })}
          placeholder="Class time, e.g. 6:30–8 PM (Sat 10:15 AM)"
          placeholderTextColor={colors.muted}
        />
      )}

      <Text style={styles.question}>How long can a lifting session be?</Text>
      <View style={styles.chips}>
        {SESSION_LENGTHS.map((m) => (
          <Pressable
            key={m}
            style={[styles.chip, week.sessionMinutes === m && styles.on]}
            onPress={() => setWeek({ ...week, sessionMinutes: m })}
          >
            <Text style={[styles.chipText, week.sessionMinutes === m && styles.onText]}>{m} min</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, !week.liftDays.length && !saving && disabledFill]}
        disabled={!week.liftDays.length || saving}
        onPress={save}
      >
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={[styles.buttonText, !week.liftDays.length && disabledText]}>
            {week.liftDays.length ? "Save my week" : "Pick at least one lifting day"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function Days({ selected, onToggle, label }: { selected: number[]; onToggle: (d: number) => void; label: string }) {
  return (
    <View style={styles.days}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = selected.includes(d);
        return (
          <Pressable
            key={d}
            style={[styles.day, on && styles.on]}
            onPress={() => onToggle(d)}
            accessibilityLabel={`${label} ${WEEKDAYS[d]}`}
          >
            <Text style={[styles.chipText, on && styles.onText]}>{WEEKDAYS_SHORT[d]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, gap: 8 },
  cardAccent: { borderWidth: 1, borderColor: colors.soft },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1 },
  link: { color: colors.soft, fontFamily: fonts.bold, fontSize: 14 },
  line: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  question: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, marginTop: 4 },
  days: { flexDirection: "row", gap: 5 },
  day: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.bg, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.bg },
  chipText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  // Selected days are white: color is saved for today's readiness.
  on: { backgroundColor: colors.text },
  onText: { color: colors.onAccent },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    fontSize: 14,
  },
  button: { backgroundColor: colors.text, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  buttonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 15 },
  error: { color: "#F87171", fontSize: 13 },
});
