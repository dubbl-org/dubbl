import SwiftUI

// Open, tile-less pieces for the overview and the assistant: big rounded
// numbers that count up, rules instead of cards, and the website's paintings.

// MARK: - Paintings

/// One of the website's painted landscapes (public/landing/bg), dimmed at
/// night the way the site does with `dark:brightness-[0.45]`.
struct Painting: View {
    var name = "MistValley"
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Image(name)
            .resizable()
            .scaledToFill()
            .overlay(Color.black.opacity(colorScheme == .dark ? 0.55 : 0))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

// MARK: - Numbers

/// A number that counts up to its value.
struct CountUpText: View, @MainActor Animatable {
    var value: Double
    var format: (Double) -> String

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text(format(value))
    }
}

/// Change against the previous period: green when it moved the right way.
struct DeltaLabel: View {
    /// Percent change.
    let change: Double?
    var lowerIsBetter = false

    var body: some View {
        if let change, change.isFinite {
            let up = change >= 0
            let good: Bool? = abs(change) < 0.5 ? nil : (up != lowerIsBetter)
            HStack(spacing: 2) {
                Image(systemName: up ? "arrow.up.right" : "arrow.down.right")
                    .font(.system(size: 9, weight: .bold))
                Text(String(format: "%.0f%%", min(abs(change), 999)))
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
            }
            .foregroundStyle(good.map { $0 ? DTheme.positive : DTheme.negative } ?? DTheme.inkTertiary)
        }
    }

    static func percent(_ now: Int, _ before: Int) -> Double? {
        guard before != 0 else { return nil }
        return (Double(now) - Double(before)) / abs(Double(before)) * 100
    }
}

/// A smooth line through the values that draws itself in, with a soft fill.
struct TrendSparkline: View {
    let values: [Double]
    var color: Color = DTheme.accent
    var fill = true
    var lineWidth: CGFloat = 1.7
    var delay: Double = 0

    @State private var drawn: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            let line = Self.path(values, in: proxy.size)
            ZStack {
                if fill {
                    Self.area(line, in: proxy.size)
                        .fill(LinearGradient(colors: [color.opacity(0.22), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                        .mask(alignment: .leading) {
                            Rectangle().frame(width: proxy.size.width * drawn)
                        }
                }
                line
                    .trim(from: 0, to: drawn)
                    .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.0).delay(delay)) { drawn = 1 }
        }
        .accessibilityHidden(true)
    }

    private static func area(_ line: Path, in size: CGSize) -> Path {
        var area = line
        area.addLine(to: CGPoint(x: size.width, y: size.height))
        area.addLine(to: CGPoint(x: 0, y: size.height))
        area.closeSubpath()
        return area
    }

    private static func path(_ values: [Double], in size: CGSize) -> Path {
        var path = Path()
        guard values.count > 1 else { return path }
        // Fit the line to its own range, with headroom, so month-to-month moves read.
        let high = values.max() ?? 0, low = values.min() ?? 0
        let pad = max((high - low) * 0.2, abs(high) * 0.02, 0.0001)
        let maxV = high + pad
        let minV = low - pad
        let span = maxV - minV
        let inset: CGFloat = 2
        let points = values.enumerated().map { i, v in
            CGPoint(
                x: size.width * CGFloat(i) / CGFloat(values.count - 1),
                y: inset + (size.height - inset * 2) * (1 - CGFloat((v - minV) / span))
            )
        }
        path.move(to: points[0])
        for i in 1 ..< points.count {
            let p0 = points[i - 1], p1 = points[i]
            let mid = (p1.x - p0.x) / 2
            path.addCurve(to: p1, control1: CGPoint(x: p0.x + mid, y: p0.y), control2: CGPoint(x: p1.x - mid, y: p1.y))
        }
        return path
    }
}

// MARK: - Headings

/// Section heading on the canvas: bold title, optional trailing action.
struct AirSectionHeader: View {
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .displayFont(20)
                .foregroundStyle(DTheme.ink)
            Spacer()
            if let actionTitle, let action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text(actionTitle)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 2)
    }
}

/// The site's two-tone heading: a grey lead, then the point in ink.
struct TwoToneTitle: View {
    var lead: String?
    let title: String
    var size: CGFloat = 30
    var leadColor: Color = DTheme.inkTertiary
    var titleColor: Color = DTheme.ink

    var body: some View {
        Group {
            if let lead {
                Text("\(Text(lead).foregroundStyle(leadColor)) \(Text(title).foregroundStyle(titleColor))")
            } else {
                Text(title).foregroundStyle(titleColor)
            }
        }
        .displayFont(size, weight: .medium)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Pills

/// One short fact over the painting, tappable through to where it's handled.
struct InsightPill: View {
    let symbol: String
    let text: Text
    var tint: Color = DTheme.ink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: symbol)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(tint)
                text
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(DTheme.ink)
            }
            .padding(.horizontal, 13)
            .frame(height: 36)
            .contentShape(Capsule())
        }
        .buttonStyle(TapScaleStyle())
        .glassEffect(.regular.interactive(), in: Capsule())
    }
}

// MARK: - Motion

/// Section entrance: rises in after the hero, one beat apart.
struct Reveal: ViewModifier {
    let shown: Bool
    let index: Int

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 18)
            .animation(.spring(response: 0.6, dampingFraction: 0.86).delay(0.08 + Double(index) * 0.06), value: shown)
    }
}

extension View {
    func reveal(_ shown: Bool, _ index: Int) -> some View {
        modifier(Reveal(shown: shown, index: index))
    }
}
