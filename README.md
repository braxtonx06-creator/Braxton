# Personal O.S

An AI coach for training, nutrition, sleep, recovery and body weight that tells you **what to do today and why**. The full product brief is in [`CLAUDE.md`](CLAUDE.md).

Built with Expo (React Native), Expo Router and TypeScript. iPhone first.

## Run it on your phone

1. Install **Expo Go** from the App Store.
2. On your computer, install [Node.js](https://nodejs.org) (LTS), then:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code with the iPhone camera. The app opens in Expo Go and reloads whenever you save a file.

## Project layout

```
src/app/          screens (each file is a route; _layout.tsx wraps them)
src/components/   shared UI and theme
src/data/         data for the screens (placeholder for now)
```

## Checks

```bash
npm run typecheck
```
