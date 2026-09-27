// Placeholder data for the home screen.
// Only the food card still uses it; meal logging replaces it later.

export type DailyRundown = {
  date: string;
  food: { calories: number; proteinG: number; carbsG: number; fatG: number; note: string };
};

export const placeholderRundown: DailyRundown = {
  date: new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
  food: {
    calories: 3100,
    proteinG: 190,
    carbsG: 360,
    fatG: 90,
    note: "Carbs higher today: two sessions.",
  },
};
