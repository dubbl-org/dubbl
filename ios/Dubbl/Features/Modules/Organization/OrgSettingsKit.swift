import QuickLook
import SwiftUI

// Shared pieces for the organization settings screens: who may change what,
// loose JSON requests, the shell-and-cards page, form rows, confirmations and
// file previews. Every settings page in this folder is built from these.

// MARK: - Access

/// The role a settings action needs. Mirrors the web's role hierarchy
/// (owner > admin > member); the server stays the authority, this only
/// decides whether a screen is editable or read-only.
enum OrgSettingsLevel: Int, Comparable {
    case member = 1, admin, owner

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }

    /// "Only admins can change this."
    var readOnlyMessage: String {
        switch self {
        case .member: "You can't change this."
        case .admin: "Only owners and admins can change this."
        case .owner: "Only the owner can change this."
        }
    }
}

@MainActor
enum OrgSettingsAccess {
    static func level(_ env: AppEnvironment) -> OrgSettingsLevel {
        switch env.session.currentOrg?.role {
        case .owner: .owner
        case .admin: .admin
        default: .member
        }
    }

    static func allows(_ needed: OrgSettingsLevel, _ env: AppEnvironment) -> Bool {
        level(env) >= needed
    }
}

// MARK: - Requests

/// Loose JSON in and out, for routes whose shapes are easier to read than to model.
@MainActor
enum OrgSettingsAPI {
    static func get(_ env: AppEnvironment, _ path: String, query: [String: String?] = [:]) async throws -> JSONValue {
        try await env.api.get(path, query: query)
    }

    /// POST, PATCH, PUT or DELETE with an optional JSON body. POSTs always
    /// carry a body because most routes call `request.json()`.
    @discardableResult
    static func send(
        _ env: AppEnvironment,
        _ method: APIClient.Method,
        _ path: String,
        query: [String: String?] = [:],
        body: [String: JSONValue]? = nil
    ) async throws -> JSONValue {
        let payload = body ?? (method == .post ? [:] : nil)
        let data = try payload.map { try JSONEncoder().encode(JSONValue.object($0)) }
        return try await env.api.request(method, path, query: query, bodyData: data)
    }

    /// Raw bytes (CSV, ZIP, JSON backups, PDFs) written to a temporary file to share or preview.
    static func download(_ env: AppEnvironment, _ path: String, query: [String: String?] = [:], fileName: String, demo: String) async throws -> URL {
        var data = try await env.api.download(path, query: query)
        #if DEBUG
        if DemoData.isEnabled, data.isEmpty { data = Data(demo.utf8) }
        #endif
        let folder = FileManager.default.temporaryDirectory.appending(path: "dubbl-settings", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: fileName)
        try data.write(to: url, options: .atomic)
        return url
    }
}

/// JSON body values: empty strings become null, like the web forms send.
enum OrgJSON {
    static func text(_ value: String) -> JSONValue {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? .null : .string(trimmed)
    }

    static func number(_ value: Int) -> JSONValue { .number(Double(value)) }
    static func strings(_ values: [String]) -> JSONValue { .array(values.map(JSONValue.string)) }
}

extension JSONValue {
    /// A non-empty string at a dotted path.
    func orgString(_ path: String) -> String? {
        switch self[path] {
        case let .string(text)? where !text.isEmpty: text
        case let .number(value)?: JSONValue.number(value).stringValue
        default: nil
        }
    }

    /// The string at a path, or "" for form fields.
    func orgText(_ path: String) -> String { orgString(path) ?? "" }

    func orgBool(_ path: String, default fallback: Bool = false) -> Bool { self[path]?.boolValue ?? fallback }

    func orgInt(_ path: String) -> Int? { self[path]?.intValue }

    func orgArray(_ path: String) -> [JSONValue] { self[path]?.arrayValue ?? [] }
}

// MARK: - Loading

