import SwiftUI

struct EventItemMock: Identifiable {
    let id: String
    let title: String
    let venue: String
    let distanceKm: Double
    let price: Int
    let date: String
}

struct EventsView: View {
    let events = [
        EventItemMock(id: "1", title: "Grand Malayalam Fusion Music Fest", venue: "JLN Stadium, Kochi", distanceKm: 5.2, price: 499, date: "15 Nov 2026"),
        EventItemMock(id: "2", title: "Kerala Tech Creators Summit", venue: "Le Meridien, Kochi", distanceKm: 7.8, price: 799, date: "05 Dec 2026"),
        EventItemMock(id: "3", title: "Coastal Street Food Festival", venue: "Marine Drive, Kochi", distanceKm: 2.1, price: 199, date: "22 Nov 2026")
    ]

    @State private var selectedEvent: EventItemMock?
    @State private var showTicketQR = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Location Filter Header
                HStack {
                    Image(systemName: "location.fill")
                        .foregroundStyle(.indigo)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Events Near Kochi")
                            .font(.subheadline)
                            .fontWeight(.bold)
                        Text("Sorted by GPS Distance (within 50 km)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))

                // Events List
                ForEach(events) { evt in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("\(String(format: "%.1f", evt.distanceKm)) km away")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.yellow.opacity(0.2))
                                .foregroundStyle(.yellow)
                                .clipShape(Capsule())

                            Spacer()

                            Text("₹\(evt.price)")
                                .font(.headline)
                                .fontWeight(.bold)
                                .foregroundStyle(.green)
                        }

                        Text(evt.title)
                            .font(.headline)
                            .foregroundStyle(.white)

                        Text(evt.venue)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        HStack {
                            Text("📅 \(evt.date)")
                                .font(.caption)
                                .foregroundStyle(.indigo)

                            Spacer()

                            Button(action: {
                                selectedEvent = evt
                                showTicketQR = true
                            }) {
                                Text("Book Ticket")
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(Color.yellow)
                                    .foregroundStyle(.black)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
            .padding()
        }
        .background(Color(red: 0.02, green: 0.03, blue: 0.07))
        .sheet(isPresented: $showTicketQR) {
            if let evt = selectedEvent {
                VStack(spacing: 20) {
                    Text("Digital Ticket Confirmed")
                        .font(.title3)
                        .fontWeight(.bold)

                    Text(evt.title)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    ZStack {
                        RoundedRectangle(cornerRadius: 16)
                            .fill(Color.white)
                            .frame(width: 180, height: 180)

                        VStack {
                            Image(systemName: "qrcode")
                                .font(.system(size: 100))
                                .foregroundStyle(.black)
                            Text("FRND_TKT_VALID")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundStyle(.black)
                        }
                    }

                    Text("Scan this QR code at the event gate")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Button("Done") {
                        showTicketQR = false
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
                .presentationDetents([.medium])
            }
        }
    }
}
