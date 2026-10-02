import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";

import { colors, fonts, radius } from "@/components/theme";

// Countdown bar pinned near the bottom of the workout screen (above the
// Start/Finish button), in today's readiness color.
// `endsAt` is a timestamp so the timer stays right even if the screen re-renders.
export function RestTimer({
  endsAt,
  onChange,
  tint = colors.accent,
  bottom = 24,
}: {
  endsAt: number | null;
  onChange: (endsAt: number | null) => void;
  tint?: string;
  bottom?: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt) {
        Vibration.vibrate(600);
        onChange(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [endsAt, onChange]);

  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <View style={[styles.bar, { backgroundColor: tint, bottom }]}>
      <View>
        <Text style={styles.label}>REST</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable style={styles.button} onPress={() => onChange(endsAt + 30_000)}>
          <Text style={styles.buttonText}>+30s</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => onChange(null)}>
          <Text style={styles.buttonText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: radius,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { color: colors.onAccent, fontSize: 11, fontWeight: "800", letterSpacing: 1, opacity: 0.8 },
  time: { color: colors.onAccent, fontFamily: fonts.black, fontSize: 30, fontVariant: ["tabular-nums"] },
  buttons: { flexDirection: "row", gap: 8 },
  button: { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
});
