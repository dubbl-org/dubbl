import SwiftUI

// The list tabs ("browsers"): a glass header with the scope as its title and
// a live line under it, a drawer of scopes with counts that slides in from
// the left, and a dense full-width ledger on the canvas.

// MARK: - Header

/// The header every list tab shares: a glass drawer button, the scope as a
/// title with one line under it, a search button that morphs into the field,
/// and the screen's own buttons (`trailing`).
struct BrowserHeader<Trailing: View>: View {
    let title: String
    var subtitle: Text?
    @Binding var query: String
    var searchPrompt: String
    var searchFocused: FocusState<Bool>.Binding
    var menuLabel = "Open filters"
    let onMenu: () -> Void
    @ViewBuilder var trailing: () -> Trailing

    @State private var searchOpen = false
    @Namespace private var glass

    var body: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                if searchOpen {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                        TextField(text: $query) {
                            Text(searchPrompt).foregroundStyle(DTheme.inkTertiary)
                        }
                        .font(.system(size: 16))
                        .foregroundStyle(DTheme.ink)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .focused(searchFocused)
                        if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 16))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear search")
                        }
                    }
                    .padding(.horizontal, 15)
                    .frame(height: 44)
                    .glassEffect(.regular.interactive(), in: Capsule())
                    .glassEffectID("search", in: glass)

                    GlassCircleButton(symbol: "xmark", label: "Close search") { close() }
                        .glassEffectID("menu", in: glass)
                } else {
                    GlassCircleButton(symbol: "line.3.horizontal.decrease", label: menuLabel, action: onMenu)
                        .glassEffectID("menu", in: glass)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(title)
                            .font(.system(size: 19, weight: .semibold))
                            .tracking(-0.3)
                            .foregroundStyle(DTheme.ink)
                            .lineLimit(1)
                            .contentTransition(.opacity)
                        if let subtitle {
                            subtitle
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .contentTransition(.numericText())
                        }
                    }
                    .padding(.leading, 2)

                    Spacer(minLength: 6)
                    GlassCircleButton(symbol: "magnifyingglass", label: "Search") { open() }
                        .glassEffectID("search", in: glass)
                    trailing()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .animation(.spring(response: 0.42, dampingFraction: 0.86), value: searchOpen)
        .animation(.easeOut(duration: 0.2), value: title)
        .onAppear {
            if !query.isEmpty { searchOpen = true }
        }
    }

    private func open() {
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { searchOpen = true }
        Task {
            try? await Task.sleep(for: .milliseconds(120))
            searchFocused.wrappedValue = true
        }
    }

    private func close() {
        query = ""
        searchFocused.wrappedValue = false
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { searchOpen = false }
    }
}

/// The screen's primary action in the header: an ink circle with one symbol.
struct HeaderPrimaryButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(DTheme.inkInverse)
                .frame(width: 44, height: 44)
                .background(DTheme.ink, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(TapScaleStyle())
        .accessibilityLabel(label)
    }
}

/// Under the header while searching: how many rows matched.
struct SearchResultsLine: View {
    let count: Int

