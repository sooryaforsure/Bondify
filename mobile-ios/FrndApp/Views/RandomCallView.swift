import SwiftUI

enum CallStatus {
    case idle
    case searching
    case connected
}

struct RandomCallView: View {
    @State private var status: CallStatus = .idle
    @State private var callDuration = 0
    @State private var isMuted = false
    @State private var partnerName = "Online Friend"
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            switch status {
            case .idle:
                VStack(spacing: 20) {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0.12, green: 0.11, blue: 0.29))
                            .frame(width: 140, height: 140)
                        Image(systemName: "mic.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(.indigo)
                    }

                    Text("Connect to Random Friends")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)

                    Text("ക്ലിക്ക് ചെയ്ത് വെയിറ്റ് ചെയ്യുക. ഓൺലൈനിലുള്ള സുഹൃത്തുക്കളുമായി തത്സമയം 1-on-1 സംസാരിക്കാം.")
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 32)

                    Button(action: startMatching) {
                        Label("Connect Random Friend", systemImage: "phone.fill")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(LinearGradient(colors: [.indigo, .purple, .pink], startPoint: .leading, endPoint: .trailing))
                            .clipShape(Capsule())
                    }
                    .padding(.horizontal, 36)
                    .padding(.top, 16)
                }

            case .searching:
                VStack(spacing: 24) {
                    ProgressView()
                        .scaleEffect(2.0)
                        .tint(.purple)

                    Text("Finding an Online Friend...")
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

            case .connected:
                VStack(spacing: 20) {
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

                    Text(timeFormatted(callDuration))
                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                        .padding(.top, 8)

                    HStack(spacing: 24) {
                        // Mute
                        Button(action: { isMuted.toggle() }) {
                            Image(systemName: isMuted ? "mic.slash.fill" : "mic.fill")
                                .font(.title2)
                                .frame(width: 56, height: 56)
                                .background(isMuted ? Color.red : Color(.secondarySystemBackground))
                                .clipShape(Circle())
                        }

                        // Next Friend
                        Button(action: skipToNext) {
                            HStack {
                                Image(systemName: "forward.fill")
                                Text("Next Friend")
                            }
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .padding(.horizontal, 24)
                            .frame(height: 56)
                            .background(Color.indigo)
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                        }

                        // End Call
                        Button(action: endCall) {
                            Image(systemName: "phone.down.fill")
                                .font(.title2)
                                .frame(width: 56, height: 56)
                                .background(Color.red)
                                .foregroundStyle(.white)
                                .clipShape(Circle())
                        }
                    }
                    .padding(.top, 24)
                }
            }

            Spacer()
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
