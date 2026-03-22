import SwiftUI

/// Rich emerald gradient banner with animated orbital rings.
struct AuthBanner: View {
    var compact: Bool = false
    @State private var pulseScale: CGFloat = 0.95
    @State private var pulseOpacity: Double = 0.4
    @State private var ringRotation: Double = 0
    @State private var appeared = false

    var body: some View {
        ZStack {
            // Rich emerald gradient background (matches web grain gradient palette)
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

            // Secondary diagonal gradient for depth
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

            // Noise/grain texture
            Canvas { ctx, size in
                for _ in 0..<Int(size.width * size.height * 0.02) {
                    let x = CGFloat.random(in: 0..<size.width)
                    let y = CGFloat.random(in: 0..<size.height)
                    let opacity = Double.random(in: 0.03...0.08)
                    ctx.fill(
                        Path(CGRect(x: x, y: y, width: 1, height: 1)),
                        with: .color(.white.opacity(opacity))
                    )
                }
            }

            // Radial vignette
            RadialGradient(
                colors: [.clear, Color.emerald800.opacity(0.15)],
                center: .center,
                startRadius: 60,
                endRadius: 300
            )

            // Decorative orbital rings
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    .frame(width: 280, height: 280)
                    .rotationEffect(.degrees(ringRotation))

                Circle()
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    .frame(width: 200, height: 200)
                    .rotationEffect(.degrees(-ringRotation * 0.7))

                Circle()
                    .stroke(Color.white.opacity(0.1), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
                    .frame(width: 240, height: 240)
                    .rotationEffect(.degrees(ringRotation * 0.5))

                ForEach(0..<6, id: \.self) { i in
                    Circle()
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 4, height: 4)
                        .offset(y: -120)
                        .rotationEffect(.degrees(Double(i) * 60 + ringRotation))
                }
            }
            .opacity(appeared ? 1 : 0)

            // Pulsing glow
            Circle()
                .fill(Color(hex: "34d399").opacity(0.2))
                .frame(width: 140, height: 140)
                .blur(radius: 40)
                .scaleEffect(pulseScale)
                .opacity(pulseOpacity)

            // Logo + text
            VStack(spacing: 8) {
                DubblLogo(size: compact ? 32 : 44, variant: .white)
                    .opacity(appeared ? 1 : 0)
                    .scaleEffect(appeared ? 1 : 0.9)
                Text("dubbl")
                    .font(.system(size: compact ? 18 : 24, weight: .bold))
                    .foregroundColor(.white)
                    .opacity(appeared ? 1 : 0)
                if !compact {
                    Text("Open source bookkeeping, done right")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                        .opacity(appeared ? 1 : 0)
                }
            }
            .padding(.top, Self.statusBarHeight + (compact ? 8 : 16))
            .padding(.bottom, compact ? 16 : 24)
        }
        .frame(height: (compact ? 160 : 220) + Self.statusBarHeight)
        .clipped()
        .onAppear {
            withAnimation(.easeOut(duration: 0.5).delay(0.1)) {
                appeared = true
            }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                pulseScale = 1.05
                pulseOpacity = 0.7
            }
            withAnimation(.linear(duration: 60).repeatForever(autoreverses: false)) {
                ringRotation = 360
            }
        }
    }

    private static var statusBarHeight: CGFloat {
        guard let windowScene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
        else { return 59 }
        return windowScene.statusBarManager?.statusBarFrame.height ?? 59
    }
}

/// Full-screen emerald background with grain, rings, and glow — used behind status bar.
struct AuthBackground: View {
    @State private var ringRotation: Double = 0

    var body: some View {
        ZStack {
            // Rich emerald gradient background (matches web grain gradient palette)
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

            // Secondary diagonal gradient for depth
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

            Canvas { ctx, size in
                for _ in 0..<Int(size.width * size.height * 0.02) {
                    let x = CGFloat.random(in: 0..<size.width)
                    let y = CGFloat.random(in: 0..<size.height)
                    let opacity = Double.random(in: 0.03...0.08)
                    ctx.fill(
                        Path(CGRect(x: x, y: y, width: 1, height: 1)),
                        with: .color(.white.opacity(opacity))
                    )
                }
            }

            RadialGradient(
                colors: [.clear, Color.emerald800.opacity(0.15)],
                center: UnitPoint(x: 0.5, y: 0.25),
                startRadius: 60,
                endRadius: 400
            )

            Circle()
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
                .frame(width: 280, height: 280)
                .offset(y: -UIScreen.main.bounds.height * 0.2)
                .rotationEffect(.degrees(ringRotation))

            Circle()
                .stroke(Color.white.opacity(0.04), lineWidth: 1)
                .frame(width: 200, height: 200)
                .offset(y: -UIScreen.main.bounds.height * 0.2)
                .rotationEffect(.degrees(-ringRotation * 0.7))
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.linear(duration: 60).repeatForever(autoreverses: false)) {
                ringRotation = 360
            }
        }
    }
}
