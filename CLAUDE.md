# Project handoff: Personal O.S (working title)

You're helping me, Braxton, build an app called **Personal O.S** (working title). Read this whole brief first. Then save it as `CLAUDE.md` in the project root so you keep this context in every session.

---

## 1. What the app is

Personal O.S is an AI coach that knows the user better than any app, so it can tell them **what to do today and why**.

- **Mission:** build an AI system that uses stats and knowledge for optimal human performance.
- **Vision:** an AI that deeply understands someone and helps them become healthier, happier and more productive. It replaces the need for several apps or trainers.
- **Problems it solves:**
  1. The daily "what should I do today?"
  2. Paying for several apps and subscriptions to track workouts, meals and training
  3. Having stats (running dynamics, sleep, HRV, body weight) with no idea how to use them to improve

**Important:** this app is NOT "Jarvis." Jarvis is my separate personal life OS (money, career, business, brand), and it's parked for now. Personal O.S covers only training, nutrition, sleep, recovery and body weight. Don't mix the two.

## 2. Who it's for and how it launches

1. **Build for me first.** I'm user #1.
2. **Release it free** once it works the way I want. It should work for any kind of user, not just fighters.
3. **Paid plans later.** What goes in them is still undecided, so don't build any billing.

**About me (user #1):**
- 20-year-old MMA fighter and triathlete, dedicated to fitness and constant improvement
- I walk around at 180 lb and fight at 165 lb. No fight is booked right now
- Strength goal: 315 lb bench. I hit 300 in March 2026; my estimated 1RM is around 270 now
- I lift 5 days a week, plus MMA/boxing/grappling 2–3 days a week
- Home gym: rack, barbells, dumbbells, bench, climbing rope, bands, sled, prowler, boxes, 15 m turf, weighted chin-up bar, chains. No leg press, no cable machine
- I wear a **Garmin**
- Typical weekday: wake 5:40, work 7–2, gym 4–5:30, MMA 6:30–8, side projects 8:30–9:30, bed 10–10:30
- Typical Saturday: wake 9:30, MMA 10:15–12:30, chores 1–4, evening with friends
- What motivates me: being in the best shape I can be, feeling my best, beating my own PRs, being better than others, and seeing big improvement
- Decisions that stress me out: what to eat and what not to eat

## 3. The core experience

**Every time the user opens the app** they see:
- **A rundown of their day:** today's training, today's food, and their recovery/readiness in plain words
- **One sentence from the coach.** It can be a question the AI asks to learn about the user, a nudge or insight ("You slept 5 hours, so today's lift is lighter"), or feedback on progress. We'll tune the exact format through real use.

## 4. AI coach and journaling

The coach should be realistic but push the user, and grow with them over time.

1. **Onboarding journal (first open).** Deep questions to understand the user:
   - Who are you, and what do you train for?
   - What frustrates you about training and tracking right now?
   - What motivates you?
   - What do you want out of life?
   - What do a normal weekday and weekend look like?
   - Which decisions stress you out?
   - When are you happiest?
   - Goals, current numbers, equipment, injuries, and upcoming events like a fight or race
2. **Daily check-in:** one or two quick questions (sleep, how you feel, how training went). It happens in the morning, the evening or both, depending on the user and what the coach needs.
3. **Weekly check-up:** how the week went, what's working, what isn't, and feedback on the program.
4. **Adapt:** the coach adjusts the program from the answers and data, then explains what changed and why.

Everything the user answers goes into the coach's **long-term memory** about that user.

## 5. Training and nutrition

**Training**
- The AI **never writes MMA classes**. Those are in person with a real coach, and the app schedules around them.
- The AI writes the lifting and conditioning program.
- **Fight-camp mode:** adds extra work around class, like heavy bag, air bike or stretching, and says what to focus on each session. This goes with a weight-cut mode (180 → 165 lb) and moves up in priority as soon as a fight is booked.

**Nutrition.** Each user picks a mode:
- **Meal plan:** the app tells them what to eat
- **Logging only:** they eat what they want and track it
- **Meal photo logging (CRITICAL):** snap a photo and the app automatically fills in the food, portions, calories and macros. The user can correct anything it gets wrong.

## 6. Roadmap

**Phase 1: build for me (NOW).** Keep scope tight.
- Onboarding journal
- Home screen: daily rundown + one coach sentence
- AI-written lifting/conditioning program
- Daily and weekly check-ins
- Meal photo logging
- Garmin sync (important, since I use Garmin)
- Gate to move on: I actually use it every day

**Phase 2: free release**
- Open to every user
- Apple Health, Whoop and Oura sync
- Meal plans
- Weight-cut and fight-camp mode (moves into Phase 1 if I book a fight)
- Stats explained simply
- "See where you stand" against others. This stays light; the main focus is the user vs. their own PRs
- Gate to move on: users keep coming back

**Phase 3: paid plans (later)**
- Paid tiers (still undecided)
- Trainer/team access: a coach can view every athlete's program and stats and make changes

## 7. Principles and guardrails

- Everything is personalized to the user's goals, data and schedule
- Actionable first: what to do, then why
- Evidence-based, grounded in sports science
- Reduce mental load: one clear plan instead of five apps
- Realistic but pushing
- Wellness coaching only: no diagnosing injuries or conditions
- Weight cuts stay within safe, evidence-based limits and flag anything risky
- The user approves big program changes
- Users can export or delete their data at any time
- Never hard-code secrets. API keys go in environment variables, never committed

## 8. Tech direction

- iPhone first
- React Native with Expo
- Supabase (Postgres, auth, storage for meal photos)
- Claude API as the AI coach (rundowns, check-ins, program changes, meal-photo analysis with vision)
- Garmin integration: check the current Garmin Connect / Health API access requirements before planning around it, and tell me what approval or developer account it needs

If you think part of this stack is a bad fit, say so and explain why before switching.

## 9. How to work with me

- I'm learning to code with AI help and want to build real skills. Explain what you're doing and why in plain language, briefly.
- **Flag me when I'm adding complexity instead of shipping the basics.** Phase 1 comes first.
- If you're unsure about something, say so. Ask me for evidence or a decision rather than inventing an answer.
- Work in small steps I can test on my phone. Before each chunk of work, give me a short plan; after it, tell me how to run and test it.
- I have about 3 hours a day to build.

## 10. First task

1. Save this brief as `CLAUDE.md`.
2. Ask me any questions you need answered before starting (keep it to the important ones).
3. Propose a Phase 1 build plan broken into small milestones, each one something I can see working on my phone.
4. Then set up the Expo project with a home screen that shows a placeholder daily rundown and coach sentence.

---

@AGENTS.md
