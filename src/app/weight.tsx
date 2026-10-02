import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/BackButton";
import { colors, disabledFill, disabledText, fonts, radius } from "@/components/theme";
import { useTodayCheckIn } from "@/lib/checkIn";
import { localDate } from "@/lib/dates";
import { shortDate } from "@/lib/progress";
import { readinessFrom } from "@/lib/readiness";
import { saveWeight, useWeights } from "@/lib/weight";

// Log today's body weight and see the last few weigh-ins.
export default function WeightScreen() {
  const { weights, error, reload } = useWeights(14);
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pounds = parseFloat(value.replace(",", "."));
  const valid = Number.isFinite(pounds) && pounds >= 50 && pounds <= 600;
  const today = weights?.find((w) => w.day === localDate());
  const latest = weights?.[0];
  const weekAgo = weights?.find((w) => w.day <= daysAgo(7));
  const change =
    latest && weekAgo && latest !== weekAgo ? Math.round((latest.pounds - weekAgo.pounds) * 10) / 10 : null;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveWeight(Math.round(pounds * 10) / 10);
      setValue("");
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackButton />
          <View style={styles.header}>
            <Text style={styles.kicker}>BODY WEIGHT</Text>
            <View style={styles.bigRow}>
              <Text style={[styles.big, { color: tint }]}>{latest ? latest.pounds : "—"}</Text>
              <Text style={styles.unit}>lb</Text>
              {change !== null && (
                <Text style={styles.change}>
                  {change > 0 ? "+" : ""}
                  {change} lb this week
                </Text>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{today ? "UPDATE TODAY" : "LOG TODAY"}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                placeholder={today ? String(today.pounds) : "180.0"}
                placeholderTextColor={colors.faint}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => valid && save()}
              />
              <Pressable
                style={[styles.button, { backgroundColor: tint }, (!valid || saving) && !saving && disabledFill]}
                disabled={!valid || saving}
                onPress={save}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={[styles.buttonText, !valid && disabledText]}>Save</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.hint}>Same time each morning, after the bathroom, before food.</Text>
            {saveError && <Text style={styles.error}>{saveError}</Text>}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
          {!!weights?.length && (
            <View style={styles.list}>
              {weights.map((w, i) => (
                <View key={w.day} style={[styles.row, i > 0 && styles.rowLine]}>
                  <Text style={styles.rowDay}>{w.day === localDate() ? "Today" : shortDate(w.day)}</Text>
                  <Text style={styles.rowValue}>
                    {w.pounds}
                    <Text style={styles.rowUnit}> lb</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  header: { gap: 6 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { fontFamily: fonts.black, fontSize: 52, lineHeight: 56, fontVariant: ["tabular-nums"] },
  unit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 16 },
  change: { marginLeft: "auto", color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  label: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1 },
  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.heavy,
    fontSize: 22,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    fontVariant: ["tabular-nums"],
  },
  button: { width: 96, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 16 },
  hint: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  list: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowDay: { color: colors.soft, fontFamily: fonts.medium, fontSize: 14 },
  rowValue: { color: colors.text, fontFamily: fonts.heavy, fontSize: 16, fontVariant: ["tabular-nums"] },
  rowUnit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
});
