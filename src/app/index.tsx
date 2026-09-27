import { Link, Redirect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/components/theme";
import { placeholderRundown as today } from "@/data/today";
import { useJournal } from "@/lib/journal";

export default function HomeScreen() {
  const { journal } = useJournal();
  const { food, readiness } = today;

  if (!journal) return <View style={styles.safe} />;
  // First open: the coach needs to meet you before it can plan your day.
  if (!journal.completedAt) return <Redirect href="/onboarding" />;

  const name = journal.answers.name?.trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.date}>{today.date}</Text>
          <Link href="/journal" asChild>
            <Pressable hitSlop={12}>
              <Text style={styles.journalLink}>Journal</Text>
            </Pressable>
          </Link>
        </View>
        <Text style={styles.title}>{name ? `Today, ${name}` : "Today"}</Text>

        {/* The one coach sentence */}
        <View style={styles.coach}>
          <Text style={styles.coachLabel}>COACH</Text>
          <Text style={styles.coachText}>{today.coachSentence}</Text>
        </View>

        <Section title="Readiness">
          <View style={styles.row}>
            <Text style={[styles.big, { color: colors.good }]}>{readiness.level}</Text>
            <View style={styles.stats}>
              <Stat label="Sleep" value={`${readiness.sleepHours} h`} />
              <Stat label="Resting HR" value={`${readiness.restingHr} bpm`} />
              <Stat label="Weight" value={`${today.bodyWeightLb} lb`} />
            </View>
          </View>
          <Text style={styles.body}>{readiness.summary}</Text>
        </Section>

        <Section title="Training">
          {today.training.map((s) => (
            <View key={s.title} style={styles.session}>
              <View style={styles.row}>
                <Text style={styles.sessionTime}>{s.time}</Text>
                {s.source === "coach" && <Text style={styles.tag}>IN PERSON</Text>}
              </View>
              <Text style={styles.sessionTitle}>{s.title}</Text>
              <Text style={styles.body}>{s.detail}</Text>
            </View>
          ))}
        </Section>

        <Section title="Food">
          <View style={styles.stats}>
            <Stat label="Calories" value={food.calories.toLocaleString()} />
            <Stat label="Protein" value={`${food.proteinG} g`} />
            <Stat label="Carbs" value={`${food.carbsG} g`} />
            <Stat label="Fat" value={`${food.fatG} g`} />
          </View>
          <Text style={styles.body}>{food.note}</Text>
        </Section>

        <Text style={styles.footer}>Placeholder data. Real plans and stats come in later milestones.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: colors.muted, fontSize: 14 },
  journalLink: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 34, fontWeight: "800", marginBottom: 4 },
  coach: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    padding: 16,
    gap: 6,
  },
  coachLabel: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  coachText: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: "600" },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 10 },
  cardTitle: { color: colors.muted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  big: { fontSize: 28, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
  stat: { gap: 2 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  session: { gap: 4, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  sessionTime: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  sessionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  tag: {
    color: colors.coachTag,
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.coachTag,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  footer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
});
