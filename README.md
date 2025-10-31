Sample Record (iOS)

A minimal Swift recording app demonstrating:

- Background recording (UIBackgroundModes = audio)
- AVAudioSession configured to not duck other audio (YouTube, Music)
- AirPods keep high-quality output by avoiding HFP mic (record from built-in mic)

How to use in Xcode

1. Create a new iOS App project (SwiftUI or UIKit). 
2. Add the files from this repo into your app target:
   - `App/SampleRecordApp.swift`
   - `App/ContentView.swift`
   - `Audio/RecordingManager.swift`
3. Merge the `Config/Info.plist` entries into your app's Info.plist:
   - `NSMicrophoneUsageDescription`
   - `UIBackgroundModes` → `audio`
4. In Signing & Capabilities, add Background Modes → check `Audio, AirPlay, and Picture in Picture`.
5. Build & run on a real device. Start recording, then switch to YouTube. Volume should not duck and AirPods output quality should remain high.

Notes on behavior

- Uses `AVAudioSession.Category.playAndRecord` with options `[.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]`.
- Does NOT include `.duckOthers` and does NOT include `.allowBluetooth` (HFP). This ensures:
  - Other apps keep normal volume (no ducking).
  - AirPods stay on A2DP (high quality output). Recording uses the iPhone built-in mic.
- Route and interruption changes are handled to keep the recorder stable.

Known platform constraints

- If you insist on recording from the AirPods microphone, iOS must switch to HFP which lowers output quality system‑wide. This is a Bluetooth spec trade-off and cannot be fully avoided.

Files

- `App/SampleRecordApp.swift` – SwiftUI app entry.
- `App/ContentView.swift` – Simple UI to start/stop recording and show level.
- `Audio/RecordingManager.swift` – Session setup and recording logic.
- `Config/Info.plist` – Template entries to copy into your project's Info.plist.

Expo Sample (React Native)

- See `expo-sample-record/` for an Expo app that mirrors the Swift behavior.
- It records in the background without ducking other audio and keeps AirPods on high‑quality A2DP by recording from the built‑in mic.

Forked Nitro Sound

- We forked `react-native-nitro-sound` to enforce iOS `AVAudioSession` options that match this Swift sample and avoid unwanted interruptions when other apps (YouTube, Music) play.
- Fork repository: https://github.com/daigo38/react-native-nitro-sound.git
- Effective configuration in the fork:
  - Category: `.playAndRecord`
  - Options: `[.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]`
  - Not using: `.duckOthers`, `.allowBluetooth` (HFP)
- In `expo-sample-record/package.json`, we pin the fork via a local tarball to ensure deterministic builds:
  - `"react-native-nitro-sound": "file:../../react-native-nitro-sound/react-native-nitro-sound-0.2.9.tgz"`
  - To update: build a new tarball from the fork with `npm pack`, update the file path, then run `npm i && npx pod-install` inside `expo-sample-record`.
