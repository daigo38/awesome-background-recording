import Foundation
import AVFoundation
import UIKit

final class RecordingManager: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var permission: AVAudioSession.RecordPermission = .undetermined
    @Published var currentLevel: Float = 0
    @Published var recordings: [URL] = []
    @Published var isPlaying: Bool = false
    @Published var playingFileName: String? = nil

    private let session = AVAudioSession.sharedInstance()
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var levelTimer: Timer?
    private var configured = false
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    var permissionDescription: String {
        switch permission {
        case .granted: return "granted"
        case .denied: return "denied"
        case .undetermined: return "undetermined"
        @unknown default: return "unknown"
        }
    }

    func configureSessionIfNeeded() {
        guard !configured else { return }
        configured = true

        NotificationCenter.default.addObserver(self, selector: #selector(handleInterruption), name: AVAudioSession.interruptionNotification, object: session)
        NotificationCenter.default.addObserver(self, selector: #selector(handleRouteChange), name: AVAudioSession.routeChangeNotification, object: session)
        NotificationCenter.default.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)

        requestPermission { [weak self] in
            self?.setupAudioSession()
        }
    }

    private func requestPermission(_ completion: @escaping () -> Void) {
        permission = session.recordPermission
        guard permission == .undetermined else { completion(); return }

        session.requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                self?.permission = granted ? .granted : .denied
                completion()
            }
        }
    }

    private func setupAudioSession() {
        do {
            // Record while mixing with other audio and avoid ducking.
            // Keep AirPods on A2DP by not enabling .allowBluetooth (HFP).
            try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker])

            // Prefer built-in mic to avoid switching BT profile to HFP.
            if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                try? session.setPreferredInput(builtIn)
            }

            // Reasonable defaults
            try session.setPreferredSampleRate(44100)
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true)
        } catch {
            print("[RecordingManager] AudioSession setup failed: \(error)")
        }
    }

    func startRecording(filename: String = "recording.m4a") {
        guard permission == .granted else { return }
        stopRecording()
        stopPlayback()
        setupAudioSession()

        let url = recordingURL(filename: filename)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder?.delegate = self
            recorder?.isMeteringEnabled = true
            recorder?.record()
            isRecording = true
            startLevelMetering()
            beginBackgroundTaskIfNeeded()
        } catch {
            print("[RecordingManager] Failed to start recording: \(error)")
            isRecording = false
        }
    }

    func stopRecording() {
        levelTimer?.invalidate()
        levelTimer = nil
        recorder?.stop()
        recorder = nil
        isRecording = false

        // Optionally relax the session when done to fully restore other apps, if needed.
        // try? session.setActive(false, options: .notifyOthersOnDeactivation)

        refreshRecordings()
        endBackgroundTaskIfNeeded()
    }

    private func startLevelMetering() {
        levelTimer?.invalidate()
        levelTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            guard let self, let rec = self.recorder, rec.isRecording else { return }
            rec.updateMeters()
            self.currentLevel = rec.averagePower(forChannel: 0)
        }
        RunLoop.current.add(levelTimer!, forMode: .common)
    }

    private func recordingURL(filename: String) -> URL {
        let safe = filename.isEmpty ? "recording.m4a" : filename
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return docs.appendingPathComponent(safe)
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            // Interruption started (e.g., phone call). Pause metering.
            levelTimer?.invalidate()
        case .ended:
            // Try to reactivate session and continue if we were recording.
            try? session.setActive(true)
            if isRecording { recorder?.record() }
            startLevelMetering()
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        // Keep preferring built-in mic to avoid HFP.
        if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try? session.setPreferredInput(builtIn)
        }
    }

    @objc private func appDidEnterBackground() {
        // Ensure the audio session stays active and the recorder continues.
        do { try session.setActive(true) } catch { }
        if isRecording { recorder?.record() }
        beginBackgroundTaskIfNeeded()
    }

    @objc private func appWillEnterForeground() {
        endBackgroundTaskIfNeeded()
    }

    private func beginBackgroundTaskIfNeeded() {
        if backgroundTask == .invalid {
            backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Recording") { [weak self] in
                // Expiration handler – try to keep session active
                guard let self else { return }
                if self.isRecording {
                    self.recorder?.record()
                }
            }
        }
    }

    private func endBackgroundTaskIfNeeded() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }

    // MARK: - Recordings list
    func refreshRecordings() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let fm = FileManager.default
        let urls = (try? fm.contentsOfDirectory(at: docs, includingPropertiesForKeys: [.contentModificationDateKey], options: [.skipsHiddenFiles])) ?? []
        let audio = urls.filter { $0.pathExtension.lowercased() == "m4a" }
        let withDates: [(URL, Date)] = audio.compactMap { url in
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return (url, date)
        }
        self.recordings = withDates.sorted { $0.1 > $1.1 }.map { $0.0 }
    }

    func deleteRecording(url: URL) {
        if player?.url == url { stopPlayback() }
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            print("[RecordingManager] Delete failed: \(error)")
        }
        refreshRecordings()
    }

    // MARK: - Playback
    func play(url: URL) {
        if isRecording { stopRecording() }
        if player?.url == url, isPlaying {
            stopPlayback()
            return
        }

        do {
            // Keep session active with same category (mix with others)
            try session.setActive(true)
            player = try AVAudioPlayer(contentsOf: url)
            player?.delegate = self
            player?.prepareToPlay()
            player?.play()
            isPlaying = true
            playingFileName = url.lastPathComponent
        } catch {
            print("[RecordingManager] Playback failed: \(error)")
            isPlaying = false
            playingFileName = nil
        }
    }

    func stopPlayback() {
        player?.stop()
        player = nil
        isPlaying = false
        playingFileName = nil
    }
}

extension RecordingManager: AVAudioRecorderDelegate {
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        print("[RecordingManager] Encode error: \(String(describing: error))")
    }
}

extension RecordingManager: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async {
            self.isPlaying = false
            self.playingFileName = nil
        }
    }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        print("[RecordingManager] Player decode error: \(String(describing: error))")
        DispatchQueue.main.async {
            self.isPlaying = false
            self.playingFileName = nil
        }
    }
}
