Sample Record (Expo)

Overview
- Mirrors the iOS Swift sample: background-safe recording, no ducking of other audio, and AirPods remain in high-quality A2DP by avoiding HFP.
- Uses `react-native-audio-api` to configure the iOS audio session.これを使うことで、バックグラウンドで他のオーディオに影響を与えない録音を実現します。expo-audioなどのライブラリによる録音ではこれを実現できません。設定は以下の通り。

Key APIs
```ts
import { AudioManager } from 'react-native-audio-api';

await AudioManager.setAudioSessionOptions({
  iosCategory: 'playAndRecord',
  iosMode: 'default',
  iosOptions: ['mixWithOthers', 'allowBluetoothA2DP', 'defaultToSpeaker'],
});
await AudioManager.setAudioSessionActivity(true);
```

Folder
- `src/App.js` — UI and logic (start/stop, duration display, session setup)
- `app.json` — iOS `UIBackgroundModes: ["audio"]` and `NSMicrophoneUsageDescription`

Run (Development Build required)
`react-native-audio-api` is a native module, so use a Dev Client or prebuild:

1) Install deps (Expo will pin compatible versions):
   - `cd expo-sample-record`
   - `npm i` or `pnpm i` or `yarn`
   - `npm i react-native-audio-api`

2) Create a development build:
   - iOS simulator/device: `npx expo run:ios`
   - Android: `npx expo run:android`

   Alternatively with EAS:
   - `npx expo prebuild`
   - `eas build --profile development --platform ios`

3) Launch the app:
   - `npx expo start` (press i/a to open the built client)

Notes
- AirPods: By not enabling HFP (i.e., not using `allowBluetooth` HFP), iOS keeps A2DP high-quality output while recording from the built-in mic.
- Background: Recording continues in background due to session category and `UIBackgroundModes = audio`.
- Metering: This sample shows duration rather than input level; if you need live metering, we can extend with a metering-capable API.
