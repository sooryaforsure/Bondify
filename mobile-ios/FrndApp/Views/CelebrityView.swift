import SwiftUI

struct CelebrityView: View {
    @Binding var walletCoins: Int
    @State private var showingCallAlert = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Celebrity Header Card
                VStack(spacing: 16) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.pink)
                                .frame(width: 64, height: 64)
                            Image(systemName: "star.fill")
                                .font(.title)
                                .foregroundStyle(.white)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("Ananya Joy")
                                    .font(.headline)
                                    .fontWeight(.bold)
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundStyle(.blue)
                            }

                            Text("Playback Singer & Artist • 125K Fans")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Text("🪙 50 Coins / min • Online")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundStyle(.yellow)
                        }
                    }

                    HStack(spacing: 12) {
                        Button(action: { showingCallAlert = true }) {
                            Label("VIP Audio", systemImage: "phone.fill")
                                .font(.caption)
                                .fontWeight(.bold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.pink)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }

                        Button(action: { showingCallAlert = true }) {
                            Label("VIP Video", systemImage: "video.fill")
                                .font(.caption)
                                .fontWeight(.bold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.purple)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 18))

                Text("Feed & Updates")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Rehearsal vibes for tonight's acoustic session! Can't wait to chat with everyone on VIP calls later. 🎤❤️")
                        .font(.footnote)
                        .foregroundStyle(.white)

                    HStack {
                        Image(systemName: "heart.fill")
                            .foregroundStyle(.red)
                        Text("1,420 Likes")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .padding()
        }
        .background(Color(red: 0.02, green: 0.03, blue: 0.07))
        .alert("VIP Celebrity Call", isPresented: $showingCallAlert) {
            Button("Call Now") {}
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Connecting 1-on-1 VIP call with Ananya Joy. Rate: 50 coins / minute.")
        }
    }
}
