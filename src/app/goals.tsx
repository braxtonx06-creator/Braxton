import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/components/theme";
import { WEEKDAYS_SHORT } from "@/lib/program";
import { FOCUSES, loadTrainingSummary, saveGoals } from "@/lib/training";

const SESSION_LENGTHS = [45, 60, 75, 90];

// Pick what you're training for; one of them is the main goal.
export default function GoalsScreen() {
  const [focuses, setFocuses] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [liftDays, setLiftDays] = useState<number[]>([]);
  const [classDays, setClassDays] = useState<number[]>([]);
  const [classTime, setClassTime] = useState("");
  const [sessionMinutes, setSessionMinutes] = useState(75);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing: start from the saved goals.
  useEffect(() => {
    loadTrainingSummary()
      .then((s) => {
        if (s.goals) {
          setFocuses(s.goals.focuses);
          setPrimary(s.goals.primaryFocus);
          setLiftDays(s.goals.liftDays);
          setClassDays(s.goals.classDays);
          setClassTime(s.goals.classTime);
          setSessionMinutes(s.goals.sessionMinutes);
        }
      })
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    const next = focuses.includes(id) ? focuses.filter((f) => f !== id) : [...focuses, id];
    setFocuses(next);
    if (!next.includes(primary ?? "")) setPrimary(next[0] ?? null);
  };

  const save = async () => {
    if (!primary) return;
    setSaving(true);
    setError(null);
    try {
      await saveGoals({ focuses, primaryFocus: primary, liftDays, classDays, classTime: classTime.trim(), sessionMinutes });
      router.canGoBack() ? router.back() : router.replace("/");
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Text style={styles.back}>‹ Today</Text>
        </Pressable>
        <Text style={styles.title}>What are you training for?</Text>
        <Text style={styles.muted}>Pick everything that matters to you. Your testing workout and program are built from this.</Text>

        {FOCUSES.map((f) => {
          const on = focuses.includes(f.id);
          return (
            <Pressable key={f.id} style={[styles.option, on && styles.optionOn]} onPress={() => toggle(f.id)}>
              <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{f.label}</Text>
                <Text style={styles.muted}>{f.hint}</Text>
              </View>
            </Pressable>
          );
        })}

        {focuses.length > 1 && (
          <>
            <Text style={styles.subtitle}>Which one matters most?</Text>
            <View style={styles.chips}>
              {focuses.map((id) => (
                <Pressable
                  key={id}
                  style={[styles.chip, primary === id && styles.chipOn]}
                  onPress={() => setPrimary(id)}
                >
                  <Text style={[styles.chipText, primary === id && styles.chipTextOn]}>
                    {FOCUSES.find((f) => f.id === id)?.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.title2}>Your week</Text>
        <Text style={styles.muted}>Your coach plans around this exactly, so it never has to guess.</Text>

        <Text style={styles.subtitle}>Which days can you lift?</Text>
        <DayPicker days={liftDays} onChange={setLiftDays} />

        <Text style={styles.subtitle}>Which days do you have MMA or other classes?</Text>
        <DayPicker days={classDays} onChange={setClassDays} />
        {classDays.length > 0 && (
          <TextInput
            style={styles.input}
            value={classTime}
            onChangeText={setClassTime}
            placeholder="Class time, e.g. 6:30–8 PM (Sat 10:15 AM)"
            placeholderTextColor={colors.muted}
          />
        )}

        <Text style={styles.subtitle}>How long can a lifting session be?</Text>
        <View style={styles.chips}>
          {SESSION_LENGTHS.map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, sessionMinutes === m && styles.chipOn]}
              onPress={() => setSessionMinutes(m)}
            >
              <Text style={[styles.chipText, sessionMinutes === m && styles.chipTextOn]}>{m} min</Text>
            </Pressable>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {!liftDays.length && primary && <Text style={styles.muted}>Pick at least one lifting day.</Text>}
        <Pressable
          style={[styles.button, (!primary || !liftDays.length || saving) && styles.disabled]}
          disabled={!primary || !liftDays.length || saving}
          onPress={save}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save goals</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <View style={styles.days}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = days.includes(d);
        return (
          <Pressable
            key={d}
            style={[styles.day, on && styles.chipOn]}
            onPress={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort())}
            accessibilityLabel={WEEKDAYS_SHORT[d]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{WEEKDAYS_SHORT[d]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 8 },
  title2: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 16 },
  days: { flexDirection: "row", gap: 6 },
  day: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.card, alignItems: "center" },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    fontSize: 16,
  },
  muted: { color: colors.muted, fontSize: 14 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  optionOn: { borderColor: colors.accent },
  optionLabel: { color: colors.text, fontSize: 17, fontWeight: "700" },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: "#fff", fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  error: { color: "#F87171", fontSize: 14 },
});
