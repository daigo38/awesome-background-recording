Sample Record (Expo)

Overview
- Mirrors the iOS Swift sample: background-safe recording and playback.
- Now uses `react-native-nitro-sound` for recording/playback with simple progress callbacks and Expo config plugin support.

Key APIs (react-native-nitro-sound)
```ts
import Sound, { RecordBackType, PlayBackType } from 'react-native-nitro-sound';

// Recording
Sound.addRecordBackListener((e: RecordBackType) => setElapsed(e.currentPosition));
await Sound.startRecorder();
const path = await Sound.stopRecorder();

// Playback
Sound.addPlayBackListener((e: PlayBackType) => setElapsed(e.currentPosition));
Sound.addPlaybackEndListener(() => {/* reset state */});
await Sound.startPlayer(path);
await Sound.stopPlayer();
```

Folder
- `src/App.js` — UI and logic (start/stop, duration display)
- `app.json` — iOS `UIBackgroundModes: ["audio"]` and `NSMicrophoneUsageDescription`

Run (Development Build required)
`react-native-nitro-sound` is a native module. Use a Dev Client or prebuild:

1) Install deps:
   - `cd expo-sample-record`
   - `npm i` or `pnpm i` or `yarn`

2) Create a development build:
   - iOS: `npx expo run:ios`
   - Android: `npx expo run:android`

   Or with EAS:
   - `npx expo prebuild`
   - `eas build --profile development --platform ios`

3) Start the dev server:
   - `npx expo start`

Notes
- Background: Recording continues in background via `UIBackgroundModes = audio`.
- Session behavior: Nitro Sound configures the iOS audio session internally during recording/playback. If you need fine‑grained control (e.g., forcing A2DP-only output), additional native tweaks may be required.

Forked Nitro Sound
- Upstream `react-native-nitro-sound` does not strictly guarantee the iOS session options we need for non‑ducking background recording with A2DP preserved. To solve this, we use a fork that hard‑codes the following:
  - Category: `.playAndRecord`
  - Options: `[.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]`
  - Not using: `.duckOthers`, `.allowBluetooth` (HFP)
- Fork repository: https://github.com/daigo38/react-native-nitro-sound.git
- This app pins the fork via a local tarball so the exact native code is captured:
  - `package.json` → `"react-native-nitro-sound": "file:../../react-native-nitro-sound/react-native-nitro-sound-0.2.9.tgz"`
  - Update steps when the fork changes:
    1) In the fork repo, run `npm pack` (or `yarn pack`) to produce a new `.tgz`.
    2) Replace the path in `package.json` to point to the new tarball.
    3) Run `npm i` (or `yarn`) and then `npx pod-install`.
