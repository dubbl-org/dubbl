import SwiftUI

// MARK: - Brand

/// The dubbl mark: two interlocking "d"s, transcribed from the web SVG
/// (viewBox 0 0 40 32). The back one is cut away around the front one.
struct DubblMark: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 40, sy = rect.height / 32
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
        func r(_ value: CGFloat) -> CGFloat { value * sx }

        var path = Path()
        // Front "d"
        path.move(to: p(4, 4))
        path.addLine(to: p(12, 4))
        path.addArc(center: p(12, 14), radius: r(10), startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: p(22, 18))
        path.addArc(center: p(12, 18), radius: r(10), startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: p(4, 28))
        path.closeSubpath()

        // Back "d"
        let inner = asin(9.81 / 11.5) // where the cut-away arc meets the stem
        path.move(to: p(18, 4))
        path.addLine(to: p(18, 4.19))
        path.addArc(center: p(12, 14), radius: r(11.5), startAngle: .radians(-inner), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: p(23.5, 18))
        path.addArc(center: p(12, 18), radius: r(11.5), startAngle: .degrees(0), endAngle: .radians(inner), clockwise: false)
        path.addLine(to: p(18, 28))
        path.addLine(to: p(26, 28))
        path.addArc(center: p(26, 18), radius: r(10), startAngle: .degrees(90), endAngle: .degrees(0), clockwise: true)
        path.addLine(to: p(36, 14))
        path.addArc(center: p(26, 14), radius: r(10), startAngle: .degrees(0), endAngle: .degrees(-90), clockwise: true)
        path.closeSubpath()
        return path
    }
}

struct DubblLogo: View {
    var height: CGFloat = 20

    var body: some View {
        DubblMark()
            .fill(DTheme.ink)
            .frame(width: height * 40 / 32, height: height)
            .accessibilityLabel("dubbl")
    }
}

// MARK: - Buttons

enum ButtonSize {
    case small, regular, large

    var height: CGFloat {
        switch self {
        case .small: 34
        case .regular: 44
        case .large: 54
        }
    }

    var font: Font {
        switch self {
        case .small: .system(size: 13.5, weight: .medium)
        case .regular: .system(size: 15, weight: .medium)
        case .large: .system(size: 16.5, weight: .medium)
        }
    }

    var padding: CGFloat {
        switch self {
        case .small: 14
        case .regular: 18
        case .large: 22
        }
    }
}

/// Primary action: a near-black pill.
struct InkButtonStyle: ButtonStyle {
    var size: ButtonSize = .regular
    var fullWidth = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size.font)
            .foregroundStyle(DTheme.inkInverse)
            .padding(.horizontal, size.padding)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(height: size.height)
            .background(DTheme.ink.opacity(isEnabled ? 1 : 0.25), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.75), value: configuration.isPressed)
            .animation(.easeOut(duration: 0.18), value: isEnabled)
    }
}

/// Secondary action: a grey-tinted pill.
struct SoftButtonStyle: ButtonStyle {
    var size: ButtonSize = .regular
    var fullWidth = false
    var tone: Tone = .neutral

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size.font)
            .foregroundStyle(tone == .neutral ? DTheme.ink : tone.color)
            .padding(.horizontal, size.padding)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(height: size.height)
            .background(configuration.isPressed ? DTheme.tintStrong : DTheme.tint, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.75), value: configuration.isPressed)
    }
}

/// Rows and cards: a gentle press.
struct TapScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

/// Rows inside a card: a grey wash while pressed.
struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .background(configuration.isPressed ? DTheme.tint : .clear)
    }
}

/// 44pt round Liquid Glass button for headers.
struct GlassCircleButton: View {
    let symbol: String
    let label: String
    var badge: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(DTheme.ink)
                .frame(width: 44, height: 44)
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle().fill(DTheme.negative).frame(width: 8, height: 8).offset(x: -11, y: 11)
                    }
                }
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Circle())
        .accessibilityLabel(label)
    }
}

// MARK: - Surfaces

extension View {
    /// A white card on the grey shell, like the web's sheet.
    func dubblCard(padding: CGFloat = 16, radius: CGFloat = 20) -> some View {
        self.padding(padding)
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
    }
}

/// A grouped card whose children get inset hairlines between them.
struct CardStack<Content: View>: View {
    var dividerInset: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content) { subviews in
                ForEach(subviews) { subview in
                    subview
                    if subview.id != subviews.last?.id {
                        Hairline().padding(.leading, dividerInset)
                    }
                }
            }
        }
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct Hairline: View {
    var body: some View {
        Rectangle().fill(DTheme.hairline).frame(height: 0.5)
    }
}

