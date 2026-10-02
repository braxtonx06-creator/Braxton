import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { colors } from "@/components/theme";
import { SessionProvider, useSession } from "@/lib/auth";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <RootStack />
    </SessionProvider>
  );
}

function RootStack() {
  const session = useSession();

  // Still checking for a saved login: show a blank screen for a moment.
  if (session === undefined) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const signedIn = session !== null;

  // Protected screens only exist while their guard is true, so signing in or
  // out automatically moves the user to the right place.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="journal" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="program" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="workout/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
