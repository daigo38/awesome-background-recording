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

