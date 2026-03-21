import SwiftUI

// MARK: - Dubbl Logo (exact SVG paths from web app)
// viewBox: 0 0 40 32
// Right "d": M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z  fill=#34d399
// Left  "d": M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z    fill=#059669

struct DubblLogo: View {
    var size: CGFloat = 40
    var variant: LogoVariant = .color

    enum LogoVariant {
        case color       // dark emerald front, light emerald back
        case white       // white with opacity (for gradient banners)
    }

    private var scale: CGFloat { size / 32.0 }
    private var svgWidth: CGFloat { 40 * scale }

    var body: some View {
        Canvas { ctx, _ in
            // Right "d" (behind)
            let right = dShape(offsetX: 18 * scale)
            switch variant {
            case .color:
                ctx.fill(right, with: .color(Color(hex: "34d399")))
            case .white:
                ctx.fill(right, with: .color(.white.opacity(0.35)))
            }

            // Left "d" (in front)
            let left = dShape(offsetX: 4 * scale)
            switch variant {
            case .color:
                ctx.fill(left, with: .color(Color(hex: "059669")))
            case .white:
                ctx.fill(left, with: .color(.white.opacity(0.9)))
            }
        }
        .frame(width: svgWidth, height: size)
    }

    /// Builds a "d" shape: vertical left + rounded right bulge (quarter-circle arcs, r=10)
    private func dShape(offsetX: CGFloat) -> Path {
        let r = 10 * scale
        var p = Path()
        // M(x, 4*s) → top-left
        p.move(to: CGPoint(x: offsetX, y: 4 * scale))
        // h8 → top-right before arc
        p.addLine(to: CGPoint(x: offsetX + 8 * scale, y: 4 * scale))
        // arc r=10: top-right corner sweeping down (center at x+8, y+14)
        p.addArc(
            center: CGPoint(x: offsetX + 8 * scale, y: 14 * scale),
            radius: r,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )
        // v4
        p.addLine(to: CGPoint(x: offsetX + 18 * scale, y: 18 * scale))
        // arc r=10: bottom-right corner sweeping left (center at x+8, y+18)
        p.addArc(
            center: CGPoint(x: offsetX + 8 * scale, y: 18 * scale),
            radius: r,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        // H(x) → bottom-left
        p.addLine(to: CGPoint(x: offsetX, y: 28 * scale))
        // V4 → back to top
        p.closeSubpath()
        return p
    }
}

// MARK: - Google Icon (exact SVG paths from web app, viewBox 0 0 24 24)

struct GoogleIcon: View {
    var size: CGFloat = 18

    var body: some View {
        Canvas { ctx, _ in
            let s = size / 24.0

            // Blue path
            ctx.fill(parsedBluePath(s), with: .color(Color(hex: "4285F4")))
            // Green path
            ctx.fill(parsedGreenPath(s), with: .color(Color(hex: "34A853")))
            // Yellow path
            ctx.fill(parsedYellowPath(s), with: .color(Color(hex: "FBBC05")))
            // Red path
            ctx.fill(parsedRedPath(s), with: .color(Color(hex: "EA4335")))
        }
        .frame(width: size, height: size)
    }

    // Blue: M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z
    private func parsedBluePath(_ s: CGFloat) -> Path {
        var p = Path()
        p.move(to: pt(22.56, 12.25, s))
        p.addCurve(to: pt(22.36, 10.0, s),
                    control1: pt(22.56, 11.47, s),
                    control2: pt(22.49, 10.72, s))
        p.addLine(to: pt(12, 10.0, s))
        p.addLine(to: pt(12, 14.26, s))
        p.addLine(to: pt(17.92, 14.26, s))
        // Approximate the arc as curves
        p.addCurve(to: pt(15.72, 17.58, s),
                    control1: pt(17.53, 15.26, s),
                    control2: pt(16.82, 16.48, s))
        p.addLine(to: pt(15.72, 20.35, s))
        p.addLine(to: pt(19.29, 20.35, s))
        p.addCurve(to: pt(22.57, 12.25, s),
                    control1: pt(21.37, 18.43, s),
                    control2: pt(22.57, 15.61, s))
        p.closeSubpath()
        return p
    }

    // Green: M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z
    private func parsedGreenPath(_ s: CGFloat) -> Path {
        var p = Path()
        p.move(to: pt(12, 23, s))
        p.addCurve(to: pt(19.28, 20.34, s),
                    control1: pt(14.97, 23, s),
                    control2: pt(17.46, 22.02, s))
        p.addLine(to: pt(15.71, 17.57, s))
        p.addCurve(to: pt(12, 18.63, s),
                    control1: pt(14.73, 18.23, s),
                    control2: pt(13.48, 18.63, s))
        p.addCurve(to: pt(5.84, 14.1, s),
                    control1: pt(9.14, 18.63, s),
                    control2: pt(6.71, 16.7, s))
        p.addLine(to: pt(2.18, 14.1, s))
        p.addLine(to: pt(2.18, 16.94, s))
        p.addCurve(to: pt(12, 23, s),
                    control1: pt(3.99, 20.53, s),
                    control2: pt(7.7, 23, s))
        p.closeSubpath()
        return p
    }

