<project-doc>

# iOS Background Recording Without Affecting Other Audio

This document captures the exact setup needed to:
- Record audio in the background
- Keep other apps’ audio (YouTube/Music) unaffected (no ducking)
- Preserve AirPods output quality (A2DP) while recording via the iPhone’s built‑in mic

It also explains the root causes of common failures and how we fixed them here.

## Root Cause (What broke earlier)
- Background mode wasn’t effectively enabled in the target’s actual Info.plist, so iOS suspended the app on background and the recorder stopped.
- Switching the session to `.record` (instead of `.playAndRecord`) also changed the route/behavior and contributed to “no audio recorded” in some cases.
- The app wasn’t explicitly maintaining an active audio session nor a `UIBackgroundTask` across background transitions, so the system could suspend it while the recorder hadn’t fully anchored a background audio task yet.

We fixed this by:
- Supplying an explicit `Info.plist` with `UIBackgroundModes = audio`
- Returning to `.playAndRecord` + the right options
- Re‑activating the session on background and keeping a short `UIBackgroundTask` around the transition

## Checklist
- Info.plist
  - `NSMicrophoneUsageDescription` – required
  - `UIBackgroundModes` → `audio`
- Signing & Capabilities
  - Background Modes → Audio（UI上で追加できない環境でも、Info.plistに `UIBackgroundModes=audio` が入っていれば機能します）
- AVAudioSession
  - Category: `.playAndRecord`
  - Options: `[.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]`
    - Do NOT include `.duckOthers`
    - Avoid `.allowBluetooth` (HFP) if you want to keep AirPods in high‑quality A2DP; record from built‑in mic instead
  - Prefer the built‑in mic as input to avoid BT HFP fallback
- Lifecycle
  - Observe `UIApplication.didEnterBackground` / `willEnterForeground`
  - Call `try setActive(true)` when entering background and ensure the recorder continues (`recorder.record()`)
  - Hold a short `UIBackgroundTask` through the transition (begin/end)
- Interruptions & routes
  - Observe `AVAudioSession.interruptionNotification` and `routeChangeNotification`
  - On interruption end: re‑activate the session and resume the recorder if needed
  - On route change: keep preferring built‑in mic

## Required Info.plist (excerpt)
```xml
<key>NSMicrophoneUsageDescription</key>
<string>音声を録音するためにマイクを使用します。</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <!-- (Optional) 'processing' if you perform audio processing in background -->
  <!-- <string>processing</string> -->
  <!-- Do NOT add 'voip' unless you implement proper VoIP behavior. -->
  <!-- <string>voip</string> -->
  <!-- 'external-accessory' only when using MFi accessories. -->
</array>
```

In this repo: `SampleRecord/SampleRecord/Info.plist`

## AVAudioSession Setup
```swift
try AVAudioSession.sharedInstance().setCategory(
    .playAndRecord,
    mode: .default,
    options: [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]
)
// Prefer built-in mic to avoid switching AirPods to HFP
if let builtIn = AVAudioSession.sharedInstance().availableInputs?
    .first(where: { $0.portType == .builtInMic }) {
    try? AVAudioSession.sharedInstance().setPreferredInput(builtIn)
}
try AVAudioSession.sharedInstance().setPreferredSampleRate(44100)
try AVAudioSession.sharedInstance().setPreferredIOBufferDuration(0.005)
try AVAudioSession.sharedInstance().setActive(true)
```

Key points:
- `.mixWithOthers` keeps other apps’ audio playing normally.
- Don’t use `.duckOthers` (it lowers other audio).
- Use `.allowBluetoothA2DP` instead of `.allowBluetooth` to avoid HFP (low‑quality) route.

## Background Continuity
```swift
NotificationCenter.default.addObserver(
    forName: UIApplication.didEnterBackgroundNotification,
    object: nil, queue: .main
) { _ in
    try? AVAudioSession.sharedInstance().setActive(true)
    if isRecording { recorder.record() }
    beginBackgroundTask()
}

NotificationCenter.default.addObserver(
    forName: UIApplication.willEnterForegroundNotification,
    object: nil, queue: .main
) { _ in
    endBackgroundTask()
}

func beginBackgroundTask() {
    if backgroundTask == .invalid {
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Recording") {
            if isRecording { recorder.record() }
        }
    }
}

func endBackgroundTask() {
    if backgroundTask != .invalid {
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }
}
```

This keeps the app alive through the transition period so the system recognizes an ongoing audio task.

## Recorder Settings
```swift
let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 44100,
    AVNumberOfChannelsKey: 1,
    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
]
let url = documentsDir.appendingPathComponent("recording-YYYYMMDD-HHMMSS.m4a")
recorder = try AVAudioRecorder(url: url, settings: settings)
recorder?.isMeteringEnabled = true
recorder?.record()
```

## Bluetooth, AirPods, and Quality
- If you enable `.allowBluetooth`, iOS can switch to HFP when using a headset mic → output quality drops system‑wide.
- To keep high‑quality output (A2DP), avoid `.allowBluetooth` and record from the phone’s built‑in mic with `.allowBluetoothA2DP`.

## Common Pitfalls
- Missing `UIBackgroundModes=audio` in the actual target Info.plist (or capability not added) → app suspended in background.
- Using `.duckOthers` → other audio becomes quieter.
- Selecting the headset microphone (HFP) → AirPods audio becomes telephony‑quality.
- Not re‑activating the session after interruptions/route changes → recorder silently stops.
- Relying solely on the Simulator → background behavior differs; test on a real device.

## Files in This Repo
- Info and capabilities: `SampleRecord/SampleRecord/Info.plist`
- Session + recorder logic: `Audio/RecordingManager.swift`
- Simple UI: `SampleRecord/SampleRecord/ContentView.swift`, `SampleRecord/SampleRecord/SampleRecordApp.swift`

## Testing Notes
- Real device, Developer Mode ON
- Grant microphone permission
- Start recording → press Home → wait → return and stop → play back file
- Try YouTube/Music concurrently to confirm no ducking; confirm AirPods audio remains clear

</project-doc>
