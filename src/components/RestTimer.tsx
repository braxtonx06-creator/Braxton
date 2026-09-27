import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";

import { colors, radius } from "@/components/theme";

// Countdown bar pinned to the bottom of the workout screen.
// `endsAt` is a timestamp so the timer stays right even if the screen re-renders.
export function RestTimer({
  endsAt,
  onChange,
}: {
  endsAt: number | null;
  onChange: (endsAt: number | null) => void;
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
    <View style={styles.bar}>
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
    bottom: 24,
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1, opacity: 0.8 },
  time: { color: "#fff", fontSize: 30, fontWeight: "800", fontVariant: ["tabular-nums"] },
  buttons: { flexDirection: "row", gap: 8 },
  button: { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
