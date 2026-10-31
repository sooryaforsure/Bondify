import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0
    @State private var walletCoins = 250

    var body: some View {
        NavigationStack {
            TabView(selection: $selectedTab) {
                RandomCallView()
                    .tabItem {
                        Label("Random", systemImage: "shuffle")
                    }
                    .tag(0)

                EventsView()
                    .tabItem {
                        Label("Events", systemImage: "calendar.badge.location")
                    }
                    .tag(1)

                CelebrityView(walletCoins: $walletCoins)
                    .tabItem {
                        Label("Celebrity", systemImage: "star.fill")
                    }
                    .tag(2)

                SupportView()
                    .tabItem {
                        Label("Support", systemImage: "headphones")
                    }
                    .tag(3)
            }
            .tint(Color(red: 0.39, green: 0.40, blue: 0.95))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("FRND")
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundStyle(LinearGradient(colors: [.indigo, .purple, .pink], startPoint: .leading, endPoint: .trailing))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 4) {
                        Image(systemName: "circle.circle.fill")
                            .foregroundStyle(.yellow)
                        Text("\(walletCoins) Coins")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundStyle(.yellow)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Capsule())
                }
            }
        }
    }
}
