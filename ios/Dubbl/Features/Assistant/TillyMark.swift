import SwiftUI

/// Tilly's palette, matching the web's `--color-tilly-*`.
enum TillyColor {
    static let t50 = Color(hex: 0xFFF6F0)
    static let t200 = Color(hex: 0xFFD0B8)
    static let t400 = Color(hex: 0xFF9A6E)
    static let t500 = Color(hex: 0xF97F52)
    static let t600 = Color(hex: 0xE8653C)
    /// Soft wash behind Tilly's own surfaces (approval card, empty state glow).
    static let wash = Color.dynamic(light: 0xFFF6F0, dark: 0x2A1D17)
    static let line = Color.dynamic(light: 0xFFD0B8, dark: 0x4A2E22)
}

enum TillyState: Equatable {
    case idle, thinking, attention
}

/// What the mark shows: the run state plus the happy and muted looks.
private enum TillyLook: Equatable {
    case idle, thinking, attention, happy, muted

    var colors: (Color, Color, Color) {
        switch self {
        case .idle, .thinking: (Color(hex: 0xFFDDB8), Color(hex: 0xFF9A6E), Color(hex: 0xE8653C))
        case .attention: (Color(hex: 0xFDE68A), Color(hex: 0xF59E0B), Color(hex: 0xEA580C))
        case .happy: (Color(hex: 0xBBF7D0), Color(hex: 0x34D399), Color(hex: 0x059669))
        case .muted: (
                Color.dynamic(light: 0xE4E4E7, dark: 0x62666D),
                Color.dynamic(light: 0xA1A1AA, dark: 0x45474D),
                Color.dynamic(light: 0x71717A, dark: 0x2C2D31)
            )
        }
    }

    /// Seconds per blob breath and per swirl turn.
    var periods: (body: Double, swirl: Double) {
        switch self {
        case .thinking: (1.4, 1.2)
        case .muted: (9, 20)
        default: (5, 9)
        }
    }
}

/// Integrates phase across frames so a speed change never jumps, and fades
/// colours between looks.
private final class TillyClock {
    var last: Date?
    var time: Double = 0
    var bodyPhase: Double = 0
    var swirlPhase: Double = 0
    var look: TillyLook?
    var previous: TillyLook?
    var changedAt: Double = -10

    func advance(to date: Date, look target: TillyLook) {
        let dt = last.map { min(0.1, max(0, date.timeIntervalSince($0))) } ?? 0
        last = date
        time += dt
        let periods = target.periods
        bodyPhase += dt / periods.body
        swirlPhase += dt / periods.swirl
        if look != target {
            previous = look ?? target
            look = target
            changedAt = time
        }
    }

    func colors() -> (Color, Color, Color) {
        guard let look else { return TillyLook.idle.colors }
        let to = look.colors
        guard let previous, previous != look else { return to }
        let p = min(1, (time - changedAt) / 0.6)
        guard p < 1 else { return to }
        let from = previous.colors
        let e = p * p * (3 - 2 * p)
        return (from.0.mix(with: to.0, by: e), from.1.mix(with: to.1, by: e), from.2.mix(with: to.2, by: e))
    }
}

/// The breathing outline: a circle whose radius ripples with the phase.
private struct BlobShape: Shape {
    var phase: Double

    func path(in rect: CGRect) -> Path {
        let a = phase * 2 * .pi
        let sx = 1 + 0.035 * sin(a)
        let sy = 1 - 0.03 * sin(a)
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let base = min(rect.width, rect.height) / 2 / 1.06
        var path = Path()
        let steps = 72
        for i in 0 ... steps {
            let t = Double(i) / Double(steps) * 2 * .pi
            let r = base * (1 + 0.05 * sin(2 * t + a) + 0.03 * sin(3 * t - a + 1))
            let p = CGPoint(x: center.x + cos(t) * r * sx, y: center.y + sin(t) * r * sy)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }
}

private struct Squash: Equatable {
    var x: CGFloat = 1
    var y: CGFloat = 1
    var lift: CGFloat = 0
}

/// Tilly: a warm apricot blob with light swirling inside. It breathes at
/// rest, swirls faster while a run works, hops in amber while a run waits on
/// approval, bounces in green when a run finishes, and boops on `boop`.
struct TillyMark: View {
    var size: CGFloat = 20
    var state: TillyState = .idle
    var muted = false
    /// Whether a run ending now succeeded; only then does the mark celebrate.
    var celebrate = true
    /// Bumped on composer keystrokes.
    var boop = 0
    /// Jiggles when poked. Off inside a button, where the tap belongs to the button.
    var tappable = false

