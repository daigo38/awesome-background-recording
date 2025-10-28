import SwiftUI

struct ContentView: View {
    @EnvironmentObject var recorder: RecordingManager
    @State private var filename: String = "recording.m4a"

    var body: some View {
        VStack(spacing: 20) {
            Text("Background Recorder")
                .font(.title2)

            HStack {
                Text("Permission: ")
                Text(recorder.permissionDescription)
                    .foregroundColor(.secondary)
            }

            TextField("File name", text: $filename)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .padding(.horizontal)

            HStack(spacing: 16) {
                Button(action: { recorder.startRecording(filename: filename) }) {
                    Label("Record", systemImage: "record.circle")
                }
                .disabled(recorder.isRecording)

                Button(action: { recorder.stopRecording() }) {
                    Label("Stop", systemImage: "stop.circle")
                }
                .disabled(!recorder.isRecording)
            }

            if recorder.isRecording {
                Text("Recording… level: \(String(format: "%.1f", recorder.currentLevel)) dB")
                    .monospacedDigit()
            }

            if recorder.isPlaying, let name = recorder.playingFileName {
                Text("Playing: \(name)")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }

            // Recordings list
            List {
                Section("Recordings") {
                    ForEach(recorder.recordings, id: \.self) { url in
                        HStack {
                            Text(url.lastPathComponent)
                                .lineLimit(1)
                            Spacer()
                            Button(recorder.isPlaying && recorder.playingFileName == url.lastPathComponent ? "Stop" : "Play") {
                                if recorder.isPlaying && recorder.playingFileName == url.lastPathComponent {
                                    recorder.stopPlayback()
                                } else {
                                    recorder.play(url: url)
                                }
                            }
                            .buttonStyle(.bordered)
                            Button("Delete", role: .destructive) {
                                recorder.deleteRecording(url: url)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
            }

            Spacer()
        }
        .padding()
        .onAppear {
            recorder.configureSessionIfNeeded()
            recorder.refreshRecordings()
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView().environmentObject(RecordingManager())
    }
}
