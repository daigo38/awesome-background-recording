<project-doc>

# iOS Background Recording Without Affecting Other Audio

This guide explains how to build an iOS recorder that:
- Records in foreground and background
- Does not reduce other apps’ volume (no ducking)
- Keeps AirPods output in high quality (A2DP) by recording with the iPhone’s built‑in mic

It focuses on platform‑aligned configuration, not on a specific bug.

## 1) Capabilities and Info.plist
- Add Background Modes capability (or set Info.plist directly).
- Required plist keys:
  - `NSMicrophoneUsageDescription`
  - `UIBackgroundModes` → include `audio`

Example (Info.plist excerpt):
```xml
<key>NSMicrophoneUsageDescription</key>
<string>音声を録音するためにマイクを使用します。</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

Notes:
- Using Info.plist directly is sufficient even if the Capabilities UI does not show Background Modes.
- Test on a real device; Simulator background behavior differs.

## 2) Audio Session Strategy
- Category: `.playAndRecord`
- Mode: `.default` (or `.measurement` for low‑latency)
- Options:
  - `.mixWithOthers` (coexist with other audio; do not duck others)
  - `.allowBluetoothA2DP` (high‑quality Bluetooth output only)
  - `.defaultToSpeaker` (optional)
- Avoid:
  - `.duckOthers` (lowers other audio)
  - `.allowBluetooth` (routes through HFP when using headset mic, lowering quality)

Example:
```swift
let session = AVAudioSession.sharedInstance()
try session.setCategory(
  .playAndRecord,
  mode: .default,
  options: [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker]
)
// Keep AirPods in A2DP by recording from built-in mic
if let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
  try? session.setPreferredInput(mic)
}
try session.setPreferredSampleRate(44100)
try session.setPreferredIOBufferDuration(0.005)
try session.setActive(true)
```

## 3) Recording Pipeline
- Use `AVAudioRecorder` with AAC 44.1kHz mono for simplicity.
- Save files under Documents with unique names (timestamp).

Example:
```swift
let settings: [String: Any] = [
  AVFormatIDKey: kAudioFormatMPEG4AAC,
  AVSampleRateKey: 44100,
  AVNumberOfChannelsKey: 1,
  AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
]
let url = docs.appendingPathComponent("recording-YYYYMMDD-HHMMSS.m4a")
let recorder = try AVAudioRecorder(url: url, settings: settings)
recorder.isMeteringEnabled = true
recorder.record()
```

## 4) Background Continuity
- Keep the audio session active across background transitions.
- Maintain a short `UIBackgroundTask` to bridge the transition.
- Resume the recorder on background notifications.

Example:
```swift
NotificationCenter.default.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
NotificationCenter.default.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)

private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

@objc func didEnterBackground() {
  try? AVAudioSession.sharedInstance().setActive(true)
  if recorder.isRecording { recorder.record() }
  if backgroundTask == .invalid {
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Recording") {
      if self.recorder.isRecording { self.recorder.record() }
    }
  }
}

@objc func willEnterForeground() {
  if backgroundTask != .invalid {
    UIApplication.shared.endBackgroundTask(backgroundTask)
    backgroundTask = .invalid
  }
}
```

## 5) Interruptions and Route Changes
- Handle `AVAudioSession.interruptionNotification`:
  - On end, call `setActive(true)` and resume if needed.
- Handle `AVAudioSession.routeChangeNotification`:
  - Prefer built‑in mic to avoid HFP fallback.

## 6) Playback and Coexistence
- With `.mixWithOthers`, other apps continue playback at normal volume.
- In-app playback during recording is supported with the same session.
- Switch to `.playback` only if you need output‑only behavior (accept trade-offs accordingly).

## 7) Testing Checklist
- Real device with Developer Mode ON
- Microphone permission granted
- Start recording → press Home → wait → return → stop → play back
- Verify YouTube/Music continues at normal volume (no ducking)
- With AirPods connected, verify output quality remains high while using the phone’s mic

## 8) Common Pitfalls
- Missing `UIBackgroundModes=audio` in Info.plist → app suspends in background
- Using `.duckOthers` → other audio volume drops
- Enabling `.allowBluetooth` and using headset mic → HFP route lowers output quality
- Not handling interruptions/route changes → recorder stops silently
- Relying only on Simulator → different background behavior

## 9) File Pointers (this project)
- Info/Capabilities: `SampleRecord/SampleRecord/Info.plist`
- Session + recording: `Audio/RecordingManager.swift`
- UI examples: `SampleRecord/SampleRecord/ContentView.swift`, `SampleRecord/SampleRecord/SampleRecordApp.swift`

</project-doc>
