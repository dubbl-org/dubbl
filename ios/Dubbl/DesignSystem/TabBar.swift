import SwiftUI

// MARK: - State

/// Screens that need the whole height hide the tab bar through this, keyed per
/// screen so one can't unhide another's. A screen can also borrow the round
/// button for its own primary action while it's on screen.
@MainActor @Observable
final class TabBarState {
    private(set) var hiddenBy: Set<String> = []
    private(set) var keyboardVisible = false
    /// Tabs with a screen pushed onto their stack; details get the full height.
    private(set) var pushed: Set<AppTab> = []
    private(set) var actions: [String: TabBarAction] = [:]
    private var actionOrder: [String] = []

    var isHidden: Bool { !hiddenBy.isEmpty || keyboardVisible }

    func isHidden(on tab: AppTab) -> Bool { isHidden || pushed.contains(tab) }

    func setPushed(_ value: Bool, tab: AppTab) {
        if value { pushed.insert(tab) } else { pushed.remove(tab) }
    }

    var screenAction: TabBarAction? {
        actionOrder.last.flatMap { actions[$0] }
    }

    func set(_ hidden: Bool, by key: String) {
        if hidden { hiddenBy.insert(key) } else { hiddenBy.remove(key) }
    }

    func setKeyboard(_ visible: Bool) {
        keyboardVisible = visible
    }

    func setAction(_ action: TabBarAction?, by key: String) {
        actionOrder.removeAll { $0 == key }
        if let action {
            actions[key] = action
            actionOrder.append(key)
        } else {
            actions[key] = nil
        }
    }
}

/// The round control floating beside the tab bar.
struct TabBarAction {
    let title: String
    let symbol: String
    /// Shows Tilly instead of the symbol.
    var tilly = false
    let perform: () -> Void
}

private struct TabBarHiddenModifier: ViewModifier {
    @Environment(TabBarState.self) private var state: TabBarState?
    let hidden: Bool
    @State private var key = UUID().uuidString

    func body(content: Content) -> some View {
        content
            .onAppear { apply(hidden) }
            .onChange(of: hidden) { _, value in apply(value) }
            .onDisappear { apply(false) }
    }

    private func apply(_ value: Bool) {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            state?.set(value, by: key)
        }
    }
}

private struct TabBarClearanceModifier: ViewModifier {
    @Environment(TabBarState.self) private var state: TabBarState?

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: state == nil || state!.isHidden ? 0 : 62)
        }
    }
}

private struct TabBarPushedModifier: ViewModifier {
    @Environment(TabBarState.self) private var state: TabBarState?
    let pushed: Bool
    let tab: AppTab

    func body(content: Content) -> some View {
        content.onChange(of: pushed, initial: true) { _, value in
            withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                state?.setPushed(value, tab: tab)
            }
        }
    }
}

private struct TabBarActionModifier: ViewModifier {
    @Environment(TabBarState.self) private var state: TabBarState?
    let action: TabBarAction
    let enabled: Bool
    @State private var key = UUID().uuidString

    func body(content: Content) -> some View {
        content
            .onAppear { apply(enabled) }
            .onChange(of: enabled) { _, value in apply(value) }
            .onDisappear { apply(false) }
    }

    private func apply(_ value: Bool) {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            state?.setAction(value ? action : nil, by: key)
        }
    }
}

extension View {
    /// Puts this screen's primary action in the tab bar's round button while on screen.
    func tabBarAction(_ title: String, symbol: String, enabled: Bool = true, perform: @escaping () -> Void) -> some View {
        modifier(TabBarActionModifier(action: TabBarAction(title: title, symbol: symbol, perform: perform), enabled: enabled))
    }

    /// Keeps the end of a tab's root content clear of the floating bar. Goes
    /// on the content inside the tab's NavigationStack: an inset outside the
    /// stack doesn't reach its scroll views.
    func tabBarClearance() -> some View {
        modifier(TabBarClearanceModifier())
    }

    /// Tells the bar that `tab` has a screen pushed, so it steps aside the way
    /// iOS hides the system tab bar on push.
    func tabBarPushed(_ pushed: Bool, tab: AppTab) -> some View {
        modifier(TabBarPushedModifier(pushed: pushed, tab: tab))
    }

    /// Hides the tab bar while `hidden` is true and this view is on screen.
    func tabBarHidden(_ hidden: Bool = true) -> some View {
        modifier(TabBarHiddenModifier(hidden: hidden))
    }
}

// MARK: - Bar

struct DTabItem: Identifiable {
    let tab: AppTab
    let title: String
    let symbol: String
    /// The selected look; most symbols have a `.fill` twin.
    var activeSymbol: String?
    var badge = 0

    var id: AppTab { tab }
}

/// The app's own tab bar on Liquid Glass: a compact capsule floating off the
/// bottom edge, icon-only and monochrome, the active tab on a soft grey tile
/// that slides between items, and one round glass button beside it (Tilly by
/// default) that the bar merges with as they meet.
struct DTabBar: View {
    let items: [DTabItem]
    @Binding var selection: AppTab
    var action: TabBarAction?
    var onReselect: (AppTab) -> Void = { _ in }

    @Namespace private var activeNS
    @Namespace private var glassNS

    var body: some View {
        GlassEffectContainer(spacing: 14) {
            HStack(spacing: 10) {
                HStack(spacing: 2) {
                    ForEach(items) { item in
                        button(item)
                    }
                }
                .padding(5)
                .background(DTheme.glassTint, in: Capsule())
                .glassEffect(.regular.tint(DTheme.glassTint).interactive(), in: Capsule())
                .glassEffectID("bar", in: glassNS)

                if let action {
                    Button(action: action.perform) {
                        Group {
                            if action.tilly {
                                TillyMark(size: 27)
                            } else {
                                Image(systemName: action.symbol)
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundStyle(DTheme.ink)
                            }
                        }
                        .transition(.scale(scale: 0.5).combined(with: .opacity))
                        .frame(width: 56, height: 56)
                        .contentShape(Circle())
                    }
                    .buttonStyle(TabPressStyle())
                    .background(DTheme.glassTint, in: Circle())
                    .glassEffect(.regular.tint(DTheme.glassTint).interactive(), in: Circle())
                    .glassEffectID("action", in: glassNS)
                    .accessibilityLabel(action.title)
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 4)
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func button(_ item: DTabItem) -> some View {
        let selected = item.tab == selection
        return Button {
            if selected {
                onReselect(item.tab)
            } else {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    selection = item.tab
                }
            }
        } label: {
            Image(systemName: selected ? (item.activeSymbol ?? "\(item.symbol).fill") : item.symbol)
                .font(.system(size: 18, weight: selected ? .medium : .regular))
                .foregroundStyle(selected ? DTheme.ink : DTheme.inkTertiary)
                .contentTransition(.symbolEffect(.replace))
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background {
                    if selected {
                        Capsule()
                            .fill(DTheme.ink.opacity(0.08))
                            .matchedGeometryEffect(id: "active", in: activeNS)
                    }
                }
                .overlay(alignment: .top) { badge(item.badge) }
                .contentShape(Capsule())
        }
        .buttonStyle(TabPressStyle())
        .accessibilityLabel(item.title)
        .accessibilityValue(item.badge > 0 ? "\(item.badge) unread" : "")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private func badge(_ count: Int) -> some View {
        if count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 4.5)
                .frame(minWidth: 16, minHeight: 16)
                .background(DTheme.negative, in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.9), lineWidth: 1.5))
                .offset(x: 12, y: 4)
                .contentTransition(.numericText())
                .transition(.scale.combined(with: .opacity))
        }
    }
}

private struct TabPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
