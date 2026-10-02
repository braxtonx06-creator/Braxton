import { Href, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, radius } from "@/components/theme";
import { useJournal } from "@/lib/journal";
import { supabase } from "@/lib/supabase";

// Your profile and everything the coach knows about you.
export default function YouScreen() {
  const { journal } = useJournal();
  const name = journal?.answers.name?.trim() || "You";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{name.toUpperCase()}</Text>
        </View>

        <View style={styles.list}>
          <Row label="Your week and goals" detail="Lift days, MMA, numbers" href="/goals" />
          <Row label="What your coach knows" detail="Journal" href="/journal" last />
        </View>

        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, detail, href, last }: { label: string; detail: string; href: Href; last?: boolean }) {
  return (
    <Pressable style={[styles.row, !last && styles.rowLine]} onPress={() => router.push(href)}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowDetail}>{detail} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.raised,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent, fontFamily: fonts.black, fontSize: 28 },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: 30, letterSpacing: 0.5 },
  list: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLabel: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  rowDetail: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  signOut: { alignItems: "center", paddingVertical: 12 },
  signOutText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 15 },
});
