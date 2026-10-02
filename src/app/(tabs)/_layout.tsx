import { router, Tabs } from "expo-router";
import { ColorValue, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { colors, fonts } from "@/components/theme";

// The four main screens along the bottom, plus the Coach button that floats
// above every one of them.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          // Archivo's labels sit lower than the system font, so give the bar a little more room.
          tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.line, height: 56 + insets.bottom },
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Today", tabBarIcon: ({ color }) => <TodayIcon color={color} /> }}
        />
        <Tabs.Screen
          name="training"
          options={{ title: "Training", tabBarIcon: ({ color }) => <TrainingIcon color={color} /> }}
        />
        <Tabs.Screen
          name="progress"
          options={{ title: "Progress", tabBarIcon: ({ color }) => <ProgressIcon color={color} /> }}
        />
        <Tabs.Screen name="you" options={{ title: "You", tabBarIcon: ({ color }) => <YouIcon color={color} /> }} />
      </Tabs>

      <Pressable style={styles.coach} onPress={() => router.push("/chat")} accessibilityLabel="Talk to your coach">
        <View style={styles.coachBadge}>
          <Text style={styles.coachBadgeText}>C</Text>
        </View>
        <Text style={styles.coachText}>Coach</Text>
      </Pressable>
    </View>
  );
}

const icon = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", strokeWidth: 2 } as const;
const line = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

function TodayIcon({ color }: { color: ColorValue }) {
  return (
    <Svg {...icon} stroke={color}>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" {...line} />
    </Svg>
  );
}

function TrainingIcon({ color }: { color: ColorValue }) {
  return (
    <Svg {...icon} stroke={color}>
      <Path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" {...line} />
    </Svg>
  );
}

function ProgressIcon({ color }: { color: ColorValue }) {
  return (
    <Svg {...icon} stroke={color}>
      <Path d="M4 19h16M6 15l4-4 3 3 5-6" {...line} />
    </Svg>
  );
}

function YouIcon({ color }: { color: ColorValue }) {
  return (
    <Svg {...icon} stroke={color}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5" {...line} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  coach: {
    position: "absolute",
    right: 16,
    bottom: 100,
    height: 46,
    paddingLeft: 6,
    paddingRight: 18,
    borderRadius: 23,
    backgroundColor: colors.text,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  coachBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  coachBadgeText: { color: colors.text, fontFamily: fonts.black, fontSize: 14 },
  coachText: { color: colors.bg, fontFamily: fonts.heavy, fontSize: 15 },
});
