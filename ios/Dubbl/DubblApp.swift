import SwiftUI

@main
struct DubblApp: App {
    @State private var env = AppEnvironment()
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.light
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .tint(DTheme.ink)
                .preferredColorScheme(appearance.colorScheme)
        }
        .onChange(of: scenePhase) { _, phase in
            env.lock.scenePhaseChanged(phase)
        }
    }
}
