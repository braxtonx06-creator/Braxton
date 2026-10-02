import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, radius } from "@/components/theme";

// Your PRs and the road to your goals. Filled in by the next redesign step.
export default function ProgressScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.content}>
        <Text style={styles.title}>Progress</Text>
        <View style={styles.card}>
          <Text style={styles.label}>COMING NEXT</Text>
          <Text style={styles.body}>Your road to 315, PRs and trends land here in the next update.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 30 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 18, gap: 6 },
  label: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.4 },
  body: { color: colors.soft, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
});
