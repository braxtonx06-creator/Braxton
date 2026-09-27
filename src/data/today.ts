// Placeholder data for the home screen.
// Later milestones replace this with real data: the AI-written program,
// meal logs, check-in answers and Garmin sync.

export type TrainingSession = {
  time: string;
  title: string;
  detail: string;
  // "coach" sessions (MMA classes) are run in person; the app only schedules around them.
  source: "program" | "coach";
};

export type DailyRundown = {
  date: string;
  training: TrainingSession[];
  food: { calories: number; proteinG: number; carbsG: number; fatG: number; note: string };
};

export const placeholderRundown: DailyRundown = {
  date: new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
  training: [
    {
      time: "4:00 – 5:30 PM",
      title: "Upper strength: bench focus",
      detail: "Bench 5×3 building to 235 · Weighted chin-ups 4×5 · DB row 3×10 · Sled push finisher",
      source: "program",
    },
    {
      time: "6:30 – 8:00 PM",
      title: "MMA class",
      detail: "With your coach. Eat your pre-class snack by 5:45.",
      source: "coach",
    },
  ],
  food: {
    calories: 3100,
    proteinG: 190,
    carbsG: 360,
    fatG: 90,
    note: "Carbs higher today: two sessions.",
  },
};
