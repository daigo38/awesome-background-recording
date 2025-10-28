import SwiftUI

@main
struct SampleRecordApp: App {
    @StateObject private var recorder = RecordingManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(recorder)
        }
    }
}

