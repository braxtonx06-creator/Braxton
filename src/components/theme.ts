// The look: a neutral charcoal base where the only color is today's readiness
// (volt green = push, orange = steady, red = recover). Everything else is
// white and grey, so the color itself tells you the verdict.

export const readinessColors = {
  push: "#B8F34A",
  steady: "#FF8A1F",
  recover: "#FF4A4A",
};

export const colors = {
  bg: "#17191E",
  card: "#22252C",
  raised: "#2B2F37",
  line: "#363A43",
  tabBar: "#1C1E23",
  text: "#F2F3F5",
  soft: "#C9CCD3",
  muted: "#9096A3",
  faint: "#6B7180",
  // Buttons, highlights and progress: the "push" color until a screen knows today's readiness.
  accent: readinessColors.push,
  onAccent: "#17191E", // text on an accent fill (white on volt is unreadable)
  good: readinessColors.push,
  danger: "#FF7A7A",
  coachTag: "#F2F3F5",
};

export const radius = 20;

// Archivo, loaded in the root layout. Heavier weights are separate font files.
export const fonts = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  heavy: "Archivo_800ExtraBold",
  black: "Archivo_900Black",
};

// A button that can't be pressed yet is flat grey. (Fading the accent instead
// turns volt green into a muddy olive.) While a button is busy with a spinner
// it keeps its accent fill.
export const disabledFill = { backgroundColor: colors.raised };
export const disabledText = { color: colors.faint };
