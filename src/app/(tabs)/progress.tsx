import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NumbersCard } from "@/components/TrainingCard";
import { colors, fonts, radius } from "@/components/theme";
import { getTestWorkoutId, useTrainingSummary } from "@/lib/training";

// Your tested numbers for now; the road to your goals and PR trends come next.
export default function ProgressScreen() {
  const { summary } = useTrainingSummary();
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retake = async () => {
    setBuilding(true);
    setError(null);
    try {
      router.push(`/workout/${await getTestWorkoutId()}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Progress</Text>
        {summary?.test?.status === "completed" ? (
          <NumbersCard summary={summary} building={building} error={error} onRetake={retake} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.body}>Finish your testing workout and your numbers show up here.</Text>
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.label}>COMING NEXT</Text>
          <Text style={styles.body}>The road to your goals, PRs and trends.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 120 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 30 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 18, gap: 6 },
  label: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.4 },
  body: { color: colors.soft, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
});
