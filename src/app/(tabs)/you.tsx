import { Href, router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, AvatarId, AVATARS, saveAvatar, useAvatar } from "@/components/Avatar";
import { colors, fonts, radius } from "@/components/theme";
import { useTodayCheckIn } from "@/lib/checkIn";
import { useJournal } from "@/lib/journal";
import { ProgressData, shortDate, useProgress } from "@/lib/progress";
import { readinessFrom } from "@/lib/readiness";
import { supabase } from "@/lib/supabase";
import { formatResult } from "@/lib/training";

// Your profile: picture, headline numbers, trophies, and everything the coach knows.
export default function YouScreen() {
  const { journal } = useJournal();
  const { data } = useProgress();
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;
  const name = journal?.answers.name?.trim() || "You";
  const saved = useAvatar();
  const [picked, setPicked] = useState<AvatarId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatar = picked ?? saved;

  const pick = async (id: AvatarId) => {
    setPicked(id);
    setError(null);
    try {
      await saveAvatar(id);
    } catch (e) {
      setPicked(null);
      setError((e as Error).message);
    }
  };

  const hero = data?.hero;
  const lift = hero ? hero.metric.split("_")[0] : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Avatar id={avatar} name={name} size={92} ring={tint} ringWidth={3} />
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
              {name.toUpperCase()}
            </Text>
            {!!data?.focuses.length && (
              <Text style={styles.focuses} numberOfLines={2}>
                {data.focuses.join(" · ")}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>PROFILE PICTURE</Text>
          <View style={styles.picker}>
            {AVATARS.map((id) => (
              <Pressable key={id} onPress={() => pick(id)} accessibilityLabel={`Avatar: ${id}`} hitSlop={4}>
                <Avatar id={id} name={name} size={52} ring={id === avatar ? tint : colors.line} />
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>Your own photo comes later.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.stats}>
          <Stat
            value={hero ? String(hero.value) : "—"}
            label={lift ? `${lift[0].toUpperCase()}${lift.slice(1)} max` : "Top lift"}
            color={tint}
          />
          <Stat value={data?.bodyWeight ? String(data.bodyWeight) : "—"} label="Body weight" />
          <Stat value={data ? String(data.sessions) : "—"} label="Sessions" last />
        </View>

        {data && <Trophies data={data} tint={tint} />}

        <View style={styles.list}>
          <Row
            label="Your week"
            detail={data?.week ? `${data.week.lifts} lifts · ${data.week.classes} MMA` : "Lift days, MMA"}
            href="/goals"
          />
          <Row label="What your coach knows" detail="Journal, delete" href="/journal" last />
        </View>

        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, color, last }: { value: string; label: string; color?: string; last?: boolean }) {
  return (
    <View style={[styles.stat, !last && styles.statLine]}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Earned: your numbers (main lift first) and the check-in streak. Then the next goal, greyed out.
function Trophies({ data, tint }: { data: ProgressData; tint: string }) {
  const goal = data.hero?.goal;
  const slots = 4 - (data.streak > 0 ? 1 : 0) - (goal ? 1 : 0);
  const earned = [...data.recent]
    .sort((a, b) => Number(b.metric === data.hero?.metric) - Number(a.metric === data.hero?.metric))
    .slice(0, slots);
  if (!earned.length && !data.streak) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.label}>TROPHY CASE</Text>
      <View style={styles.trophies}>
        {earned.map((r) => (
          <Trophy
            key={r.metric}
            badge={formatResult(r.value, r.unit).value}
            caption={`${r.name.replace(/^barbell\s+/i, "")}\n${shortDate(r.date)}`}
            ring={r.metric === data.hero?.metric ? tint : colors.text}
          />
        ))}
        {data.streak > 0 && <Trophy badge={String(data.streak)} caption={"Check-in\nstreak"} ring={colors.text} />}
        {goal && <Trophy badge={String(goal)} caption="Next up" ring={colors.faint} next />}
      </View>
    </View>
  );
}

function Trophy({ badge, caption, ring, next }: { badge: string; caption: string; ring: string; next?: boolean }) {
  return (
    <View style={[styles.trophy, next && styles.trophyNext]}>
      <View style={[styles.badge, { borderColor: ring }, next && styles.badgeNext]}>
        <Text style={[styles.badgeText, { color: next ? colors.muted : ring }]} numberOfLines={1} adjustsFontSizeToFit>
          {badge}
        </Text>
      </View>
      <Text style={styles.caption} numberOfLines={3}>
        {caption}
      </Text>
    </View>
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
  content: { padding: 20, gap: 16, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 8 },
  headerText: { flex: 1, gap: 4 },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: 30, lineHeight: 34 },
  focuses: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  label: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.4 },
  picker: { flexDirection: "row", gap: 10 },
  hint: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  stats: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius, paddingVertical: 14 },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 4 },
  statLine: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line },
  statValue: { color: colors.text, fontFamily: fonts.black, fontSize: 26, fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11 },
  section: { gap: 10 },
  trophies: { flexDirection: "row", gap: 10 },
  trophy: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 8,
  },
  trophyNext: { opacity: 0.45 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeNext: { borderStyle: "dashed" },
  badgeText: { fontFamily: fonts.black, fontSize: 13 },
  caption: { color: colors.soft, fontFamily: fonts.medium, fontSize: 11, textAlign: "center" },
  list: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLabel: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  rowDetail: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  signOut: { alignItems: "center", paddingVertical: 12 },
  signOutText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 15 },
});
