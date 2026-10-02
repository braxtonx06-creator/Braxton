import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
  useFonts,
} from "@expo-google-fonts/archivo";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { colors } from "@/components/theme";
import { SessionProvider, useSession } from "@/lib/auth";

export default function RootLayout() {
  // Wait for the fonts so text doesn't flash in the system font first.
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

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
  // out automatically moves the user to the right place. The four main
  // screens live in the (tabs) group; the rest open on top of them.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="journal" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="workout/[id]" />
        <Stack.Screen name="day/[day]" />
        <Stack.Screen name="food" />
        <Stack.Screen name="meal" />
        <Stack.Screen name="weight" />
        <Stack.Screen name="chat" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
