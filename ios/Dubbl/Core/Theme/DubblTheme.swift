import SwiftUI

// MARK: - Emerald Color Palette

extension Color {
    static let emerald50  = Color(hex: "ecfdf5")
    static let emerald100 = Color(hex: "d1fae5")
    static let emerald200 = Color(hex: "a7f3d0")
    static let emerald300 = Color(hex: "6ee7b7")
    static let emerald400 = Color(hex: "34d399")
    static let emerald500 = Color(hex: "10b981")
    static let emerald600 = Color(hex: "059669")
    static let emerald700 = Color(hex: "047857")
    static let emerald800 = Color(hex: "065f46")
    static let emerald900 = Color(hex: "064e3b")
    static let emerald950 = Color(hex: "022c22")

    static let dubblPrimary = emerald500
    static let dubblPrimaryDark = emerald700
    static let dubblPrimaryLight = emerald100
    static let dubblBackground = Color(hex: "f7f7f5")
    static let dubblCardBackground = Color.white
    static let dubblBorder = Color(hex: "e5e5e5")
    static let dubblMuted = Color(hex: "737373")
    static let dubblDestructive = Color(hex: "ef4444")
    static let dubblWarning = Color(hex: "f59e0b")
    static let dubblInfo = Color(hex: "3b82f6")

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = ((int >> 24) & 0xFF, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Theme Environment

struct DubblTheme {
    let primaryColor: Color = .dubblPrimary
    let backgroundColor: Color = .dubblBackground
    let cardBackground: Color = .dubblCardBackground
    let borderColor: Color = .dubblBorder
    let mutedColor: Color = .dubblMuted
    let destructiveColor: Color = .dubblDestructive
    let cornerRadius: CGFloat = 10
    let smallCornerRadius: CGFloat = 6
    let spacing: CGFloat = 16
    let smallSpacing: CGFloat = 8
}

private struct DubblThemeKey: EnvironmentKey {
    static let defaultValue = DubblTheme()
}

extension EnvironmentValues {
    var dubblTheme: DubblTheme {
        get { self[DubblThemeKey.self] }
        set { self[DubblThemeKey.self] = newValue }
    }
}

// MARK: - Themed Button Style

struct DubblButtonStyle: ButtonStyle {
    var isPrimary: Bool = true
    var isDestructive: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(isPrimary ? .white : (isDestructive ? .dubblDestructive : .dubblPrimary))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                isPrimary
                    ? (isDestructive ? Color.dubblDestructive : Color.dubblPrimary)
                    : Color.clear
            )
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(
                        isPrimary ? Color.clear : (isDestructive ? Color.dubblDestructive : Color.dubblPrimary),
                        lineWidth: 1.5
                    )
            )
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Themed Card Modifier

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color.dubblCardBackground)
            .cornerRadius(10)
            .shadow(color: Color.black.opacity(0.04), radius: 4, x: 0, y: 2)
    }
}

extension View {
    func dubblCard() -> some View {
        modifier(CardModifier())
    }
}

// MARK: - Themed Text Field Style

struct DubblTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(14)
            #if os(iOS)
            .background(Color(uiColor: .systemGray6))
            #else
            .background(Color.gray.opacity(0.1))
            #endif
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.dubblBorder, lineWidth: 1)
            )
    }
}

// MARK: - Liquid Glass Support (iOS 26+)

struct LiquidGlassModifier: ViewModifier {
    func body(content: Content) -> some View {
        #if swift(>=6.1)
        if #available(iOS 26, *) {
            content.glassEffect(.regular.interactive, in: .rect(cornerRadius: 20))
        } else {
            content
        }
        #else
        content
        #endif
    }
}

struct LiquidGlassBarModifier: ViewModifier {
    func body(content: Content) -> some View {
        #if swift(>=6.1)
        if #available(iOS 26, *) {
            content.toolbarBackgroundVisibility(.hidden, for: .tabBar)
        } else {
            content
        }
        #else
        content
        #endif
    }
}

extension View {
    func dubblGlass() -> some View {
        modifier(LiquidGlassModifier())
    }

    func dubblGlassBar() -> some View {
        modifier(LiquidGlassBarModifier())
    }
}