    @State private var clock = TillyClock()
    @State private var justFinished = false
    @State private var jelly = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var look: TillyLook {
        if justFinished && state == .idle { return .happy }
        if muted && state == .idle { return .muted }
        switch state {
        case .idle: return .idle
        case .thinking: return .thinking
        case .attention: return .attention
        }
    }

    var body: some View {
        TimelineView(.animation(paused: reduceMotion && clock.look == look)) { context in
            let _ = clock.advance(to: context.date, look: look)
            let colors = clock.colors()
            ZStack {
                AngularGradient(
                    colors: [colors.0, colors.1, colors.2, colors.1, colors.0],
                    center: .center,
                    angle: .degrees(reduceMotion ? 0 : clock.swirlPhase * 360)
                )
                .frame(width: size * 1.6, height: size * 1.6)
                .blur(radius: size * 0.06)
                .frame(width: size * 0.9, height: size * 0.9)
                .clipShape(BlobShape(phase: reduceMotion ? 0 : clock.bodyPhase))
                .overlay(BlobShape(phase: reduceMotion ? 0 : clock.bodyPhase).stroke(.white.opacity(0.28), lineWidth: 0.6))
                .shadow(color: colors.2.opacity(0.4), radius: size * 0.1, y: size * 0.06)

                Ellipse()
                    .fill(RadialGradient(
                        colors: [.white.opacity(0.85), .white.opacity(0)],
                        center: .center,
                        startRadius: 0,
                        endRadius: size * 0.17
                    ))
                    .frame(width: size * 0.34, height: size * 0.24)
                    .rotationEffect(.degrees(-28))
                    .opacity(look == .muted ? 0.5 : 1)
                    .position(x: size * 0.38, y: size * 0.29)
            }
            .frame(width: size, height: size)
            .scaleEffect(reduceMotion ? 1 : breathe(clock.time, period: look == .thinking ? 1.3 : 4.5))
            .offset(y: look == .attention && !reduceMotion ? -hop(clock.time) * size : 0)
        }
        .frame(width: size, height: size)
        .keyframeAnimator(initialValue: Squash(), trigger: jelly) { content, s in
            content.scaleEffect(x: s.x, y: s.y)
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                SpringKeyframe(1.18, duration: 0.15)
                SpringKeyframe(0.88, duration: 0.12)
                SpringKeyframe(1.06, duration: 0.12)
                SpringKeyframe(1, duration: 0.2)
            }
            KeyframeTrack(\.y) {
                SpringKeyframe(0.84, duration: 0.15)
                SpringKeyframe(1.12, duration: 0.12)
                SpringKeyframe(0.95, duration: 0.12)
                SpringKeyframe(1, duration: 0.2)
            }
        }
        .keyframeAnimator(initialValue: Squash(), trigger: boop) { content, s in
            content.scaleEffect(x: s.x, y: s.y)
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                CubicKeyframe(1.14, duration: 0.12)
                CubicKeyframe(1, duration: 0.2)
            }
            KeyframeTrack(\.y) {
                CubicKeyframe(0.9, duration: 0.12)
                CubicKeyframe(1, duration: 0.2)
            }
        }
        .keyframeAnimator(initialValue: Squash(), trigger: justFinished) { content, s in
            content
                .scaleEffect(x: s.x, y: s.y, anchor: .bottom)
                .offset(y: -s.lift * size)
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                SpringKeyframe(1.16, duration: 0.21)
                SpringKeyframe(0.95, duration: 0.18)
                SpringKeyframe(1, duration: 0.31)
            }
            KeyframeTrack(\.y) {
                SpringKeyframe(0.88, duration: 0.21)
                SpringKeyframe(1.08, duration: 0.18)
                SpringKeyframe(1, duration: 0.31)
            }
            KeyframeTrack(\.lift) {
                SpringKeyframe(0, duration: 0.21)
                SpringKeyframe(0.16, duration: 0.18)
                SpringKeyframe(0, duration: 0.31)
            }
        }
        .contentShape(Circle())
        .simultaneousGesture(TapGesture().onEnded { if !reduceMotion { jelly += 1 } }, isEnabled: tappable)
        .onChange(of: state) { old, new in
            guard old == .thinking, new == .idle, celebrate else { return }
            justFinished = true
            Task {
                try? await Task.sleep(for: .milliseconds(1400))
                justFinished = false
            }
        }
        .accessibilityHidden(true)
    }

    private func breathe(_ t: Double, period: Double) -> CGFloat {
        1 - 0.035 * (1 - cos(2 * .pi * t / period))
    }

    /// The amber hop, as a fraction of the mark's size.
    private func hop(_ t: Double) -> CGFloat {
        let f = t.truncatingRemainder(dividingBy: 1.0)
        func ease(_ x: Double) -> Double { x * x * (3 - 2 * x) }
        switch f {
        case ..<0.35: return 0.14 * ease(f / 0.35)
        case ..<0.6: return 0.14 * (1 - ease((f - 0.35) / 0.25))
        default: return 0
        }
    }
}

