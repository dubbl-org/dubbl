import SwiftUI

/// The signed-in app: five tabs under dubbl's own floating glass tab bar, with
/// Tilly one tap away in the round button beside it. Screens can borrow that
/// button for their own action (`.tabBarAction`) or hide the bar (`.tabBarHidden`).
struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var tabBar = TabBarState()

    private static let items = [
        DTabItem(tab: .home, title: "Overview", symbol: "house"),
        DTabItem(tab: .sales, title: "Sales", symbol: "doc.text"),
        DTabItem(tab: .purchases, title: "Purchases", symbol: "cart"),
        DTabItem(tab: .contacts, title: "Contacts", symbol: "person.2"),
        DTabItem(tab: .more, title: "More", symbol: "square.grid.2x2"),
    ]

    /// The round button: the current screen's own action, else Tilly.
    private var barAction: TabBarAction {
        tabBar.screenAction ?? TabBarAction(title: "Ask Tilly", symbol: "sparkle", tilly: true) {
            env.router.askTilly(page: env.router.tab.rawValue)
        }
    }

    var body: some View {
        @Bindable var router = env.router
        TabView(selection: $router.tab) {
            Tab("Overview", systemImage: "house", value: AppTab.home) {
                HomeView().toolbarVisibility(.hidden, for: .tabBar)
            }
            Tab("Sales", systemImage: "doc.text", value: AppTab.sales) {
                SalesView().toolbarVisibility(.hidden, for: .tabBar)
            }
            Tab("Purchases", systemImage: "cart", value: AppTab.purchases) {
                PurchasesView().toolbarVisibility(.hidden, for: .tabBar)
            }
            Tab("Contacts", systemImage: "person.2", value: AppTab.contacts) {
                ContactsView().toolbarVisibility(.hidden, for: .tabBar)
            }
            Tab("More", systemImage: "square.grid.2x2", value: AppTab.more) {
                MoreView().toolbarVisibility(.hidden, for: .tabBar)
            }
        }
        .overlay(alignment: .bottom) {
            if !tabBar.isHidden(on: router.tab) {
                DTabBar(items: Self.items, selection: $router.tab, action: barAction)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: tabBar.isHidden(on: router.tab))
        .environment(tabBar)
        .fullScreenCover(item: $router.assistant) { launch in
            AssistantView(launch: launch)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            tabBar.setKeyboard(true)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            tabBar.setKeyboard(false)
        }
        #if DEBUG
        .onAppear {
            if let tab = DemoData.initialTab { env.router.tab = tab }
            switch DemoData.open {
            case "tilly": env.router.askTilly()
            case "tilly-ask": env.router.askTilly("Who owes me money, and who should I chase first?", page: "home")
            default: break
            }
        }
        #endif
    }
}
