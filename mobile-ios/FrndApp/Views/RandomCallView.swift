import SwiftUI

enum CallStatus {
    case idle
    case searching
    case connected
}

enum CallMediaType {
    case audio
    case video
}

struct RandomCallView: View {
    @State private var status: CallStatus = .idle
    @State private var mediaType: CallMediaType = .audio
    @State private var callDuration = 0
    @State private var isMuted = false
    @State private var isCameraOff = false
    @State private var partnerName = "Online Friend"
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 20) {
            switch status {
            case .idle:
                Spacer()
                VStack(spacing: 20) {
                    // Audio / Video Picker
                    Picker("Mode", selection: $mediaType) {
                        Text("🎧 Audio").tag(CallMediaType.audio)
                        Text("📹 Video").tag(CallMediaType.video)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 48)

                    ZStack {
                        Circle()
                            .fill(mediaType == .video ? Color.pink.opacity(0.2) : Color.indigo.opacity(0.2))
                            .frame(width: 140, height: 140)
                        Image(systemName: mediaType == .video ? "video.fill" : "mic.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(mediaType == .video ? .pink : .indigo)
                    }

                    Text(mediaType == .video ? "Random Video Call" : "Connect to Random Friends")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)

                    Text(mediaType == .video ? "ക്ലിക്ക് ചെയ്ത് വെയിറ്റ് ചെയ്യുക. ഓൺലൈനിലുള്ള സുഹൃത്തുക്കളുമായി തത്സമയ വീഡിയോ കോളിൽ സംസാരിക്കാം." : "ഓൺലൈനിലുള്ള സുഹൃത്തുക്കളുമായി തത്സമയം 1-on-1 ഓഡിയോ കോളിൽ സംസാരിക്കാം.")
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 32)

                    Button(action: startMatching) {
                        Label(mediaType == .video ? "Connect Random Video" : "Connect Random Friend", systemImage: mediaType == .video ? "video.fill" : "phone.fill")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(mediaType == .video ? LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing) : LinearGradient(colors: [.indigo, .purple], startPoint: .leading, endPoint: .trailing))
                            .clipShape(Capsule())
                    }
                    .padding(.horizontal, 36)
                    .padding(.top, 16)
                }
                Spacer()

            case .searching:
                Spacer()
                VStack(spacing: 24) {
                    ProgressView()
                        .scaleEffect(2.0)
                        .tint(mediaType == .video ? .pink : .purple)

                    Text(mediaType == .video ? "Finding a Video Friend..." : "Finding an Online Friend...")
                        .font(.headline)
                        .foregroundStyle(.white)

                    Text("Matching with active users in the queue")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Button("Cancel") {
                        status = .idle
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()

            case .connected:
                if mediaType == .video {
                    // Video Viewport with PiP local camera
                    ZStack(alignment: .bottomTrailing) {
                        // Remote Video Viewport
                        RoundedRectangle(cornerRadius: 24)
                            .fill(Color.black)
                            .overlay(
                                VStack(spacing: 8) {
                                    Image(systemName: "person.circle.fill")
                                        .font(.system(size: 72))
                                        .foregroundStyle(.purple)
                                    Text(partnerName)
                                        .font(.headline)
                                        .foregroundStyle(.white)
                                    Text("Live WebRTC Video Stream")
                                        .font(.caption2)
                                        .foregroundStyle(.green)
                                }
                            )

                        // Local Camera Self Preview (Picture-in-Picture)
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(.secondarySystemBackground))
                            .frame(width: 90, height: 120)
                            .overlay(
                                VStack {
                                    if isCameraOff {
                                        Image(systemName: "video.slash.fill")
                                            .foregroundStyle(.red)
                                        Text("Camera Off")
                                            .font(.system(size: 8))
                                            .foregroundStyle(.secondary)
                                    } else {
                                        Text("You (Live)")
                                            .font(.caption2)
                                            .fontWeight(.bold)
                                            .foregroundStyle(.indigo)
                                    }
                                }
                            )
                            .padding(14)
                    }
                    .frame(maxHeight: .infinity)
                } else {
                    Spacer()
                    VStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.emeraldGreen)
                                .frame(width: 100, height: 100)
                            Image(systemName: "person.fill")
                                .font(.system(size: 48))
                                .foregroundStyle(.white)
                        }

                        Text(partnerName)
                            .font(.title2)
                            .fontWeight(.bold)

                        Text("WebRTC 1-on-1 Audio Call")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                    Spacer()
                }

                Text(timeFormatted(callDuration))
                    .font(.system(size: 26, weight: .bold, design: .monospaced))

                HStack(spacing: 20) {
                    // Mute
                    Button(action: { isMuted.toggle() }) {
                        Image(systemName: isMuted ? "mic.slash.fill" : "mic.fill")
                            .font(.title2)
                            .frame(width: 54, height: 54)
                            .background(isMuted ? Color.red : Color(.secondarySystemBackground))
                            .clipShape(Circle())
                    }

                    // Toggle Camera (in video mode)
                    if mediaType == .video {
                        Button(action: { isCameraOff.toggle() }) {
                            Image(systemName: isCameraOff ? "video.slash.fill" : "video.fill")
                                .font(.title2)
                                .frame(width: 54, height: 54)
                                .background(isCameraOff ? Color.red : Color(.secondarySystemBackground))
                                .clipShape(Circle())
                        }
                    }

                    // Next Friend
                    Button(action: skipToNext) {
                        HStack {
                            Image(systemName: "forward.fill")
                            Text("Next")
                        }
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 20)
                        .frame(height: 54)
                        .background(mediaType == .video ? Color.pink : Color.indigo)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                    }

                    // End Call
                    Button(action: endCall) {
                        Image(systemName: "phone.down.fill")
                            .font(.title2)
                            .frame(width: 54, height: 54)
                            .background(Color.red)
                            .foregroundStyle(.white)
                            .clipShape(Circle())
                    }
                }
                .padding(.bottom, 16)
            }
        }
        .padding()
        .background(Color(red: 0.02, green: 0.03, blue: 0.07))
    }

    private func startMatching() {
        status = .searching
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            status = .connected
            callDuration = 0
            partnerName = ["Sneha K.", "Rohit M.", "Devika P."].randomElement()!
            startTimer()
        }
    }

    private func skipToNext() {
        timer?.invalidate()
        status = .searching
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            status = .connected
            callDuration = 0
            partnerName = ["Fahad A.", "Anjali S."].randomElement()!
            startTimer()
        }
    }

    private func endCall() {
        timer?.invalidate()
        status = .idle
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            callDuration += 1
        }
    }

    private func timeFormatted(_ totalSeconds: Int) -> String {
        let mins = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%02d:%02d", mins, secs)
    }
}

extension Color {
    static let emeraldGreen = Color(red: 0.06, green: 0.72, blue: 0.51)
}