/// One GET's state for a settings screen.
@MainActor @Observable
final class OrgSettingsResource {
    private(set) var value: JSONValue?
    private(set) var error: String?
    let path: String
    var query: [String: String?]

    init(_ path: String, query: [String: String?] = [:]) {
        self.path = path
        self.query = query
    }

    var isLoaded: Bool { value != nil }

    func load(_ env: AppEnvironment) async {
        do {
            let fresh = try await OrgSettingsAPI.get(env, path, query: query)
            withAnimation(.snappy) {
                value = fresh
                error = nil
            }
        } catch {
            if error is CancellationError { return }
            if value == nil { self.error = error.localizedDescription } else { env.toast.error(error) }
        }
    }

    /// Patches the loaded copy so a change shows before the next reload.
    func update(_ change: (inout JSONValue) -> Void) {
        guard var current = value else { return }
        change(&current)
        value = current
    }
}

/// Skeleton, error or content for a settings screen on the shell.
struct OrgSettingsPage<Content: View>: View {
    let loaded: Bool
    let error: String?
    let reload: () async -> Void
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            if loaded {
                VStack(alignment: .leading, spacing: 24) {
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 40)
            } else if let error {
                ErrorStateView(message: error) { await reload() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 7, avatar: false)
                    .padding(.top, 8)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(DTheme.shell)
        .refreshable { await reload() }
    }
}

// MARK: - Sections and rows

/// A label, a card of rows and an optional footnote.
struct OrgSettingsSection<Content: View>: View {
    let title: String?
    var footer: String?
    var inset: CGFloat = 16
    var action: (title: String, run: () -> Void)?
    @ViewBuilder var content: Content

