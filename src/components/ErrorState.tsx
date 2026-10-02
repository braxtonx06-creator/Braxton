import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/components/theme";

// Full-screen message for when loading from Supabase fails (usually no signal).
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Couldn't load your data</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  message: { color: colors.muted, fontSize: 15 },
  button: { backgroundColor: colors.card, borderRadius: radius, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "600" },
});
