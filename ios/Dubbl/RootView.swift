import SwiftUI

/// Switches between launch, sign-in, organization setup and the app, with the
/// optional Face ID lock and a privacy cover on top.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            switch env.session.phase {
            case .launching:
                LaunchView()
            case .loggedOut:
                SignInView()
                    .transition(.opacity)
            case .unreachable:
                UnreachableView()
            case .noOrganization:
                NoOrganizationView()
            case .selectOrg:
                OrganizationPickerView()
            case .ready:
                MainTabView()
                    .id(env.session.orgGeneration)
                    .transition(.opacity)
            }

            if signedIn, env.lock.isLocked {
                LockView()
                    .transition(.opacity)
                    .zIndex(2)
            } else if signedIn, env.lock.isEnabled, scenePhase != .active {
                PrivacyCover()
                    .zIndex(1)
            }
        }
        .modifier(ToastOverlay(center: env.toast))
        .animation(.easeInOut(duration: 0.22), value: env.session.phase)
        .animation(.easeInOut(duration: 0.2), value: env.lock.isLocked)
        .task { await env.session.bootstrap() }
        .onChange(of: env.session.phase) { _, phase in
            if phase == .loggedOut { env.lock.reset() }
        }
    }

    private var signedIn: Bool {
        switch env.session.phase {
        case .ready, .selectOrg, .noOrganization: true
        default: false
        }
    }
}

// MARK: - Launch

struct LaunchView: View {
    @State private var breathe = false

    var body: some View {
        ZStack {
            DTheme.shell.ignoresSafeArea()
            DubblLogo(height: 34)
                .scaleEffect(breathe ? 1.04 : 0.98)
                .opacity(breathe ? 1 : 0.75)
                .animation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true), value: breathe)
        }
        .onAppear { breathe = true }
    }
}

// MARK: - Can't reach the server

/// Signed in but offline or the server is down: keep the session and retry.
struct UnreachableView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var retrying = false

    var body: some View {
        ZStack {
            DTheme.shell.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                IconTile(symbol: "icloud.slash", size: 56)
                VStack(spacing: 8) {
                    Text("Can't reach dubbl").displayFont(24).foregroundStyle(DTheme.ink)
                    Text("\(AppConfig.serverHost) isn't answering. You're still signed in, we'll keep trying.")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                        .multilineTextAlignment(.center)
                }
                Spacer()
                Button {
                    Task { await retry() }
                } label: {
                    if retrying { ProgressView().tint(DTheme.inkInverse) } else { Text("Try again") }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                Button("Sign out") { Task { await env.session.signOut() } }
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .padding(24)
        }
        .task {
            while !Task.isCancelled, env.session.phase == .unreachable {
                try? await Task.sleep(for: .seconds(5))
                await env.session.refreshIdentity()
            }
        }
    }

    private func retry() async {
        retrying = true
        await env.session.refreshIdentity()
        retrying = false
    }
}

// MARK: - No organization yet

/// New accounts set their business up on the web (country, chart of accounts,
/// tax); the app picks it up afterwards.
struct NoOrganizationView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var checking = false

    var body: some View {
        ZStack {
            DTheme.shell.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                IconTile(symbol: "building.2", size: 56)
                VStack(spacing: 8) {
                    Text("Set up your business").displayFont(24).foregroundStyle(DTheme.ink)
                    Text("Finish setting up your organization on the web. It takes a couple of minutes, then everything shows up here.")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                        .multilineTextAlignment(.center)
                }
                Spacer()
                Button("Continue setup") {
                    if let url = AppConfig.webURL("/onboarding") { openURL(url) }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                Button {
                    Task {
                        checking = true
                        await env.session.refreshIdentity()
                        checking = false
                    }
                } label: {
                    if checking { ProgressView() } else { Text("I've finished, check again") }
                }
                .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                Button("Sign out") { Task { await env.session.signOut() } }
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(.top, 4)
            }
            .padding(24)
        }
    }
}

// MARK: - Lock

struct LockView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            DTheme.shell.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 22) {
                DubblLogo(height: 30)
                Text("dubbl is locked").displayFont(20).foregroundStyle(DTheme.ink)
                Button {
                    Task { await env.lock.unlock() }
                } label: {
                    Label("Unlock with \(env.lock.biometryName)", systemImage: env.lock.biometrySymbol)
                }
                .buttonStyle(InkButtonStyle(size: .regular))
            }
        }
        .task { await env.lock.unlock() }
    }
}

/// Hides balances in the app switcher when the lock is on.
struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Rectangle().fill(.regularMaterial).ignoresSafeArea()
            DubblLogo(height: 30)
        }
    }
}