    var body: some View {
        Text("\(count) \(count == 1 ? "result" : "results")")
            .font(.system(size: 13.5, weight: .medium))
            .monospacedDigit()
            .foregroundStyle(DTheme.inkSecondary)
            .contentTransition(.numericText())
            .padding(.horizontal, 20)
            .padding(.top, 2)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Ledger

/// The ledger's totals: open figures with rules between them, no cards.
/// Tapping one usually narrows the list to it.
struct LedgerTotals: View {
    struct Item: Identifiable {
        let label: String
        let value: String?
        var detail: String?
        var tint: Color?
        var action: (() -> Void)?
        var id: String { label }
    }

    let items: [Item]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 {
                    Rectangle().fill(DTheme.hairline).frame(width: 1).padding(.vertical, 4)
                }
                cell(item)
                    .padding(.leading, index == 0 ? 0 : 16)
                    .padding(.trailing, index == items.count - 1 ? 0 : 16)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func cell(_ item: Item) -> some View {
        let content = VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle().fill(item.tint ?? DTheme.inkTertiary).frame(width: 6, height: 6)
                Text(item.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Text(item.value ?? "–")
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(item.value == nil ? DTheme.inkTertiary : DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
            if let detail = item.detail {
                Text(detail)
                    .font(.system(size: 12.5))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkTertiary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())

        if let action = item.action {
            Button(action: action) { content }.buttonStyle(TapScaleStyle())
        } else {
            content
        }
    }
}

/// A status as the ledger shows it: a dot and a word in the status tone.
struct LedgerStatus: View {
    let text: String
    let tone: Tone

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(tone.color).frame(width: 6, height: 6)
            Text(text)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(tone == .neutral ? DTheme.inkSecondary : tone.color)
        }
        .fixedSize()
    }
}

/// The ledger's last line: how many rows there are in this scope.
struct LedgerEndMarker: View {
    let text: String

    var body: some View {
        HStack {
            Spacer()
            Text(text)
                .font(.system(size: 13))
                .monospacedDigit()
                .foregroundStyle(DTheme.inkTertiary)
            Spacer()
        }
        .padding(.top, 14)
        .padding(.bottom, 24)
        .listRowSeparator(.hidden)
        .listRowBackground(DTheme.canvas)
    }
}

extension View {
    /// A full-width ledger row on the canvas with a hairline under it.
    func ledgerRow() -> some View {
        listRowBackground(DTheme.canvas)
            .listRowSeparatorTint(DTheme.hairline)
            .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
            .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
    }
}

// MARK: - Drawer

extension View {
    /// Slides `drawer` in from the left over this screen: a dimmed backdrop,
    /// drag or tap outside to close, a swipe from the left edge to open. The
    /// tab bar steps aside while it's open.
    func browserDrawer<Drawer: View>(isOpen: Binding<Bool>, @ViewBuilder drawer: @escaping () -> Drawer) -> some View {
        modifier(BrowserDrawerModifier(isOpen: isOpen, drawer: drawer))
    }
}

private struct BrowserDrawerModifier<Drawer: View>: ViewModifier {
    @Binding var isOpen: Bool
    @ViewBuilder var drawer: () -> Drawer
    @State private var drag: CGFloat = 0

    private static var width: CGFloat { 304 }

    func body(content: Content) -> some View {
        ZStack(alignment: .leading) {
            content
                .scaleEffect(isOpen ? 0.97 : 1, anchor: .trailing)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 25)
                        .onEnded { value in
                            if !isOpen, value.startLocation.x < 44, value.translation.width > 70 { set(true) }
                        }
                )
            if isOpen {
                Color.black.opacity(0.28)
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { set(false) }
            }
            drawer()
                .frame(width: Self.width)
                .frame(maxHeight: .infinity, alignment: .top)
                .background(DTheme.canvas)
                .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 28, topTrailingRadius: 28, style: .continuous))
                .overlay(
                    UnevenRoundedRectangle(bottomTrailingRadius: 28, topTrailingRadius: 28, style: .continuous)
                        .strokeBorder(DTheme.hairline, lineWidth: 1)
                )
                .shadow(color: .black.opacity(isOpen ? 0.12 : 0), radius: 24, x: 6)
                .ignoresSafeArea()
                .offset(x: (isOpen ? 0 : -Self.width - 40) + drag)
                .gesture(
                    DragGesture()
                        .onChanged { drag = min(0, $0.translation.width) }
                        .onEnded { value in
                            if value.translation.width < -80 || value.predictedEndTranslation.width < -160 {
                                set(false)
                            } else {
                                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { drag = 0 }
                            }
                        }
                )
        }
        .tabBarHidden(isOpen)
        .sensoryFeedback(.impact(weight: .light), trigger: isOpen)
    }

    private func set(_ open: Bool) {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            isOpen = open
            drag = 0
        }
    }
}

