import SwiftUI

// Shared payroll helpers: words for enums, run titles, a stat tile, the
// action buttons that sit under a detail and the PUT the API client lacks.

enum PayrollFormat {
    static func frequency(_ value: String?) -> String {
        switch value {
        case "weekly": "Weekly"
        case "biweekly": "Every two weeks"
        case "monthly": "Monthly"
        default: (value ?? "").humanized
        }
    }

    /// Pay periods per year, to turn an annual salary into one pay.
    static func periods(_ frequency: String?) -> Int {
        switch frequency {
        case "weekly": 52
        case "biweekly": 26
        default: 12
        }
    }

    /// "1 – 31 Oct 2026" for a pay period.
    static func period(_ start: String?, _ end: String?) -> String {
        TaxDateRange(start: start ?? "", end: end ?? "", label: "").span
    }

    static func runType(_ value: String?) -> String {
        switch value {
        case "off_cycle": "Off-cycle"
        case "bonus_only": "Bonus only"
        case "termination": "Final pay"
        case "correction": "Correction"
        default: "Regular"
        }
    }

    static let runTones: [String: Tone] = [
        "draft": .neutral, "pending_approval": .warning, "processing": .info, "completed": .positive, "void": .negative,
    ]

    static func runStatus(_ value: String?) -> String {
        switch value {
        case "pending_approval": "Awaiting approval"
        case "completed": "Paid"
        default: RecordFormat.statusLabel(value ?? "draft")
        }
    }

    /// "37.5 h"
    static func hours(_ value: JSONValue?) -> String {
        let number: Double = {
            if case let .number(double) = value { return double }
            return Double(value?.stringValue ?? "") ?? 0
        }()
        return number.formatted(.number.precision(.fractionLength(0 ... 1))) + " h"
    }

    static func taxKind(_ value: String?) -> String {
        switch value {
        case "income_tax": "Income tax"
        case "941": "Payroll taxes (941)"
        case "940": "Unemployment (940)"
        case "benefits": "Pension and benefits"
        case let other?: other.replacingOccurrences(of: "_", with: " ").humanized
        case nil: "Payroll tax"
        }
    }

    static func formType(_ value: String?) -> String {
        switch value {
        case "1099_nec": "1099-NEC"
        case "1099_misc": "1099-MISC"
        case "w2": "W-2"
        default: (value ?? "").uppercased()
        }
    }

    /// "box1_wages" -> "Box 1 · Wages"
    static func formBox(_ key: String) -> String {
        let words = ["ss": "Social Security", "fica": "FICA", "nec": "NEC"]
        let parts = key.split(separator: "_").map(String.init)
        guard let first = parts.first else { return key }
        let rest = parts.dropFirst().map { words[$0] ?? $0 }.joined(separator: " ").humanized
        if first.hasPrefix("box") {
            return "Box \(first.dropFirst(3))\(rest.isEmpty ? "" : " · \(rest)")"
        }
        return parts.joined(separator: " ").humanized
    }
}

/// A figure with a label, for KPI grids.
struct PayrollStat: View {
    let label: String
    let value: String
    var detail: String?
    var symbol: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Text(value)
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
            if let detail {
                Text(detail)
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkTertiary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dubblCard(padding: 14, radius: 18)
        .accessibilityElement(children: .combine)
    }
}

/// One button in a detail's bottom tray.
struct PayrollTrayAction: Identifiable {
    let title: String
    let symbol: String
    var destructive = false
    var confirm: String?
    let run: () async -> Void

    var id: String { title }
}

/// The glass tray of primary actions under a detail; the last one is filled.
struct PayrollActionTray: View {
    let actions: [PayrollTrayAction]
    @State private var working: String?
    @State private var confirming: PayrollTrayAction?

    var body: some View {
        if !actions.isEmpty {
            HStack(spacing: 10) {
                ForEach(actions) { action in
                    let filled = actions.last?.id == action.id
                    Button {
                        if action.confirm != nil { confirming = action } else { perform(action) }
                    } label: {
                        HStack(spacing: 8) {
                            if working == action.id {
                                ProgressView().controlSize(.small).tint(filled ? DTheme.canvas : DTheme.ink)
                            } else {
                                Image(systemName: action.symbol)
                            }
                            Text(action.title).lineLimit(1)
                        }
                    }
                    .buttonStyle(PayrollTrayButtonStyle(filled: filled, destructive: action.destructive))
                    .disabled(working != nil)
                }
            }
            .padding(10)
            .glassEffect(.regular, in: .rect(cornerRadius: 32))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .confirmationDialog(confirming?.confirm ?? "", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }), titleVisibility: .visible) {
                if let action = confirming {
                    Button(action.title, role: action.destructive ? .destructive : nil) { perform(action) }
                    Button("Cancel", role: .cancel) {}
                }
            }
        }
    }

    private func perform(_ action: PayrollTrayAction) {
        working = action.id
        Task {
            await action.run()
            working = nil
        }
    }
}

private struct PayrollTrayButtonStyle: ButtonStyle {
    let filled: Bool
    let destructive: Bool

    func makeBody(configuration: Configuration) -> some View {
        if filled, !destructive {
            InkButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        } else {
            SoftButtonStyle(size: .large, fullWidth: true, tone: destructive ? .negative : .neutral).makeBody(configuration: configuration)
        }
    }
}

extension APIClient {
    /// PUT with a JSON body; the shared client only wraps GET, POST, PATCH and DELETE.
    func payrollPut<B: Encodable & Sendable>(_ path: String, body: B) async throws -> JSONValue {
        try await request(.put, path, bodyData: try Self.encoder.encode(body))
    }
}

/// Runs a call, shows a toast and tells lists to reload.
@MainActor
enum PayrollCall {
    static func run(_ env: AppEnvironment, done message: String, spec: String?, _ call: () async throws -> Void) async -> Bool {
        do {
            try await call()
            env.toast.show(message)
            if let spec { NotificationCenter.default.post(name: .recordsChanged, object: spec) }
            return true
        } catch {
            env.toast.error(error)
            return false
        }
    }
}
