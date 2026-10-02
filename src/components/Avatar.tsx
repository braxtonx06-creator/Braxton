import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { colors, fonts } from "@/components/theme";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Preset profile pictures. The choice is saved on the login itself (user
// metadata), so it follows you to any phone without a new table.
export const AVATARS = ["initial", "glove", "barbell", "bolt"] as const;
export type AvatarId = (typeof AVATARS)[number];

const ICONS: Record<Exclude<AvatarId, "initial">, string> = {
  glove: "M7 20v-3c-2-1-3-3-3-6V8a3 3 0 0 1 6 0V7a3 3 0 0 1 6 0v1a3 3 0 0 1 3 3v2c0 2-1 4-3 4v3zM7 20h10",
  barbell: "M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
};

export function useAvatar(): AvatarId {
  const chosen = useSession()?.user.user_metadata?.avatar;
  return AVATARS.includes(chosen) ? chosen : "initial";
}

export async function saveAvatar(avatar: AvatarId) {
  const { error } = await supabase.auth.updateUser({ data: { avatar } });
  if (error) throw error;
}

export function Avatar({
  id,
  name,
  size,
  ring,
  ringWidth = 2,
}: {
  id: AvatarId;
  name: string;
  size: number;
  ring: string;
  ringWidth?: number;
}) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, borderColor: ring, borderWidth: ringWidth },
      ]}
    >
      {id === "initial" ? (
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{name.slice(0, 1).toUpperCase()}</Text>
      ) : (
        <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <Path d={ICONS[id]} stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" },
  initial: { color: colors.text, fontFamily: fonts.black },
});
