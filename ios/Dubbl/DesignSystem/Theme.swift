import SwiftUI
import UIKit

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// A color that follows light and dark mode.
    static func dynamic(light: UInt32, dark: UInt32, lightAlpha: CGFloat = 1, darkAlpha: CGFloat = 1) -> Color {
        Color(UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let hex = isDark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: isDark ? darkAlpha : lightAlpha
            )
        })
    }
}

/// dubbl's palette: the web's ink-on-white with its warm grey shell, a soft
/// charcoal (never pure black) in dark mode, and colour kept for data, live
/// state and status. Selected states are a grey tint, never a white chip.
/// Never use raw `.white`/`.black`.
enum DTheme {
    // Surfaces
    /// The page behind cards (the web's `--shell`).
    static let shell = Color.dynamic(light: 0xF5F5F3, dark: 0x131315)
    /// Plain list/detail backgrounds and the sheet Home slides over its painting.
    static let canvas = Color.dynamic(light: 0xFFFFFF, dark: 0x131315)
    /// Cards sitting on the shell, raised a visible step in dark mode.
    static let card = Color.dynamic(light: 0xFFFFFF, dark: 0x202024)
    /// A soft filled panel on the canvas (chips, starter cards).
    static let surface = Color.dynamic(light: 0xF6F6F5, dark: 0x1C1C1F)
    /// Inputs and wells on a card.
    static let field = Color.dynamic(light: 0xF2F2F0, dark: 0x29292D)

    // Ink
    static let ink = Color.dynamic(light: 0x111113, dark: 0xF7F7F8)
    static let inkInverse = Color.dynamic(light: 0xFFFFFF, dark: 0x131315)
    static let inkSecondary = Color.dynamic(light: 0x6E6E76, dark: 0xA8A8B0)
    static let inkTertiary = Color.dynamic(light: 0xA3A3AB, dark: 0x7C7C85)

    // Lines and tints
    static let hairline = Color.dynamic(light: 0xECECEA, dark: 0x2A2A2E)
    static let hairlineSoft = Color.dynamic(light: 0xF0F0EE, dark: 0x232327)
    static let tint = Color.dynamic(light: 0x111113, dark: 0xFFFFFF, lightAlpha: 0.045, darkAlpha: 0.07)
    static let tintStrong = Color.dynamic(light: 0x111113, dark: 0xFFFFFF, lightAlpha: 0.08, darkAlpha: 0.12)

    /// Body for floating glass chrome: in dark mode, content scrolling under it stays quiet.
    static let glassTint = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0.13, green: 0.13, blue: 0.14, alpha: 0.85)
        : UIColor.clear })

    /// Secondary text on the painted backdrop: solid, so the paint doesn't show through.
    static let onPaintSecondary = Color.dynamic(light: 0x4A4440, dark: 0xD8D4D0)

    // Accents
    static let accent = Color.dynamic(light: 0x0A8DE6, dark: 0x3DB8FF)
    static let accentSoft = Color.dynamic(light: 0xE6F4FE, dark: 0x112B3F)
    static let special = Color.dynamic(light: 0x7A5AF8, dark: 0xA48AFB)
    static let orange = Color.dynamic(light: 0xF2700C, dark: 0xFF9142)

    // Status
    static let positive = Color.dynamic(light: 0x12A150, dark: 0x32D583)
    static let warning = Color.dynamic(light: 0xE88A00, dark: 0xFFB020)
    static let negative = Color.dynamic(light: 0xEB3B4E, dark: 0xFF6170)
    static let info = accent

    // Charts: revenue in sky, expenses in orange.
    static let chartPrimary = accent
    static let chartSecondary = orange

    /// Tilly, the assistant: warm apricot like the web's `--color-tilly-*`.
    static let tilly = Color.dynamic(light: 0xE8653C, dark: 0xFF9A6E)

    /// A stable colour per name for avatars.
    static func avatarColor(for seed: String) -> Color {
        let palette: [UInt32] = [0x0A8DE6, 0x7A5AF8, 0x12A150, 0xE88A00, 0xEC4899, 0x5B6CF9, 0xF2700C, 0x0FB5A6]
        var hash: UInt32 = 5381
        for byte in seed.utf8 { hash = (hash &* 33) &+ UInt32(byte) }
        return Color(hex: palette[Int(hash % UInt32(palette.count))])
    }
}

/// Semantic tones for pills, icon tiles and notices.
enum Tone: Sendable {
    case neutral, positive, warning, negative, info, special, orange

    var color: Color {
        switch self {
        case .neutral: DTheme.inkSecondary
        case .positive: DTheme.positive
        case .warning: DTheme.warning
        case .negative: DTheme.negative
        case .info: DTheme.info
        case .special: DTheme.special
        case .orange: DTheme.orange
        }
    }

    var background: Color {
        self == .neutral ? DTheme.tint : color.opacity(0.11)
    }
}

enum DFont {
    /// Large display numbers and titles: tight tracking like the web's headings.
    static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight)
    }

    static func tracking(for size: CGFloat) -> CGFloat {
        size >= 20 ? -size * 0.03 : -size * 0.008
    }

    /// Figures line up in columns.
    static func figure(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight).monospacedDigit()
    }
}

extension View {
    func displayFont(_ size: CGFloat, weight: Font.Weight = .semibold) -> some View {
        font(DFont.display(size, weight: weight)).tracking(DFont.tracking(for: size))
    }
}

/// The user's light/dark choice. Fresh installs start light.
enum AppearancePreference: String, CaseIterable, Identifiable {
    case system, light, dark

    static let storageKey = "appearance"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "Automatic"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