    init(_ title: String?, footer: String? = nil, inset: CGFloat = 16, action: (title: String, run: () -> Void)? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.footer = footer
        self.inset = inset
        self.action = action
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { SectionLabel(title, action: action) }
            CardStack(dividerInset: inset) { content }
            if let footer {
                Text(footer)
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                    .padding(.horizontal, 4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Icon, title, a second line, a value and a trailing glyph.
struct OrgSettingsRow<Trailing: View>: View {
    var symbol: String?
    var tone: Tone = .neutral
    /// Draws a person's or company's avatar instead of an icon.
    var avatar: String?
    let title: String
    var subtitle: String?
    var mono = false
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            if let avatar {
                Avatar(name: avatar, size: 36)
            } else if let symbol {
                IconTile(symbol: symbol, tone: tone, size: 30)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(mono ? .system(size: 15, weight: .medium, design: .monospaced) : .system(size: 16))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
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
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

extension OrgSettingsRow where Trailing == OrgSettingsChevron {
    init(symbol: String? = nil, tone: Tone = .neutral, avatar: String? = nil, title: String, subtitle: String? = nil, mono: Bool = false, value: String? = nil, chevron: Bool = true) {
        self.init(symbol: symbol, tone: tone, avatar: avatar, title: title, subtitle: subtitle, mono: mono) {
            OrgSettingsChevron(value: value, visible: chevron)
        }
    }
}

/// A grey value and a chevron at the end of a row.
struct OrgSettingsChevron: View {
    var value: String?
    var visible = true

    var body: some View {
        HStack(spacing: 8) {
            if let value {
                Text(value)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            if visible {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
    }
}

/// A labelled text field in a card; plain text when read-only.
struct OrgSettingsField: View {
    let label: String
    @Binding var text: String
    var prompt = ""
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType?
    var capitalization: TextInputAutocapitalization = .sentences
    var mono = false
    var secure = false
    var axis: Axis = .horizontal
    var disabled = false

    var body: some View {
        FieldRow(label: label) {
            Group {
                if secure {
                    SecureField(prompt, text: $text)
                } else {
                    TextField(prompt, text: $text, axis: axis)
                        .lineLimit(axis == .vertical ? 3 ... 10 : 1 ... 1)
                }
            }
            .keyboardType(keyboard)
            .textContentType(content)
            .textInputAutocapitalization(capitalization)
            .autocorrectionDisabled(keyboard != .default || mono)
            .font(mono ? .system(size: 15, design: .monospaced) : .system(size: 16))
            .disabled(disabled)
            .foregroundStyle(disabled ? DTheme.inkSecondary : DTheme.ink)
        }
    }
}

/// A switch row with an optional explanation.
struct OrgSettingsToggle: View {
    let title: String
    var subtitle: String?
    @Binding var isOn: Bool
    var disabled = false

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 16))
                    .foregroundStyle(DTheme.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(DTheme.positive)
        .disabled(disabled)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
    }
}

/// A row that picks one value from a menu.
struct OrgSettingsPicker<Value: Hashable>: View {
    let label: String
    @Binding var selection: Value
    let options: [(value: Value, label: String)]
    var disabled = false

    private var current: String {
        options.first { $0.value == selection }?.label ?? "Choose"
    }

    var body: some View {
        Menu {
            Picker(label, selection: $selection) {
                ForEach(options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
        } label: {
            HStack(spacing: 12) {
                Text(label)
                    .font(.system(size: 16))
                    .foregroundStyle(DTheme.ink)
                Spacer(minLength: 8)
                Text(current)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
                if !disabled {
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .disabled(disabled)
    }
}

/// A calm banner: read-only notices, plan limits, hand-offs to the web.
struct OrgSettingsNotice: View {
    var symbol = "lock"
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tone == .neutral ? DTheme.inkSecondary : tone.color)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(tone.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// A full-width button row inside a card, e.g. "Send test" or "Remove".
struct OrgSettingsButtonRow: View {
    let title: String
    var symbol: String?
    var destructive = false
    var working = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if working {
                    ProgressView().controlSize(.small)
                } else if let symbol {
                    Image(systemName: symbol).font(.system(size: 15, weight: .medium))
                }
                Text(title).font(.system(size: 16, weight: .medium))
                Spacer()
            }
            .foregroundStyle(destructive ? DTheme.negative : DTheme.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .disabled(working)
    }
}

/// A used-of-max meter, for plan usage and member seats.
struct OrgSettingsMeter: View {
    let label: String
    let used: Int
    let max: Int?
    var format: (Int) -> String = { "\($0)" }

    private var fraction: Double {
        guard let max, max > 0 else { return 0 }
        return min(1, Double(used) / Double(max))
    }

    private var tone: Tone {
        guard max != nil else { return .neutral }
        return fraction >= 1 ? .negative : fraction >= 0.8 ? .warning : .positive
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.ink)
                Spacer()
                Text(max.map { "\(format(used)) of \(format($0))" } ?? "\(format(used)) · Unlimited")
                    .font(DFont.figure(14, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            if max != nil {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(DTheme.tint)
                        Capsule().fill(tone.color).frame(width: Swift.max(4, proxy.size.width * fraction))
                    }
                }
                .frame(height: 5)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }
}

// MARK: - Form sheets

/// A sheet with Cancel and Save in the bar, cards on the shell and an error line.
struct OrgSettingsFormSheet<Content: View>: View {
    let title: String
    var saveTitle = "Save"
    var canSave = true
    var readOnly = false
    let save: () async throws -> Void
    @ViewBuilder var content: Content

    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    content
                    if let error {
                        Text(error)
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(readOnly ? "Done" : "Cancel", role: .cancel) { dismiss() }
                }
                if !readOnly {
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            Task { await run() }
                        } label: {
                            if saving { ProgressView() } else { Text(saveTitle) }
                        }
                        .disabled(!canSave || saving)
                    }
                }
            }
        }
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func run() async {
        saving = true
        defer { saving = false }
        do {
            try await save()
            dismiss()
        } catch {
            withAnimation(.snappy) { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Confirmations

/// A destructive or weighty step waiting for a yes.
struct OrgSettingsConfirmation: Identifiable {
    let title: String
    var message: String?
    let action: String
    var destructive = true
    let run: () async -> Void

    var id: String { title + action }
}

extension View {
    /// Asks before running `pending`, then clears it.
    func orgSettingsConfirm(_ pending: Binding<OrgSettingsConfirmation?>) -> some View {
        confirmationDialog(
            pending.wrappedValue?.title ?? "",
            isPresented: Binding(get: { pending.wrappedValue != nil }, set: { if !$0 { pending.wrappedValue = nil } }),
            titleVisibility: .visible,
            presenting: pending.wrappedValue
        ) { confirmation in
            Button(confirmation.action, role: confirmation.destructive ? .destructive : nil) {
                Task { await confirmation.run() }
            }
            Button("Cancel", role: .cancel) {}
        } message: { confirmation in
            if let message = confirmation.message { Text(message) }
        }
    }
}

@MainActor
enum OrgSettingsRun {
    /// Runs a change, toasts the outcome and reports success.
    @discardableResult
    static func run(_ env: AppEnvironment, _ success: String?, _ work: () async throws -> Void) async -> Bool {
        do {
            try await work()
            if let success { env.toast.show(success) }
            return true
        } catch {
            env.toast.error(error)
            return false
        }
    }
}

// MARK: - Files

/// A downloaded file to preview and share.
struct OrgSettingsFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Quick Look over a downloaded file, with the system share button.
struct OrgSettingsFilePreview: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIViewController(context: Context) -> UINavigationController {
        let preview = QLPreviewController()
        preview.dataSource = context.coordinator
        return UINavigationController(rootViewController: preview)
    }

    func updateUIViewController(_ controller: UINavigationController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> any QLPreviewItem { url as NSURL }
    }
}

extension View {
    func orgSettingsPreview(_ file: Binding<OrgSettingsFile?>) -> some View {
        sheet(item: file) { file in
            OrgSettingsFilePreview(url: file.url).ignoresSafeArea()
        }
    }
}

// MARK: - Formatting

enum OrgSettingsFormat {
    /// "1.2 MB"
    static func bytes(_ value: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(value), countStyle: .memory)
    }

    /// Basis points as a percent with up to two decimals: 250 -> "2.5".
    static func percentText(_ basisPoints: Int) -> String {
        let value = Double(basisPoints) / 100
        return value.rounded() == value ? "\(Int(value))" : String(format: "%g", value)
    }

    /// "2.5" -> 250
    static func basisPoints(_ text: String) -> Int? {
        Double(text.replacingOccurrences(of: ",", with: ".")).map { Int(($0 * 100).rounded()) }
    }

    /// A moment as "12 Oct, 14:05" (with the year when it isn't this year).
    static func moment(_ value: String?) -> String {
        guard let date = DubblDate.parseMoment(value) ?? DubblDate.parseDay(value) else { return "" }
        let sameYear = Calendar.current.isDate(date, equalTo: .now, toGranularity: .year)
        return sameYear
            ? date.formatted(.dateTime.day().month(.abbreviated).hour().minute())
            : date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    /// The web's tag and accent colours are stored as "#rrggbb".
    static func color(_ hex: String?) -> Color {
        guard let hex, hex.hasPrefix("#"), hex.count == 7, let value = UInt32(hex.dropFirst(), radix: 16) else { return DTheme.inkTertiary }
        return Color(hex: value)
    }
}

// MARK: - Choosing from a long list

/// One choice in a searchable list.
struct OrgSettingsChoice: Identifiable, Hashable {
    let value: String
    let label: String
    var detail: String?
    var id: String { value }
}

/// A searchable list for long choices: countries, currencies, accounts, people.
struct OrgSettingsChoiceSheet: View {
    let title: String
    let choices: [OrgSettingsChoice]
    let selected: String?
    /// Adds a "None" row that clears the choice.
    var allowsNone = false
    let pick: (String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    private var visible: [OrgSettingsChoice] {
        let term = search.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return choices }
        return choices.filter { $0.label.localizedCaseInsensitiveContains(term) || $0.value.localizedCaseInsensitiveContains(term) || ($0.detail?.localizedCaseInsensitiveContains(term) ?? false) }
    }

    var body: some View {
        NavigationStack {
            List {
                if allowsNone, search.isEmpty {
                    row(label: "None", detail: nil, isSelected: selected == nil) { choose(nil) }
                }
                ForEach(visible) { choice in
                    row(label: choice.label, detail: choice.detail, isSelected: choice.value == selected) { choose(choice.value) }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(DTheme.canvas)
            .overlay {
                if visible.isEmpty, !allowsNone || !search.isEmpty {
                    EmptyStateView(symbol: "magnifyingglass", title: "No matches")
                }
            }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func choose(_ value: String?) {
        pick(value)
        dismiss()
    }

    private func row(label: String, detail: String?, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(size: 16))
                        .foregroundStyle(DTheme.ink)
                    if let detail {
                        Text(detail)
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                }
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .ledgerRow()
    }
}

/// A row that opens a choice sheet.
struct OrgSettingsChoiceRow: View {
    let label: String
    let title: String
    let choices: [OrgSettingsChoice]
    @Binding var selection: String?
    var allowsNone = false
    var disabled = false
    @State private var choosing = false

    private var current: String {
        guard let selection else { return allowsNone ? "None" : "Choose" }
        return choices.first { $0.value == selection }?.label ?? "Set"
    }

    var body: some View {
        Button { choosing = true } label: {
            HStack(spacing: 12) {
                Text(label)
                    .font(.system(size: 16))
                    .foregroundStyle(DTheme.ink)
                Spacer(minLength: 8)
                Text(current)
                    .font(.system(size: 15))
                    .foregroundStyle(selection == nil ? DTheme.inkTertiary : DTheme.inkSecondary)
                    .lineLimit(1)
                if !disabled {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .disabled(disabled)
        .sheet(isPresented: $choosing) {
            OrgSettingsChoiceSheet(title: title, choices: choices, selected: selection, allowsNone: allowsNone) { selection = $0 }
        }
    }
}

/// Choices built from the device's region and currency lists, in English like the web.
enum OrgSettingsLocale {
    private static let english = Locale(identifier: "en_US")

    static let countries: [OrgSettingsChoice] = Locale.Region.isoRegions
        .map(\.identifier)
        .filter { $0.count == 2 && $0.allSatisfy(\.isLetter) }
        .compactMap { code in english.localizedString(forRegionCode: code).map { OrgSettingsChoice(value: code, label: $0, detail: code) } }
        .sorted { $0.label < $1.label }

    static let currencies: [OrgSettingsChoice] = Locale.commonISOCurrencyCodes
        .map { OrgSettingsChoice(value: $0, label: english.localizedString(forCurrencyCode: $0) ?? $0, detail: $0) }
        .sorted { $0.label < $1.label }

    static func countryName(_ code: String?) -> String? {
        code.flatMap { english.localizedString(forRegionCode: $0) }
    }

    static let months: [(value: Int, label: String)] = Calendar(identifier: .gregorian).monthSymbols.enumerated().map { ($0.offset + 1, $0.element) }
}

// MARK: - Demo

#if DEBUG
/// Screenshots of sheets and pushed screens: launch demo mode with
/// `DUBBL_DEMO_ORG=member` (role, rule, workflow, reminder, template, key,
/// webhook, stripe, entry, plan) and the matching screen opens it once loaded.
@MainActor
enum OrgSettingsDemo {
    private static var used: Set<String> = []

    static func open(_ key: String, _ action: () -> Void) {
        guard DemoData.isEnabled, ProcessInfo.processInfo.environment["DUBBL_DEMO_ORG"] == key, !used.contains(key) else { return }
        used.insert(key)
        action()
    }
}
#endif