/// Small grey heading above a group, sentence case.
struct SectionLabel: View {
    let title: String
    var action: (title: String, run: () -> Void)?

    init(_ title: String, action: (title: String, run: () -> Void)? = nil) {
        self.title = title
        self.action = action
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Spacer()
            if let action {
                Button(action.title, action: action.run)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
            }
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Status and identity

struct StatusPill: View {
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(tone.color)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(tone.background, in: Capsule())
            .fixedSize()
    }
}

struct IconTile: View {
    let symbol: String
    var tone: Tone = .neutral
    var size: CGFloat = 34

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.44, weight: .medium))
            .foregroundStyle(tone == .neutral ? DTheme.ink : tone.color)
            .frame(width: size, height: size)
            .background(tone.background, in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
    }
}

struct Avatar: View {
    let name: String
    var imageURL: String?
    var size: CGFloat = 36
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let dark = colorScheme == .dark
        ZStack {
            Circle().fill(DTheme.avatarColor(for: name).opacity(dark ? 0.3 : 0.16))
            Text(name.initials)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(DTheme.avatarColor(for: name))
                .brightness(dark ? 0.45 : 0)
            if let imageURL, let url = URL(string: imageURL) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Money in the document's currency, figures aligned.
struct MoneyText: View {
    let minor: Int
    let currency: String
    var size: CGFloat = 15
    var weight: Font.Weight = .medium
    var compact = false

    var body: some View {
        Text(compact ? Money.compact(minor, currency: currency) : Money.format(minor, currency: currency))
            .font(DFont.figure(size, weight: weight))
            .contentTransition(.numericText(value: Double(minor)))
    }
}

// MARK: - Chips

/// Horizontally scrolling filter chips. The selected chip is a darker grey
/// tint with ink text.
struct ChipRow<Value: Hashable>: View {
    let options: [(value: Value, label: String, count: Int?)]
    @Binding var selection: Value

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.value) { option in
                    let selected = option.value == selection
                    Button {
                        withAnimation(.snappy(duration: 0.22)) { selection = option.value }
                    } label: {
                        HStack(spacing: 5) {
                            Text(option.label)
                            if let count = option.count, count > 0 {
                                Text("\(count)")
                                    .foregroundStyle(DTheme.inkTertiary)
                                    .contentTransition(.numericText(value: Double(count)))
                            }
                        }
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(selected ? DTheme.tintStrong : DTheme.tint.opacity(0.0001), in: Capsule())
                        .overlay(Capsule().strokeBorder(selected ? .clear : DTheme.hairline, lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .sensoryFeedback(.selection, trigger: selection)
    }
}

// MARK: - Rows

/// "Label ........ value" inside a detail card.
struct DetailRow<Value: View>: View {
    let label: String
    @ViewBuilder var value: Value

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(DTheme.inkSecondary)
            Spacer(minLength: 12)
            value
                .font(.system(size: 15))
                .foregroundStyle(DTheme.ink)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
    }
}

extension DetailRow where Value == Text {
    init(_ label: String, _ value: String) {
        self.label = label
        self.value = Text(value)
    }
}

// MARK: - States

struct EmptyStateView: View {
    let symbol: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
                .frame(width: 48, height: 48)
                .background(DTheme.tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(spacing: 6) {
                Text(title)
                    .displayFont(19)
                    .foregroundStyle(DTheme.ink)
                if let message {
                    Text(message)
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                        .multilineTextAlignment(.center)
                }
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(InkButtonStyle(size: .small))
                    .padding(.top, 4)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct ErrorStateView: View {
    var title = "Couldn't load this"
    let message: String
    let retry: () async -> Void
    @State private var retrying = false

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
                .frame(width: 48, height: 48)
                .background(DTheme.tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(spacing: 6) {
                Text(title).displayFont(19).foregroundStyle(DTheme.ink)
                Text(message)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                Task {
                    retrying = true
                    await retry()
                    retrying = false
                }
            } label: {
                if retrying { ProgressView().tint(DTheme.ink) } else { Text("Try again") }
            }
            .buttonStyle(SoftButtonStyle(size: .small))
            .disabled(retrying)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// Placeholder rows that shimmer while a list loads.
struct SkeletonRows: View {
    var rows = 6
    var avatar = true

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0 ..< rows, id: \.self) { index in
                HStack(spacing: 12) {
                    if avatar { Circle().fill(DTheme.tint).frame(width: 36, height: 36) }
                    VStack(alignment: .leading, spacing: 7) {
                        RoundedRectangle(cornerRadius: 4).fill(DTheme.tintStrong).frame(width: 140, height: 11)
                        RoundedRectangle(cornerRadius: 4).fill(DTheme.tint).frame(width: 90, height: 9)
                    }
                    Spacer()
                    RoundedRectangle(cornerRadius: 4).fill(DTheme.tintStrong).frame(width: 64, height: 11)
                }
                .padding(.horizontal, 16)
                .frame(height: 64)
                .opacity(1 - Double(index) * 0.12)
            }
        }
        .skeletonShimmer()
        .accessibilityLabel("Loading")
    }
}

private struct Shimmer: ViewModifier {
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .mask {
                GeometryReader { proxy in
                    LinearGradient(
                        colors: [.black.opacity(0.55), .black, .black.opacity(0.55)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: proxy.size.width * 2)
                    .offset(x: reduceMotion ? 0 : phase * proxy.size.width)
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) { phase = 0 }
            }
    }
}

extension View {
    func skeletonShimmer() -> some View { modifier(Shimmer()) }
}

// MARK: - Toasts

/// One app-wide toast: a small ink capsule above the tab bar.
@MainActor @Observable
final class ToastCenter {
    struct Toast: Equatable {
        var id = UUID()
        var message: String
        var symbol: String?
        var isError = false
    }

    private(set) var current: Toast?
    private(set) var pulse = 0

    func show(_ message: String, symbol: String? = "checkmark", isError: Bool = false) {
        let toast = Toast(message: message, symbol: isError ? "exclamationmark.circle" : symbol, isError: isError)
        withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { current = toast }
        pulse += 1
        Task {
            try? await Task.sleep(for: .seconds(2.6))
            if current?.id == toast.id {
                withAnimation(.easeOut(duration: 0.25)) { current = nil }
            }
        }
    }

    func error(_ error: Error) {
        show(error.localizedDescription, isError: true)
    }
}

struct ToastOverlay: ViewModifier {
    let center: ToastCenter

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let toast = center.current {
                    HStack(spacing: 8) {
                        if let symbol = toast.symbol { Image(systemName: symbol).font(.system(size: 13, weight: .semibold)) }
                        Text(toast.message).font(.system(size: 14, weight: .medium)).lineLimit(2)
                    }
                    .foregroundStyle(DTheme.inkInverse)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .background(toast.isError ? DTheme.negative : DTheme.ink, in: Capsule())
                    .padding(.horizontal, 24)
                    .padding(.bottom, 96)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .id(toast.id)
                }
            }
            .sensoryFeedback(trigger: center.pulse) { _, _ in
                center.current?.isError == true ? .error : .success
            }
    }
}

// MARK: - Inputs

/// A labelled field inside a form card.
struct FieldRow<Field: View>: View {
    let label: String
    @ViewBuilder var field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            field
                .font(.system(size: 16))
                .foregroundStyle(DTheme.ink)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Type an amount in major units ("12.50"); binds to minor units. Shows the
/// currency's decimals and follows changes made from outside (e.g. "Full amount").
struct AmountField: View {
    @Binding var minor: Int
    let currency: String
    var placeholder = "0.00"
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 4) {
            Text(Money.symbol(currency)).foregroundStyle(DTheme.inkSecondary)
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .focused($focused)
                .font(DFont.figure(16, weight: .regular))
                .onChange(of: text) { _, value in
                    let normalized = value.replacingOccurrences(of: ",", with: ".")
                    let parsed = Decimal(string: normalized).map { Money.minor(fromMajor: $0, currency: currency) } ?? 0
                    if parsed != minor { minor = parsed }
                }
        }
        .onAppear { syncText() }
        .onChange(of: minor) { _, _ in
            if !focused { syncText() }
        }
    }

    private func syncText() {
        let current = Decimal(string: text.replacingOccurrences(of: ",", with: "."))
            .map { Money.minor(fromMajor: $0, currency: currency) } ?? 0
        guard current != minor || text.isEmpty else { return }
        text = minor == 0 ? "" : Self.plain(minor, currency: currency)
    }

    /// "4536.00": no symbol or grouping, so it stays editable.
    static func plain(_ minor: Int, currency: String) -> String {
        let digits = Money.fractionDigits(currency)
        let value = NSDecimalNumber(decimal: Money.major(minor, currency: currency)).doubleValue
        return String(format: "%.\(digits)f", value)
    }
}
