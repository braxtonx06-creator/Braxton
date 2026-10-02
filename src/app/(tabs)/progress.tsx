import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { ErrorState } from "@/components/ErrorState";
import { colors, fonts, radius } from "@/components/theme";
import { useTodayCheckIn } from "@/lib/checkIn";
import { formatHours, Point, ProgressData, shortDate, useProgress } from "@/lib/progress";
import { readinessFrom } from "@/lib/readiness";
import { formatResult, getTestWorkoutId } from "@/lib/training";

// The road to your goal, your PRs and the week in numbers.
export default function ProgressScreen() {
  const { data, error, reload } = useProgress();
  const { checkIn } = useTodayCheckIn();
  const tint = checkIn ? readinessFrom(checkIn).color : colors.accent;
  const [building, setBuilding] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const retake = async () => {
    setBuilding(true);
    setTestError(null);
    try {
      router.push(`/workout/${await getTestWorkoutId()}`);
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Progress</Text>
        {!data ? (
          <ActivityIndicator color={colors.muted} style={styles.loading} />
        ) : (
          <>
            {data.hero ? (
              <HeroCard hero={data.hero} tint={tint} />
            ) : (
              <View style={styles.card}>
                <Text style={styles.body}>Finish your testing workout and your numbers show up here.</Text>
              </View>
            )}

            <View style={styles.tiles}>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>{data.block ? "SESSIONS THIS BLOCK" : "SESSIONS"}</Text>
                <Text style={styles.tileValue}>
                  {data.block ? `${data.block.done} / ${data.block.total}` : data.sessions}
                </Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>AVG SLEEP · 7 DAYS</Text>
                <Text style={styles.tileValue}>{data.avgSleep !== null ? formatHours(data.avgSleep) : "—"}</Text>
              </View>
            </View>

            {data.recent.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>RECENT PRS</Text>
                <View style={styles.list}>
                  {data.recent.slice(0, 5).map((r, i, all) => {
                    const shown = formatResult(r.value, r.unit);
                    return (
                      <View key={r.metric} style={[styles.row, i < all.length - 1 && styles.rowLine]}>
                        <View style={styles.rowText}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text style={styles.rowDate}>{shortDate(r.date)}</Text>
                        </View>
                        <Text style={[styles.rowValue, i === 0 && { color: tint }]}>
                          {shown.value}
                          <Text style={styles.rowUnit}> {shown.unit.replace(/ est\. max$/, "")}</Text>
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <Pressable style={styles.retake} disabled={building} onPress={retake} hitSlop={8}>
              <Text style={styles.retakeText}>{building ? "Building your test…" : "Retake test"}</Text>
            </Pressable>
            {testError && <Text style={styles.error}>{testError}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroCard({ hero, tint }: { hero: NonNullable<ProgressData["hero"]>; tint: string }) {
  const toGo = hero.goal ? hero.goal - hero.value : null;
  const shortName = hero.name.replace(/^barbell\s+/i, "").toUpperCase();
  return (
    <View style={styles.card}>
      <View style={styles.heroTop}>
        <Text style={styles.label} numberOfLines={1}>
          {shortName} · EST. MAX
        </Text>
        {hero.goal && <Text style={styles.goal}>goal {hero.goal}</Text>}
      </View>
      <View style={styles.heroNumbers}>
        <Text style={[styles.heroValue, { color: tint }]}>{hero.value}</Text>
        <Text style={styles.heroUnit}>lb</Text>
        {toGo !== null && <Text style={styles.toGo}>{toGo > 0 ? `${toGo} lb to go` : "Goal hit"}</Text>}
      </View>
      {hero.goal && (
        <View style={styles.bar}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.min(100, (hero.value / hero.goal) * 100)}%`, backgroundColor: tint },
            ]}
          />
        </View>
      )}
      <Trend points={hero.history} goal={hero.goal} tint={tint} />
    </View>
  );
}

// Your estimated max over time, with the goal as a dashed line on top.
function Trend({ points, goal, tint }: { points: Point[]; goal: number | null; tint: string }) {
  const [width, setWidth] = useState(0);
  // One test so far: a short strip, not an empty chart.
  const CHART_H = points.length > 1 ? 110 : 72;
  const values = points.map((p) => p.value);
  const top = Math.max(goal ?? 0, ...values);
  const bottom = Math.min(...values) - Math.max(10, (top - Math.min(...values)) * 0.25);
  const y = (v: number) => 18 + ((top - v) / (top - bottom || 1)) * (CHART_H - 40);
  const x = (i: number) => (points.length === 1 ? width - 8 : 8 + (i / (points.length - 1)) * (width - 16));
  const last = points.length - 1;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={CHART_H}>
          {goal && (
            <>
              <Line x1={0} y1={y(goal)} x2={width} y2={y(goal)} stroke={colors.line} strokeDasharray="4 5" />
              <SvgText x={0} y={y(goal) - 6} fill={colors.faint} fontSize={10} fontFamily={fonts.medium}>
                {goal} goal
              </SvgText>
            </>
          )}
          {points.length > 1 && (
            <Polyline
              points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
              fill="none"
              stroke={tint}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <Circle cx={x(last)} cy={y(points[last].value)} r={5} fill={tint} />
          <SvgText x={0} y={CHART_H - 2} fill={colors.faint} fontSize={10} fontFamily={fonts.medium}>
            {points.length > 1 ? shortDate(points[0].date) : `Tested ${shortDate(points[0].date)}`}
          </SvgText>
          <SvgText
            x={width}
            y={CHART_H - 2}
            fill={colors.faint}
            fontSize={10}
            fontFamily={fonts.medium}
            textAnchor="end"
          >
            {points.length > 1 ? "now" : "PRs add to this line"}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 120 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 30 },
  loading: { marginTop: 40 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 14 },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, flexShrink: 1 },
  body: { color: colors.soft, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  goal: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  heroNumbers: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  heroValue: { fontFamily: fonts.black, fontSize: 52, lineHeight: 56, fontVariant: ["tabular-nums"] },
  heroUnit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 16 },
  toGo: { marginLeft: "auto", color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius, padding: 16, gap: 6 },
  tileLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1 },
  tileValue: { color: colors.text, fontFamily: fonts.heavy, fontSize: 26, fontVariant: ["tabular-nums"] },
  section: { gap: 10 },
  list: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, gap: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { flex: 1 },
  rowName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  rowDate: { color: colors.faint, fontFamily: fonts.medium, fontSize: 12, marginTop: 2 },
  rowValue: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18, fontVariant: ["tabular-nums"] },
  rowUnit: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  retake: { alignItems: "center", paddingVertical: 8 },
  retakeText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 14 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13, textAlign: "center" },
});
