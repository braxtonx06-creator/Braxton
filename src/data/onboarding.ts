// The onboarding journal: the questions the coach asks on first open.
// Answers become the start of the coach's long-term memory about the user.

export type OnboardingQuestion = {
  id: string;
  prompt: string;
  hint?: string;
  // Short answers get a single-line input; everything else gets a text box.
  short?: boolean;
  required?: boolean;
};

export const onboardingQuestions: OnboardingQuestion[] = [
  { id: "name", prompt: "What should I call you?", short: true, required: true },
  {
    id: "identity",
    prompt: "Who are you, and what do you train for?",
    hint: "Sports, level, what you're chasing right now.",
    required: true,
  },
  {
    id: "frustrations",
    prompt: "What frustrates you about training and tracking right now?",
  },
  { id: "motivation", prompt: "What motivates you?" },
  { id: "lifeGoals", prompt: "What do you want out of life?" },
  {
    id: "weekday",
    prompt: "What does a normal weekday look like?",
    hint: "Wake time, work, training, bedtime.",
    required: true,
  },
  { id: "weekend", prompt: "And a normal weekend?" },
  { id: "stressDecisions", prompt: "Which decisions stress you out?" },
  { id: "happiest", prompt: "When are you happiest?" },
  {
    id: "goals",
    prompt: "What are your training goals?",
    hint: "e.g. 315 lb bench, sub-20 5K, make 165 lb.",
    required: true,
  },
  {
    id: "numbers",
    prompt: "What are your current numbers?",
    hint: "Body weight, main lifts, paces, anything you track.",
  },
  {
    id: "equipment",
    prompt: "What equipment do you have?",
    hint: "Home gym, commercial gym, what's missing.",
    required: true,
  },
  {
    id: "injuries",
    prompt: "Any injuries or pain to work around?",
    hint: '"None" is a fine answer.',
    required: true,
  },
  {
    id: "events",
    prompt: "Any upcoming events?",
    hint: "Fight, race, meet, and the date if you know it.",
  },
];
