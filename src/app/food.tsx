import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/BackButton";
import { ErrorState } from "@/components/ErrorState";
import { colors, fonts, radius } from "@/components/theme";
import { useTodayCheckIn } from "@/lib/checkIn";
import { deleteMeal, Meal, mealPhotoUrl, totalsOf, useTodayMeals } from "@/lib/food";
import { readinessFrom } from "@/lib/readiness";

// Today's food: totals up top, then each meal. Snap a meal to add one.
export default function FoodScreen() {
  const { meals, error, reload } = useTodayMeals();
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;
  const [open, setOpen] = useState<string | null>(null);

  if (error && !meals) return <ErrorState message={error} onRetry={reload} />;

  const totals = totalsOf(meals ?? []);

  const remove = (meal: Meal) => {
    const doIt = () =>
      deleteMeal(meal).then(reload, (e: Error) =>
        Platform.OS === "web" ? window.alert(e.message) : Alert.alert("Couldn't delete", e.message),
      );
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${meal.title}"?`)) doIt();
      return;
    }
    Alert.alert(`Delete "${meal.title}"?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doIt },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton />
        <View style={styles.header}>
          <Text style={styles.kicker}>TODAY</Text>
          <Text style={styles.title}>Food</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.bigRow}>
            <Text style={[styles.big, { color: tint }]}>{totals.calories}</Text>
            <Text style={styles.bigUnit}>kcal</Text>
          </View>
          <View style={styles.macros}>
            <Macro label="Protein" grams={totals.protein_g} />
            <Macro label="Carbs" grams={totals.carbs_g} />
            <Macro label="Fat" grams={totals.fat_g} />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primary, { backgroundColor: tint }]}
            onPress={() => router.push("/meal?from=camera")}
          >
            <Text style={styles.primaryText}>Snap a meal</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/meal?from=library")}>
            <Text style={styles.secondaryText}>From photos</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push("/meal?from=manual")} hitSlop={8}>
          <Text style={styles.link}>Log without a photo ›</Text>
        </Pressable>

        {!meals ? (
          <ActivityIndicator color={colors.muted} />
        ) : meals.length === 0 ? (
          <Text style={styles.empty}>Nothing logged yet today.</Text>
        ) : (
          <View style={styles.list}>
            {meals.map((m, i) => (
              <MealRow
                key={m.id}
                meal={m}
                first={i === 0}
                open={open === m.id}
                onToggle={() => setOpen(open === m.id ? null : m.id)}
                onDelete={() => remove(m)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>
        {Math.round(grams)}
        <Text style={styles.macroUnit}>g</Text>
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function MealRow({
  meal,
  first,
  open,
  onToggle,
  onDelete,
}: {
  meal: Meal;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (open && meal.photo_path && !photo) mealPhotoUrl(meal.photo_path).then(setPhoto);
  }, [open, meal.photo_path, photo]);

  const time = new Date(meal.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <View style={[styles.meal, !first && styles.mealLine]}>
      <Pressable style={styles.mealTop} onPress={onToggle}>
        <View style={styles.mealText}>
          <Text style={styles.mealTitle} numberOfLines={open ? undefined : 1}>
            {meal.title}
          </Text>
          <Text style={styles.mealMeta}>
            {time} · P {Math.round(meal.protein_g)} · C {Math.round(meal.carbs_g)} · F {Math.round(meal.fat_g)}
          </Text>
        </View>
        <Text style={styles.mealKcal}>
          {meal.calories}
          <Text style={styles.macroUnit}> kcal</Text>
        </Text>
      </Pressable>
      {open && (
        <View style={styles.mealBody}>
          {photo && <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />}
          {meal.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name} <Text style={styles.itemPortion}>· {item.portion}</Text>
              </Text>
              <Text style={styles.itemKcal}>{item.calories}</Text>
            </View>
          ))}
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text style={styles.delete}>Delete meal</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 60 },
  header: { gap: 4 },
  kicker: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 18, gap: 14 },
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { fontFamily: fonts.black, fontSize: 52, lineHeight: 56, fontVariant: ["tabular-nums"] },
  bigUnit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 16 },
  macros: { flexDirection: "row" },
  macro: { flex: 1, gap: 2 },
  macroValue: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22, fontVariant: ["tabular-nums"] },
  macroUnit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  macroLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10 },
  primary: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 16 },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.raised,
  },
  secondaryText: { color: colors.text, fontFamily: fonts.heavy, fontSize: 16 },
  link: { color: colors.soft, fontFamily: fonts.bold, fontSize: 13, textAlign: "center" },
  empty: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, textAlign: "center", marginTop: 10 },
  list: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16 },
  meal: { paddingVertical: 12, gap: 10 },
  mealLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  mealTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  mealText: { flex: 1, gap: 2 },
  mealTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  mealMeta: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  mealKcal: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18, fontVariant: ["tabular-nums"] },
  mealBody: { gap: 8 },
  photo: { width: "100%", height: 180, borderRadius: 14, backgroundColor: colors.raised },
  item: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  itemName: { flex: 1, color: colors.soft, fontFamily: fonts.medium, fontSize: 13 },
  itemPortion: { color: colors.muted },
  itemKcal: { color: colors.soft, fontFamily: fonts.semibold, fontSize: 13, fontVariant: ["tabular-nums"] },
  delete: { color: colors.danger, fontFamily: fonts.bold, fontSize: 13, marginTop: 4 },
});
