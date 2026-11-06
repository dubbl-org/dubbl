import SwiftUI

/// Sign-in: coded product cards floating on one of the website's paintings,
/// fading into the page, then one button that opens
/// the server's own sign-in in a secure browser sheet (email and password,
/// 2FA, Google, Apple), returning with a PKCE-bound code.
struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showServer = false
    @State private var error: String?
    @State private var errorPulse = 0
    @State private var serverHost = AppConfig.serverHost

    var body: some View {
        ZStack {
            DTheme.canvas.ignoresSafeArea()

            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    topBar
                    Spacer(minLength: 12)
                    HeroCards()
                        .padding(.horizontal, 28)
                    Spacer(minLength: 28)
                }
                .background {
                    Painting(name: "MoonGrass")
                        .overlay {
                            LinearGradient(
                                stops: [
                                    .init(color: DTheme.canvas.opacity(0), location: 0.55),
                                    .init(color: DTheme.canvas, location: 1),
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        }
                        .ignoresSafeArea(edges: .top)
                }
                copy
                    .padding(.horizontal, 28)
                    .padding(.bottom, 28)
                actions
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
        }
        .sheet(isPresented: $showServer, onDismiss: { serverHost = AppConfig.serverHost }) {
            ServerSheet()
        }
        .sensoryFeedback(.error, trigger: errorPulse)
    }

    private var topBar: some View {
        HStack {
            DubblLogo(height: 22)
            Spacer()
            GlassCircleButton(symbol: "server.rack", label: "Server") { showServer = true }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private var copy: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your books,\nwherever you are.")
                .displayFont(34)
                .foregroundStyle(DTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Invoices, bills, expenses and cash, kept in step with dubbl on the web.")
                .font(.system(size: 16))
                .foregroundStyle(DTheme.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actions: some View {
        VStack(spacing: 10) {
            if env.session.wasSignedOutBySession {
                notice("You were signed out because your session ended.", tone: .warning)
            }
            if let error {
                notice(error, tone: .negative)
            }

            Button {
                Task { await signIn(createAccount: false) }
            } label: {
                if env.session.isSigningIn { ProgressView().tint(DTheme.inkInverse) } else { Text("Continue") }
            }
            .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            .disabled(env.session.isSigningIn)

            Button("Create an account") {
                Task { await signIn(createAccount: true) }
            }
            .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
            .disabled(env.session.isSigningIn)

            Button {
                showServer = true
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "lock.fill").font(.system(size: 10))
                    Text("Signs in securely through \(serverHost)")
                }
                .font(.system(size: 12.5))
                .foregroundStyle(DTheme.inkTertiary)
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
    }

    private func notice(_ text: String, tone: Tone) -> some View {
        HStack(spacing: 8) {
            Image(systemName: tone == .negative ? "exclamationmark.circle" : "info.circle")
            Text(text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .font(.system(size: 14))
        .foregroundStyle(tone.color)
        .padding(12)
        .background(tone.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func signIn(createAccount: Bool) async {
        withAnimation { error = nil }
        do {
            try await env.session.signIn(createAccount: createAccount)
        } catch WebSignIn.Failure.cancelled {
            // Closing the sheet isn't an error.
        } catch {
            withAnimation { self.error = error.localizedDescription }
            errorPulse += 1
        }
    }
}

// MARK: - Hero

/// Three small coded cards, a 1:1 echo of the dashboard, drifting gently.
private struct HeroCards: View {
    @State private var float = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            invoiceCard
                .rotationEffect(.degrees(-4))
                .offset(x: -54, y: float ? -86 : -78)
            cashCard
                .offset(x: 26, y: float ? 6 : 14)
            paidCard
                .rotationEffect(.degrees(3))
                .offset(x: -30, y: float ? 104 : 96)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) { float = true }
        }
        .accessibilityHidden(true)
    }

    private var cashCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Cash").font(.system(size: 12.5, weight: .medium)).foregroundStyle(DTheme.inkSecondary)
            Text("$48,210.00").font(DFont.figure(24, weight: .semibold)).foregroundStyle(DTheme.ink)
            Sparkline(values: [12, 14, 13, 17, 16, 20, 19, 24, 23, 27])
                .stroke(DTheme.chartPrimary, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                .frame(height: 34)
        }
        .frame(width: 200)
        .dubblCard(padding: 16, radius: 18)
        .shadow(color: .black.opacity(0.05), radius: 18, y: 8)
    }

    private var invoiceCard: some View {
        HStack(spacing: 10) {
            IconTile(symbol: "doc.text", size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text("INV-0042").font(.system(size: 13.5, weight: .medium)).foregroundStyle(DTheme.ink)
                Text("Northwind Co.").font(.system(size: 12)).foregroundStyle(DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            StatusPill(text: "Sent", tone: .info)
        }
        .frame(width: 210)
        .dubblCard(padding: 12, radius: 16)
        .shadow(color: .black.opacity(0.04), radius: 14, y: 6)
    }

    private var paidCard: some View {
        HStack(spacing: 10) {
            IconTile(symbol: "checkmark", tone: .positive, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text("Payment received").font(.system(size: 13.5, weight: .medium)).foregroundStyle(DTheme.ink)
                Text("$2,400.00").font(DFont.figure(12)).foregroundStyle(DTheme.inkSecondary)
            }
        }
        .frame(width: 190, alignment: .leading)
        .dubblCard(padding: 12, radius: 16)
        .shadow(color: .black.opacity(0.04), radius: 14, y: 6)
    }
}

/// A tiny line through evenly spaced values.
struct Sparkline: Shape {
    let values: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard values.count > 1, let low = values.min(), let high = values.max() else { return path }
        let span = max(high - low, 0.0001)
        for (index, value) in values.enumerated() {
            let x = rect.minX + rect.width * CGFloat(index) / CGFloat(values.count - 1)
            let y = rect.maxY - rect.height * CGFloat((value - low) / span)
            if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
        }
        return path
    }
}
