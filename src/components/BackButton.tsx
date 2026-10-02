import { Href, router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

import { colors } from "@/components/theme";

// Round back arrow used at the top of pushed screens.
export function BackButton({ fallback = "/", onPress }: { fallback?: Href; onPress?: () => void }) {
  return (
    <Pressable
      style={styles.back}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)))}
      accessibilityLabel="Back"
      hitSlop={8}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
        <Path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
});
