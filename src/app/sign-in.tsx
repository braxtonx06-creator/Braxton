import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, disabledFill, disabledText, radius } from "@/components/theme";
import { supabase } from "@/lib/supabase";

// Email + password sign in. Once signed in, the root layout switches to the app.
export default function SignInScreen() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // With "Confirm email" on in Supabase, there is no session until the email link is tapped.
        if (!data.session) {
          setMode("signIn");
          setMessage({ text: "Check your email to confirm your account, then sign in.", isError: false });
        }
      }
    } catch (e) {
      setMessage({ text: (e as Error).message, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.includes("@") && password.length >= 6 && !busy;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={styles.logo}>Personal O.S</Text>
        <Text style={styles.title}>{mode === "signIn" ? "Welcome back" : "Create your account"}</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password (6+ characters)"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          textContentType={mode === "signIn" ? "password" : "newPassword"}
          onSubmitEditing={canSubmit ? submit : undefined}
        />

        {message && <Text style={message.isError ? styles.error : styles.info}>{message.text}</Text>}

        <Pressable style={[styles.button, !canSubmit && !busy && disabledFill]} disabled={!canSubmit} onPress={submit}>
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.buttonText, !canSubmit && disabledText]}>{mode === "signIn" ? "Sign in" : "Create account"}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setMessage(null);
          }}
        >
          <Text style={styles.switch}>
            {mode === "signIn" ? "New here? Create an account" : "Have an account? Sign in"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: 20, justifyContent: "center", gap: 14 },
  logo: { color: colors.accent, fontSize: 14, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 30, fontWeight: "800", marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    fontSize: 17,
  },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 16, alignItems: "center" },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: "700" },
  switch: { color: colors.accent, fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 4 },
  error: { color: "#F87171", fontSize: 14 },
  info: { color: colors.good, fontSize: 14 },
});