/// A 3×3 grid of warm pixels chasing each other: the inline "working" loader.
struct TillySpark: View {
    var size: CGFloat = 13
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Cells in chase order: the ring clockwise, then the centre.
    private static let order = [0, 1, 2, 5, 8, 7, 6, 3, 4]

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            let cell = size * 0.26
            let gap = max(0.5, size * 0.11)
            VStack(spacing: gap) {
                ForEach(0 ..< 3, id: \.self) { row in
                    HStack(spacing: gap) {
                        ForEach(0 ..< 3, id: \.self) { col in
                            RoundedRectangle(cornerRadius: cell * 0.25, style: .continuous)
                                .fill(TillyColor.t500)
                                .frame(width: cell, height: cell)
                                .opacity(opacity(row * 3 + col, time: time))
                        }
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func opacity(_ cell: Int, time: Double) -> Double {
        guard !reduceMotion, let index = Self.order.firstIndex(of: cell) else { return 0.6 }
        var f = (time - Double(index) * 0.09).truncatingRemainder(dividingBy: 0.81) / 0.81
        if f < 0 { f += 1 }
        if f < 0.18 { return 0.16 + 0.84 * (f / 0.18) }
        if f < 0.45 { return 1 - 0.66 * ((f - 0.18) / 0.27) }
        return 0.34 - 0.18 * ((f - 0.45) / 0.55)
    }
}

/// Live status text: a warm light sweeping across the grey, like the web's `tilly-shimmer`.
struct TillyShimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content.foregroundStyle(DTheme.inkSecondary)
        } else {
            content
                .foregroundStyle(DTheme.inkSecondary)
                .overlay {
                    TimelineView(.animation) { context in
                        let t = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.6) / 1.6
                        GeometryReader { proxy in
                            let w = proxy.size.width
                            let band = max(24, w * 0.45)
                            LinearGradient(
                                colors: [TillyColor.t500.opacity(0), TillyColor.t500, TillyColor.t500.opacity(0)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: band)
                            .offset(x: -band + (w + band) * t)
                        }
                    }
                    .mask(content)
                    .allowsHitTesting(false)
                }
        }
    }
}

extension View {
    func tillyShimmer() -> some View { modifier(TillyShimmer()) }
}
