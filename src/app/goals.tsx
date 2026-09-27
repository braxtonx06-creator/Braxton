import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/components/theme";
import { FOCUSES, loadTrainingSummary, saveGoals } from "@/lib/training";

// Pick what you're training for; one of them is the main goal.
export default function GoalsScreen() {
  const [focuses, setFocuses] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing: start from the saved goals.
  useEffect(() => {
    loadTrainingSummary()
      .then((s) => {
        if (s.goals) {
          setFocuses(s.goals.focuses);
          setPrimary(s.goals.primaryFocus);
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
      await saveGoals({ focuses, primaryFocus: primary });
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

        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, (!primary || saving) && styles.disabled]}
          disabled={!primary || saving}
          onPress={save}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save goals</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  back: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 8 },
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