/// Every drawer's top, in dubbl's own way: a strip of the website's painting
/// with the organization you're in on glass, and a menu to switch it.
struct DrawerOrgHeader: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        GeometryReader { proxy in
            let top = proxy.safeAreaInsets.top
            ZStack(alignment: .bottomLeading) {
                Painting(name: "MistValley")
                    .frame(width: proxy.size.width, height: proxy.size.height + top)
                    .clipped()
                    .overlay {
                        LinearGradient(
                            stops: [
                                .init(color: DTheme.canvas.opacity(0.15), location: 0),
                                .init(color: DTheme.canvas.opacity(0.0), location: 0.45),
                                .init(color: DTheme.canvas, location: 1),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    }
                    .offset(y: -top)
                orgMenu
                    .padding(.horizontal, 14)
                    .padding(.bottom, 4)
            }
        }
        .frame(height: 122)
    }

    private var orgMenu: some View {
        Menu {
            Section("Organizations") {
                ForEach(env.session.organizations) { org in
                    Button {
                        guard org.id != env.session.currentOrg?.id else { return }
                        Task { await env.session.select(org) }
                    } label: {
                        if org.id == env.session.currentOrg?.id {
                            Label(org.name, systemImage: "checkmark")
                        } else {
                            Text(org.name)
                        }
                        Text(org.defaultCurrency)
                    }
                }
            }
        } label: {
            HStack(spacing: 10) {
                Avatar(name: env.session.currentOrg?.name ?? "D", imageURL: env.session.currentOrg?.logo, size: 30)
                Text(env.session.currentOrg?.name ?? "Organization")
                    .font(.system(size: 16.5, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.leading, 5)
            .padding(.trailing, 14)
            .frame(height: 42)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .menuOrder(.fixed)
    }
}

/// A titled group of drawer rows.
struct DrawerSection<Rows: View>: View {
    let title: String
    var trailing: String?
    @ViewBuilder var rows: Rows

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
                Spacer()
                if let trailing {
                    Text(trailing)
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 34)
            rows
        }
        .padding(.bottom, 10)
    }
}

/// One scope in a drawer: symbol, title, count. The selected row sits on a
/// grey tile that slides between rows.
struct DrawerRow: View {
    var symbol: String?
    var dot: Color?
    /// Shows Tilly's mark instead of a symbol, for rows that hand off to her.
    var tilly = false
    let title: String
    var count: Int?
    /// Colours the count when it needs attention (overdue, to approve).
    var accent: Color?
    let selected: Bool
    var namespace: Namespace.ID
    var index = 0
    var revealed = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                Group {
                    if tilly {
                        TillyMark(size: 19)
                    } else if let dot {
                        Circle().fill(dot).frame(width: 9, height: 9)
                    } else if let symbol {
                        Image(systemName: symbol)
                            .font(.system(size: 16))
                            .symbolVariant(selected ? .fill : .none)
                            .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                    }
                }
                .frame(width: 24)
                Text(title)
                    .font(.system(size: 16, weight: selected ? .medium : .regular))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if let count, count > 0 {
                    Text("\(count)")
                        .font(.system(size: 14, weight: accent == nil ? .medium : .semibold))
                        .monospacedDigit()
                        .foregroundStyle(accent ?? DTheme.inkTertiary)
                        .contentTransition(.numericText(value: Double(count)))
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(DTheme.tintStrong)
                        .matchedGeometryEffect(id: "drawer-active", in: namespace)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(TapScaleStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
        .opacity(revealed ? 1 : 0)
        .offset(x: revealed ? 0 : -18)
        .animation(
            .spring(response: 0.42, dampingFraction: 0.82).delay(revealed ? 0.03 + min(Double(index), 14) * 0.022 : 0),
            value: revealed
        )
    }
}

/// The drawer's scroll body: the painted org header, then sections.
struct DrawerScaffold<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DrawerOrgHeader()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content
                }
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
    }
}
