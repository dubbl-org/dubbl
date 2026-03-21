import SwiftUI

@main
struct DubblApp: App {
    @StateObject private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            switch authManager.state {
            case .loading:
                LaunchScreen()
            case .unauthenticated:
                LoginView()
                    .environmentObject(authManager)
            case .needsOrganization:
                OrganizationPickerView()
                    .environmentObject(authManager)
            case .authenticated:
                MainTabView()
                    .environmentObject(authManager)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.state)
    }
}

struct LaunchScreen: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar.doc.horizontal")
                .font(.system(size: 60))
                .foregroundColor(.dubblPrimary)
            Text("dubbl")
                .font(.system(size: 32, weight: .bold))
            ProgressView()
                .tint(.dubblPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.dubblBackground.ignoresSafeArea())
    }
}
