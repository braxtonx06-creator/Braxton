import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, fonts } from "@/components/theme";

const SIZE = 112;
const STROKE = 10;
const R = (SIZE - STROKE) / 2 - 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

// The glowing readiness ring on Today. The glow is an iOS shadow in the ring's
// own color, so it follows the arc instead of a box.
export function ReadinessDial({ percent, color }: { percent: number; color: string }) {
  const filled = (CIRCUMFERENCE * Math.max(0, Math.min(percent, 100))) / 100;
  return (
    <View style={styles.wrap} accessibilityLabel={`Readiness ${percent} percent`}>
      <View style={[StyleSheet.absoluteFill, styles.glow, { shadowColor: color }]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.raised} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R - 11} stroke={color} strokeOpacity={0.25} strokeWidth={1} fill="none" />
        </Svg>
      </View>
      <Text style={styles.value}>
        {percent}
        <Text style={styles.percent}>%</Text>
      </Text>
      <Text style={styles.label}>READY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  glow: { shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  value: { color: colors.text, fontFamily: fonts.black, fontSize: 28 },
  percent: { fontSize: 14 },
  label: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 10, letterSpacing: 1 },
});
