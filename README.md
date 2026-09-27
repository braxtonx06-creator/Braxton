# Personal O.S

An AI coach for training, nutrition, sleep, recovery and body weight that tells you **what to do today and why**. The full product brief is in [`CLAUDE.md`](CLAUDE.md).

Built with Expo (React Native), Expo Router and TypeScript. iPhone first.

## Run it on your phone

1. Install **Expo Go** from the App Store.
2. On your computer, install [Node.js](https://nodejs.org) (LTS).
3. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key
   (Supabase dashboard → Project Settings → API Keys). `.env.local` is never committed.
4. Run:
   ```bash
   npm install
   npx expo start
   ```
5. Scan the QR code with the iPhone camera. The app opens in Expo Go and reloads whenever you save a file.

## Project layout

```
src/app/          screens (each file is a route; _layout.tsx wraps them)
src/components/   shared UI and theme
src/data/         static data (journal questions, placeholder rundown)
src/lib/          Supabase client, sign-in session, journal storage
supabase/         database migrations (tables and security rules)
```

## Checks

```bash
npm run typecheck
```
