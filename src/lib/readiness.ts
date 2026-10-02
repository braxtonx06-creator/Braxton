// Today's readiness, worked out from the morning check-in with plain math (no
// AI), so the call is always explainable: sleep counts 40%, sleep quality
// 30%, how you feel 30%. A rough night or feeling beat up is always a
// recovery day, matching the lighter weights in program.ts.

import { readinessColors } from "@/components/theme";
import type { CheckIn } from "@/lib/checkIn";

export type ReadinessLevel = "push" | "steady" | "recover";

export type Readiness = {
  level: ReadinessLevel;
  percent: number; // 0-100
  verdict: string; // the big word on Today
  color: string;
};

const VERDICTS: Record<ReadinessLevel, string> = { push: "PUSH", steady: "STEADY", recover: "RECOVER" };

export function readinessFrom(checkIn: CheckIn): Readiness {
  const sleep = Math.min(checkIn.sleepHours / 8, 1) * 40;
  const quality = ((checkIn.sleepQuality - 1) / 4) * 30;
  const feeling = ((checkIn.feeling - 1) / 4) * 30;
  const percent = Math.round(sleep + quality + feeling);

  const rough = checkIn.sleepHours < 6 || checkIn.sleepQuality <= 2 || checkIn.feeling <= 2;
  const level: ReadinessLevel = rough || percent < 50 ? "recover" : percent >= 75 ? "push" : "steady";
  return { level, percent, verdict: VERDICTS[level], color: readinessColors[level] };
}
