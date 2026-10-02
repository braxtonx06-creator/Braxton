import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import {
  estimateMeal,
  MealEstimate,
  MealItem,
  pickPhoto,
  removeMealPhoto,
  saveMeal,
  totalsOf,
  uploadMealPhoto,
} from "@/lib/food";
import { readinessFrom } from "@/lib/readiness";

// Items are edited as text so half-typed numbers ("12.") don't jump around.
type Draft = { name: string; portion: string; calories: string; protein_g: string; carbs_g: string; fat_g: string };

const toDraft = (i: MealItem): Draft => ({
  name: i.name,
  portion: i.portion,
  calories: String(Math.round(i.calories)),
  protein_g: String(Math.round(i.protein_g)),
  carbs_g: String(Math.round(i.carbs_g)),
  fat_g: String(Math.round(i.fat_g)),
});
const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const toItem = (d: Draft): MealItem => ({
  name: d.name.trim() || "Food",
  portion: d.portion.trim(),
  calories: Math.round(num(d.calories)),
  protein_g: num(d.protein_g),
  carbs_g: num(d.carbs_g),
  fat_g: num(d.fat_g),
});
const blank: Draft = { name: "", portion: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" };

// Logging one meal: take or pick a photo, the coach estimates what's in it,
// you fix anything it got wrong, then save. Also works without a photo.
export default function MealScreen() {
  const { from } = useLocalSearchParams<{ from?: "camera" | "library" | "manual" }>();
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [step, setStep] = useState<"picking" | "reading" | "review">(from === "manual" ? "review" : "picking");
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Draft[]>(from === "manual" ? [blank] : []);
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const started = useRef(false);

  const read = async (photoPath: string, withHint?: string) => {
    setStep("reading");
    setError(null);
    try {
      const e = await estimateMeal(photoPath, withHint);
      setEstimate(e);
      setTitle(e.title);
      setItems(e.items.length ? e.items.map(toDraft) : [blank]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep("review");
    }
  };

  // Open the camera or library once, as soon as the screen appears.
  useEffect(() => {
    if (started.current || from === "manual") return;
    started.current = true;
    (async () => {
      try {
        const asset = await pickPhoto(from === "library" ? "library" : "camera");
        if (!asset) return router.back();
        setPhotoUri(asset.uri);
        setStep("reading");
        const p = await uploadMealPhoto(asset);
        setPath(p);
        await read(p);
      } catch (e) {
        setError((e as Error).message);
        setStep("review");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving without saving: don't keep the uploaded photo.
  useEffect(
    () => () => {
      if (!saved.current && path) removeMealPhoto(path);
    },
    [path],
  );

  const update = (i: number, patch: Partial<Draft>) =>
    setItems(items.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const totals = totalsOf(items.map(toItem));
  const canSave = items.some((d) => d.name.trim() || num(d.calories) > 0) && !saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveMeal({
        title,
        items: items.filter((d) => d.name.trim() || num(d.calories) > 0).map(toItem),
        photo_path: path,
      });
      saved.current = true;
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (step === "picking") {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackButton fallback="/food" />
          <Text style={styles.kicker}>LOG A MEAL</Text>

          {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />}

          {step === "reading" ? (
            <View style={styles.reading}>
              <ActivityIndicator color={tint} />
              <Text style={styles.readingText}>Your coach is reading your meal…</Text>
            </View>
          ) : (
            <>
              {error && <Text style={styles.error}>{error}</Text>}

              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Meal name"
                placeholderTextColor={colors.faint}
              />

              <View style={styles.totals}>
                <Text style={[styles.totalKcal, { color: tint }]}>
                  {totals.calories}
                  <Text style={styles.unit}> kcal</Text>
                </Text>
                <Text style={styles.totalMacros}>
                  P {Math.round(totals.protein_g)} · C {Math.round(totals.carbs_g)} · F {Math.round(totals.fat_g)}
                </Text>
              </View>

              {estimate?.note ? (
                <Text style={styles.note}>
                  {estimate.confidence === "low" ? "Rough guess. " : ""}
                  {estimate.note}
                </Text>
              ) : null}

              <View style={styles.card}>
                {items.map((d, i) => (
                  <View key={i} style={[styles.item, i > 0 && styles.itemLine]}>
                    <View style={styles.itemTop}>
                      <TextInput
                        style={styles.itemName}
                        value={d.name}
                        onChangeText={(t) => update(i, { name: t })}
                        placeholder="Food"
                        placeholderTextColor={colors.faint}
                      />
                      <Pressable
                        hitSlop={8}
                        onPress={() => setItems(items.filter((_, j) => j !== i))}
                        accessibilityLabel={`Remove ${d.name || "item"}`}
                      >
                        <Text style={styles.remove}>✕</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={styles.portion}
                      value={d.portion}
                      onChangeText={(t) => update(i, { portion: t })}
                      placeholder="Portion (e.g. 1 cup)"
                      placeholderTextColor={colors.faint}
                    />
                    <View style={styles.numbers}>
                      <NumberField label="kcal" value={d.calories} onChange={(t) => update(i, { calories: t })} />
                      <NumberField label="P" value={d.protein_g} onChange={(t) => update(i, { protein_g: t })} />
                      <NumberField label="C" value={d.carbs_g} onChange={(t) => update(i, { carbs_g: t })} />
                      <NumberField label="F" value={d.fat_g} onChange={(t) => update(i, { fat_g: t })} />
                    </View>
                  </View>
                ))}
                <Pressable style={styles.add} onPress={() => setItems([...items, blank])}>
                  <Text style={styles.addText}>+ Add food</Text>
                </Pressable>
              </View>

              {path && (
                <View style={styles.hintRow}>
                  <TextInput
                    style={styles.hintInput}
                    value={hint}
                    onChangeText={setHint}
                    placeholder="Wrong? Tell the coach (e.g. 8 oz steak, no oil)"
                    placeholderTextColor={colors.faint}
                  />
                  <Pressable
                    style={[styles.retry, !hint.trim() && disabledFill]}
                    disabled={!hint.trim()}
                    onPress={() => read(path, hint)}
                  >
                    <Text style={[styles.retryText, !hint.trim() && disabledText]}>Redo</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {step === "review" && (
          <View style={styles.footer}>
            <Pressable
              style={[styles.save, { backgroundColor: tint }, !canSave && !saving && disabledFill]}
              disabled={!canSave}
              onPress={save}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[styles.saveText, !canSave && disabledText]}>Save meal</Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.faint}
        selectTextOnFocus
      />
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  photo: { width: "100%", height: 220, borderRadius: radius, backgroundColor: colors.card },
  reading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 20 },
  readingText: { color: colors.soft, fontFamily: fonts.medium, fontSize: 15 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 14 },
  titleInput: { color: colors.text, fontFamily: fonts.heavy, fontSize: 26, paddingVertical: 4 },
  totals: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  totalKcal: { fontFamily: fonts.black, fontSize: 34, fontVariant: ["tabular-nums"] },
  unit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14 },
  totalMacros: { color: colors.soft, fontFamily: fonts.bold, fontSize: 14 },
  note: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16 },
  item: { paddingVertical: 12, gap: 6 },
  itemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemName: { flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 15, paddingVertical: 2 },
  remove: { color: colors.faint, fontSize: 16 },
  portion: { color: colors.soft, fontFamily: fonts.medium, fontSize: 13, paddingVertical: 2 },
  numbers: { flexDirection: "row", gap: 8 },
  field: { flex: 1, gap: 2 },
  fieldInput: {
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  fieldLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11, textAlign: "center" },
  add: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  addText: { color: colors.soft, fontFamily: fonts.bold, fontSize: 14 },
  hintRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  hintInput: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  retry: { backgroundColor: colors.text, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  retryText: { color: colors.bg, fontFamily: fonts.heavy, fontSize: 14 },
  footer: { paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  save: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  saveText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 17 },
});
