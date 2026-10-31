import SwiftUI

struct SupportMessageItem: Identifiable {
    let id = UUID()
    let sender: String
    let text: String
    let isMe: Bool
}

struct SupportView: View {
    @State private var inputText = ""
    @State private var messages = [
        SupportMessageItem(sender: "Executive", text: "Welcome to FRND Support! How may we assist you?", isMe: false),
        SupportMessageItem(sender: "Me", text: "Hi, I have a question regarding event ticket check-in.", isMe: true),
        SupportMessageItem(sender: "Executive", text: "You can simply show the QR code from the ticket screen at the event gate.", isMe: false)
    ]

    var body: some View {
        VStack(spacing: 12) {
            // Instant VoIP Support Call Card
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Instant VoIP Voice Support")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                    Text("Talk to support executive directly in-app")
                        .font(.caption2)
                        .foregroundStyle(Color(red: 0.65, green: 0.95, blue: 0.82))
                }

                Spacer()

                Button(action: {}) {
                    Label("Call", systemImage: "phone.fill")
                        .font(.caption)
                        .fontWeight(.bold)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.emeraldGreen)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }
            .padding()
            .background(Color(red: 0.02, green: 0.31, blue: 0.23))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            // Chat Messages
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(messages) { msg in
                        HStack {
                            if msg.isMe { Spacer() }
                            VStack(alignment: msg.isMe ? .trailing : .leading, spacing: 2) {
                                Text(msg.sender)
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(msg.isMe ? .indigo : .green)
                                Text(msg.text)
                                    .font(.footnote)
                                    .foregroundStyle(.white)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(msg.isMe ? Color.indigo : Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            if !msg.isMe { Spacer() }
                        }
                    }
                }
                .padding(.vertical, 8)
            }

            // Message Input
            HStack {
                TextField("Type your message...", text: $inputText)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                Button(action: {
                    if !inputText.isEmpty {
                        messages.append(SupportMessageItem(sender: "Me", text: inputText, isMe: true))
                        inputText = ""
                    }
                }) {
                    Image(systemName: "paperplane.fill")
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(Color.indigo)
                        .clipShape(Circle())
                }
            }
        }
        .padding()
        .background(Color(red: 0.02, green: 0.03, blue: 0.07))
    }
}