    // Yellow: M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z
    private func parsedYellowPath(_ s: CGFloat) -> Path {
        var p = Path()
        p.move(to: pt(5.84, 14.09, s))
        p.addCurve(to: pt(5.49, 12.0, s),
                    control1: pt(5.62, 13.43, s),
                    control2: pt(5.49, 12.73, s))
        p.addCurve(to: pt(5.84, 9.91, s),
                    control1: pt(5.49, 11.27, s),
                    control2: pt(5.62, 10.57, s))
        p.addLine(to: pt(5.84, 7.07, s))
        p.addLine(to: pt(2.18, 7.07, s))
        p.addCurve(to: pt(1, 12, s),
                    control1: pt(1.43, 8.55, s),
                    control2: pt(1, 10.22, s))
        p.addCurve(to: pt(2.18, 16.93, s),
                    control1: pt(1, 13.78, s),
                    control2: pt(1.43, 15.45, s))
        p.addLine(to: pt(5.03, 14.71, s))
        p.addLine(to: pt(5.84, 14.09, s))
        p.closeSubpath()
        return p
    }

    // Red: M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z
    private func parsedRedPath(_ s: CGFloat) -> Path {
        var p = Path()
        p.move(to: pt(12, 5.38, s))
        p.addCurve(to: pt(16.21, 7.02, s),
                    control1: pt(13.62, 5.38, s),
                    control2: pt(15.06, 5.94, s))
        p.addLine(to: pt(19.36, 3.87, s))
        p.addCurve(to: pt(12, 1, s),
                    control1: pt(17.45, 2.09, s),
                    control2: pt(14.97, 1, s))
        p.addCurve(to: pt(2.18, 7.07, s),
                    control1: pt(7.7, 1, s),
                    control2: pt(3.99, 3.47, s))
        p.addLine(to: pt(5.84, 9.91, s))
        p.addCurve(to: pt(12, 5.38, s),
                    control1: pt(6.71, 7.31, s),
                    control2: pt(9.14, 5.38, s))
        p.closeSubpath()
        return p
    }

    private func pt(_ x: CGFloat, _ y: CGFloat, _ s: CGFloat) -> CGPoint {
        CGPoint(x: x * s, y: y * s)
    }
}

// MARK: - Apple Icon (SVG path from web app)

struct AppleIcon: View {
    var size: CGFloat = 18
    var color: Color = Color(.label)

    var body: some View {
        Canvas { ctx, _ in
            let s = size / 24.0
            var p = Path()

            // Main apple body
            p.move(to: pt(17.05, 20.28, s))
            p.addCurve(to: pt(13.97, 20.68, s),
                        control1: pt(16.07, 21.23, s),
                        control2: pt(15.0, 21.16, s))
            p.addCurve(to: pt(10.73, 20.68, s),
                        control1: pt(12.88, 20.18, s),
                        control2: pt(11.89, 20.2, s))
            p.addCurve(to: pt(7.67, 20.28, s),
                        control1: pt(9.29, 21.3, s),
                        control2: pt(8.53, 21.12, s))
            // Lower body curve approximation
            p.addCurve(to: pt(9.05, 7.31, s),
                        control1: pt(2.79, 15.25, s),
                        control2: pt(3.51, 7.59, s))
            p.addCurve(to: pt(12.13, 8.11, s),
                        control1: pt(10.4, 7.38, s),
                        control2: pt(11.34, 8.05, s))
            p.addCurve(to: pt(15.7, 7.27, s),
                        control1: pt(13.31, 7.87, s),
                        control2: pt(14.44, 7.18, s))
            p.addCurve(to: pt(19.1, 9.07, s),
                        control1: pt(17.21, 7.39, s),
                        control2: pt(18.35, 7.99, s))
            p.addCurve(to: pt(19.58, 16.2, s),
                        control1: pt(15.98, 10.94, s),
                        control2: pt(16.72, 15.05, s))
            p.addCurve(to: pt(17.05, 20.28, s),
                        control1: pt(19.01, 17.7, s),
                        control2: pt(18.27, 19.19, s))
            p.closeSubpath()

            // Leaf
            var leaf = Path()
            leaf.move(to: pt(12.03, 7.25, s))
            leaf.addCurve(to: pt(15.77, 3.0, s),
                          control1: pt(11.88, 5.02, s),
                          control2: pt(13.69, 3.18, s))
            leaf.addCurve(to: pt(12.03, 7.25, s),
                          control1: pt(16.06, 5.58, s),
                          control2: pt(13.43, 7.5, s))
            leaf.closeSubpath()

            ctx.fill(p, with: .color(color))
            ctx.fill(leaf, with: .color(color))
        }
        .frame(width: size, height: size)
    }

    private func pt(_ x: CGFloat, _ y: CGFloat, _ s: CGFloat) -> CGPoint {
        CGPoint(x: x * s, y: y * s)
    }
}
