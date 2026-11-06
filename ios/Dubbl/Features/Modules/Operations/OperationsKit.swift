import SwiftUI

// Small pieces the operations screens share: a loader for loose JSON, a form
// sheet scaffold, picker and stepper rows, and number formatting.

/// Loads one JSON response and keeps the last good copy while refreshing.
@MainActor @Observable
final class OperationsLoader {
    private(set) var value: JSONValue?
    private(set) var error: String?

    var isLoaded: Bool { value != nil }

    func load(_ api: APIClient, _ path: String, query: [String: String?] = [:]) async {
        do {
            let response: JSONValue = try await api.get(path, query: query)
            withAnimation(.snappy) {
                value = response
                error = nil
            }
        } catch {
            guard !(error is CancellationError) else { return }
            if value == nil { self.error = error.localizedDescription }
        }
    }

    /// Replaces the loaded value, for optimistic edits.
    func set(_ newValue: JSONValue?) { value = newValue }
}

enum OperationsFormat {
    /// "12", "12.5": whole numbers stay whole.
    static func number(_ value: Double) -> String {
        if value.rounded() == value { return Int(value).formatted() }
        return value.formatted(.number.precision(.fractionLength(0 ... 2)))
    }

    /// Quantities may arrive as numbers or decimal strings.
    static func double(_ value: JSONValue?) -> Double? {
        switch value {
        case let .number(number): number
        case let .string(string): Double(string)
        default: nil
        }
    }

    /// "1h 30m" from minutes.
    static func minutes(_ minutes: Int) -> String {
        let hours = minutes / 60, rest = minutes % 60
        if hours == 0 { return "\(rest)m" }
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }

    /// "42%"
    static func percent(_ part: Double, of whole: Double) -> String {
        guard whole > 0 else { return "–" }
        return "\(Int((part / whole * 100).rounded()))%"
    }

    static func trimmed(_ text: String) -> String? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    static var isDemo: Bool {
        #if DEBUG
        DemoData.isEnabled
        #else
        false
        #endif
    }
}

/// A sheet with a scrolling form on the shell, Cancel and a confirm button.
struct OperationsFormSheet<Content: View>: View {
    let title: String
    var confirm = "Save"
    var canSave = true
    var saving = false
    var error: String?
    let onSave: () async -> Void
    @ViewBuilder var content: Content

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    content
                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                            .transition(.opacity)
                    }
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await onSave() }
                    } label: {
                        if saving { ProgressView() } else { Text(confirm) }
                    }
                    .disabled(!canSave || saving)
                }
            }
        }
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }
}

/// "Label ......... [menu]" inside a form card.
struct OperationsPickerRow<Value: Hashable>: View {
    let label: String
    @Binding var selection: Value
    let options: [(value: Value, label: String)]

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(DTheme.ink)
            Spacer()
            Picker(label, selection: $selection) {
                ForEach(options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .labelsHidden()
            .tint(DTheme.inkSecondary)
        }
        .padding(.leading, 16)
        .padding(.trailing, 6)
        .frame(minHeight: 50)
    }
}

/// A date row inside a form card.
struct OperationsDateRow: View {
    let label: String
    @Binding var date: Date

    var body: some View {
        DatePicker(selection: $date, displayedComponents: .date) {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(DTheme.ink)
        }
        .tint(DTheme.ink)
        .padding(.horizontal, 16)
        .frame(minHeight: 50)
    }
}

/// A segmented choice where the selection is a grey tint, never a white chip.
struct OperationsSegment<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String)]
    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.value) { option in
                let selected = selection == option.value
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) { selection = option.value }
                } label: {
                    Text(option.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background {
                            if selected {
                                Capsule().fill(DTheme.tintStrong).matchedGeometryEffect(id: "segment", in: namespace)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(4)
        .background(DTheme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A thin progress bar: ink on a grey track, red when over.
struct OperationsBar: View {
    let fraction: Double
    var tone: Tone = .neutral
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DTheme.tint)
                Capsule()
                    .fill(fraction > 1 ? DTheme.negative : (tone == .neutral ? DTheme.ink : tone.color))
                    .frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// A plain loading/error/content switch for custom screens.
struct OperationsLoadState<Content: View>: View {
    let loader: OperationsLoader
    let retry: () async -> Void
    @ViewBuilder var content: (JSONValue) -> Content

    var body: some View {
        if let value = loader.value {
            content(value)
        } else if let error = loader.error {
            ErrorStateView(message: error, retry: retry)
                .frame(maxHeight: .infinity)
        } else {
            ScrollView { SkeletonRows(rows: 8) }
        }
    }
}

/// A plain row inside a card: title, a quiet line under it, a trailing view.
struct OperationsCardRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

extension OperationsCardRow where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
        trailing = EmptyView()
    }
}

/// Money in a row, figures aligned.
struct OperationsMoney: View {
    let minor: Int
    let currency: String
    var size: CGFloat = 15
    var tone: Color = DTheme.ink

    var body: some View {
        Text(Money.format(minor, currency: currency))
            .font(.system(size: size, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(tone)
            .fixedSize()
    }
}

extension JSONValue {
    /// A copy of this object with one key replaced, for optimistic edits.
    func opsSetting(_ key: String, _ value: JSONValue) -> JSONValue {
        guard case var .object(object) = self else { return self }
        object[key] = value
        return .object(object)
    }

    /// The array under `key`, or an empty one.
    func opsArray(_ key: String) -> [JSONValue] {
        self[key]?.arrayValue ?? []
    }
}
