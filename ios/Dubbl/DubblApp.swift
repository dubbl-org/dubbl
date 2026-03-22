import SwiftUI

@main
struct DubblApp: App {
    @StateObject private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .accentColor(Color(hex: "059669"))
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
    @State private var pulseScale: CGFloat = 0.95
    @State private var ringRotation: Double = 0

    var body: some View {
        ZStack {
            // Rich emerald gradient (matches web auth palette)
            LinearGradient(
                colors: [
                    Color.emerald100,
                    Color.emerald200,
                    Color.emerald300,
                    Color.emerald400,
                    Color.emerald500,
                    Color.emerald400,
                    Color.emerald300
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            .overlay(
                LinearGradient(
                    colors: [
                        Color.emerald300.opacity(0.6),
                        Color.emerald400.opacity(0.4),
                        Color.emerald500.opacity(0.5),
                        Color.emerald400.opacity(0.3)
                    ],
                    startPoint: .topTrailing,
                    endPoint: .bottomLeading
                )
                .ignoresSafeArea()
            )

            // Decorative rings
            Circle()
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
                .frame(width: 300, height: 300)
                .rotationEffect(.degrees(ringRotation))
            Circle()
                .stroke(Color.white.opacity(0.04), lineWidth: 1)
                .frame(width: 400, height: 400)
                .rotationEffect(.degrees(-ringRotation * 0.6))

            // Glow
            Circle()
                .fill(Color(hex: "34d399").opacity(0.2))
                .frame(width: 160, height: 160)
                .blur(radius: 50)
                .scaleEffect(pulseScale)

            VStack(spacing: 16) {
                DubblLogo(size: 52, variant: .white)
                Text("dubbl")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                ProgressView()
                    .tint(.white.opacity(0.8))
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 3).repeatForever(autoreverses: true)) {
                pulseScale = 1.1
            }
            withAnimation(.linear(duration: 40).repeatForever(autoreverses: false)) {
                ringRotation = 360
            }
        }
    }
}
