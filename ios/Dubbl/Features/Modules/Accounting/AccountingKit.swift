import SwiftUI

// Shared pieces for the accounting screens: decimal amounts, a one-response
// loader, account picking, the debit/credit lines editor and the read-only
// journal card.

/// Minor units from the decimal strings some accounting routes send ("1234.50").
enum AccountingAmount {
    static func minor(_ value: JSONValue?) -> Int {
        switch value {
        case let .string(text)?:
            guard let decimal = Decimal(string: text) else { return 0 }
            var scaled = decimal * 100
            var rounded = Decimal()
            NSDecimalRound(&rounded, &scaled, 0, .plain)
            return NSDecimalNumber(decimal: rounded).intValue
        case let .number(number)?:
            return Int((number * 100).rounded())
        default:
            return 0
        }
    }

    /// Cents as the decimal number routes that take major units expect.
    static func major(_ minor: Int) -> Double {
        Double(minor) / 100
    }
}

/// The five account types in ledger order.
enum AccountingAccountType {
    static let order = ["asset", "liability", "equity", "revenue", "expense"]

    static func title(_ type: String) -> String {
        ["asset": "Assets", "liability": "Liabilities", "equity": "Equity", "revenue": "Revenue", "expense": "Expenses"][type] ?? type.humanized
    }

    static func singular(_ type: String) -> String {
        ["asset": "Asset", "liability": "Liability", "equity": "Equity", "revenue": "Revenue", "expense": "Expense"][type] ?? type.humanized
    }

    static func tone(_ type: String) -> Tone {
        switch type {
        case "asset": .info
        case "liability": .orange
        case "equity": .special
        case "revenue": .positive
        case "expense": .negative
        default: .neutral
        }
    }
}

/// "straight_line" -> "Straight line", for enum values the routes send raw.
enum AccountingWords {
    static func method(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return ["straight_line": "Straight line", "declining_balance": "Declining balance", "units_of_production": "Units of production", "sum_of_years_digits": "Sum of years' digits"][value] ?? value.humanized
    }

    static func convention(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return ["full_month": "Full month", "mid_month": "Mid month", "half_year": "Half year", "mid_quarter": "Mid quarter", "pro_rata_days": "Pro rata days", "full_at_purchase": "Full at purchase"][value] ?? value.humanized
    }

    static func frequency(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return ["semi_annual": "Every 6 months", "annual": "Yearly", "fortnightly": "Every 2 weeks"][value] ?? value.humanized
    }

    /// "60 months" -> "5 years".
    static func months(_ months: Int?) -> String? {
        guard let months, months > 0 else { return nil }
        if months % 12 == 0 { return months == 12 ? "1 year" : "\(months / 12) years" }
        return months == 1 ? "1 month" : "\(months) months"
    }
}

// MARK: - Loading

/// One GET response, kept while it reloads so screens don't flash.
@MainActor @Observable
final class AccountingRemote {
    private(set) var value: JSONValue?
    private(set) var error: String?

    func load(_ api: APIClient, _ path: String, query: [String: String?] = [:]) async {
        do {
            let response: JSONValue = try await api.get(path, query: query)
            withAnimation(.snappy) {
                value = response
                error = nil
            }
        } catch is CancellationError {
        } catch {
            if value == nil { self.error = error.localizedDescription }
        }
    }
}

/// Skeleton while loading, the error with a retry, then the content.
struct AccountingLoadState<Content: View>: View {
    let value: JSONValue?
    let error: String?
    let retry: () async -> Void
    @ViewBuilder let content: (JSONValue) -> Content

    var body: some View {
        if let value {
            content(value)
        } else if let error {
            ErrorStateView(message: error, retry: retry)
                .frame(maxHeight: .infinity)
        } else {
            ScrollView { SkeletonRows(rows: 8, avatar: false) }
                .scrollDisabled(true)
        }
    }
}

// MARK: - Posting

enum AccountingPost {
    /// Tells lists and screens that hold this record kind to reload.
    static func changed(_ key: String) {
        NotificationCenter.default.post(name: .recordsChanged, object: key)
    }
}

// MARK: - Accounts

/// A chart account chosen in a form.
struct AccountingAccountRef: Hashable, Sendable {
    let id: String
    let code: String
    let name: String
    let type: String

    var label: String { code.isEmpty ? name : "\(code) · \(name)" }

    init(id: String, code: String, name: String, type: String) {
        self.id = id
        self.code = code
        self.name = name
        self.type = type
    }

    init?(_ json: JSONValue) {
        guard let id = json.recordID, let name = json["name"]?.stringValue else { return nil }
        self.init(id: id, code: json["code"]?.stringValue ?? "", name: name, type: json["type"]?.stringValue ?? "")
    }
}

/// The chart of accounts as a searchable list grouped by type; picking one closes it.
struct AccountingAccountPicker: View {
    let title: String
    var types: Set<String>?
    @Binding var selection: AccountingAccountRef?

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var search = ""

    private var accounts: [AccountingAccountRef] {
        let all = (remote.value?["accounts"]?.arrayValue ?? [])
            .filter { $0["isActive"]?.boolValue != false }
            .compactMap(AccountingAccountRef.init)
        let term = search.trimmingCharacters(in: .whitespaces)
        return all.filter { account in
            (types == nil || types!.contains(account.type))
                && (term.isEmpty || account.name.localizedCaseInsensitiveContains(term) || account.code.hasPrefix(term))
        }
    }

    var body: some View {
        AccountingLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            List {
                ForEach(AccountingAccountType.order, id: \.self) { type in
                    let rows = accounts.filter { $0.type == type }
                    if !rows.isEmpty {
                        Section(AccountingAccountType.title(type)) {
                            ForEach(rows, id: \.id) { account in
                                Button {
                                    selection = account
                                    dismiss()
                                } label: {
                                    HStack(spacing: 12) {
                                        Text(account.code)
                                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                                            .foregroundStyle(DTheme.inkTertiary)
                                            .frame(minWidth: 44, alignment: .leading)
                                        Text(account.name)
                                            .font(.system(size: 15.5))
                                            .foregroundStyle(DTheme.ink)
                                        Spacer()
                                        if selection?.id == account.id {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 14, weight: .semibold))
                                                .foregroundStyle(DTheme.ink)
                                        }
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .listRowBackground(selection?.id == account.id ? DTheme.tint : DTheme.card)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .overlay {
                if accounts.isEmpty {
                    EmptyStateView(symbol: "list.number", title: "No accounts", message: search.isEmpty ? "Add accounts to your chart first." : "Nothing matches “\(search)”.")
                }
            }
        }
        .background(DTheme.shell)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name or code")
        .task { await load() }
    }

    private func load() async {
        await remote.load(env.api, "accounts")
    }
}

/// A form row that opens the account picker.
struct AccountingAccountField: View {
    let label: String
    var types: Set<String>?
    @Binding var account: AccountingAccountRef?

    var body: some View {
        NavigationLink {
            AccountingAccountPicker(title: label, types: types, selection: $account)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(label)
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                    Text(account?.label ?? "Choose an account")
                        .font(.system(size: 16))
                        .foregroundStyle(account == nil ? DTheme.inkTertiary : DTheme.ink)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }
}

// MARK: - Choosing

/// Two or three options as a grey-tinted segment (no white chips).
struct AccountingSegment<Value: Hashable>: View {
    let options: [(value: Value, label: String)]
    @Binding var selection: Value
    var height: CGFloat = 34
    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 3) {
            ForEach(options, id: \.value) { option in
                let selected = selection == option.value
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) { selection = option.value }
                } label: {
                    Text(option.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: height)
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
        .padding(3)
        .background(DTheme.tint.opacity(0.6), in: Capsule())
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A date row inside a form card.
struct AccountingDateRow: View {
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

// MARK: - Lines editor

/// One leg of a journal being written.
struct AccountingLineDraft: Identifiable, Hashable {
    let id = UUID()
    var account: AccountingAccountRef?
    var isDebit: Bool
    var amount = 0
    var memo = ""
}

extension Array where Element == AccountingLineDraft {
    var debits: Int { filter(\.isDebit).reduce(0) { $0 + $1.amount } }
    var credits: Int { filter { !$0.isDebit }.reduce(0) { $0 + $1.amount } }
    var isBalanced: Bool { debits == credits && debits > 0 }
    /// Every line has an account and an amount.
    var isComplete: Bool { count >= 2 && allSatisfy { $0.account != nil && $0.amount > 0 } }
}

/// Debit and credit legs with a running balance check underneath.
struct AccountingLinesEditor: View {
    @Binding var lines: [AccountingLineDraft]
    let currency: String
    var showsMemo = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Lines")
            ForEach($lines) { $line in
                lineCard($line, number: (lines.firstIndex { $0.id == line.id } ?? 0) + 1)
            }
            Button {
                withAnimation(.snappy) {
                    lines.append(AccountingLineDraft(isDebit: lines.debits <= lines.credits))
                }
            } label: {
                Label("Add line", systemImage: "plus")
            }
            .buttonStyle(SoftButtonStyle(size: .regular, fullWidth: true))
            AccountingBalanceBar(debits: lines.debits, credits: lines.credits, currency: currency)
                .padding(.top, 4)
        }
    }

    private func lineCard(_ line: Binding<AccountingLineDraft>, number: Int) -> some View {
        CardStack {
            HStack(spacing: 10) {
                Text("Line \(number)")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(DTheme.inkTertiary)
                Spacer()
                AccountingSegment(options: [(true, "Debit"), (false, "Credit")], selection: line.isDebit, height: 28)
                    .frame(width: 168)
                if lines.count > 2 {
                    Button {
                        let id = line.wrappedValue.id
                        withAnimation(.snappy) { lines.removeAll { $0.id == id } }
                    } label: {
                        Image(systemName: "minus.circle")
                            .font(.system(size: 17))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove line \(number)")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            AccountingAccountField(label: "Account", account: line.account)
            FieldRow(label: "Amount") {
                AmountField(minor: line.amount, currency: currency)
            }
            if showsMemo {
                FieldRow(label: "Description") {
                    TextField("Optional", text: line.memo)
                }
            }
        }
    }
}

/// "Debits $X  Credits $Y" and whether they match.
struct AccountingBalanceBar: View {
    let debits: Int
    let credits: Int
    let currency: String

    private var difference: Int { debits - credits }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            figure("Debits", debits)
            figure("Credits", credits)
            Spacer()
            if debits == 0 && credits == 0 {
                LedgerStatus(text: "Empty", tone: .neutral)
            } else if difference == 0 {
                LedgerStatus(text: "Balanced", tone: .positive)
            } else {
                LedgerStatus(text: "Off by \(Money.format(abs(difference), currency: currency))", tone: .negative)
            }
        }
        .padding(.horizontal, 4)
        .animation(.snappy, value: difference)
    }

    private func figure(_ label: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(DTheme.inkTertiary)
            Text(Money.format(value, currency: currency))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
                .contentTransition(.numericText(value: Double(value)))
        }
    }
}

// MARK: - Journal card

/// A posted or draft leg, ready to show.
struct AccountingJournalLine: Identifiable {
    let id: String
    let code: String
    let account: String
    let memo: String?
    let debit: Int
    let credit: Int
}

/// Lines with debit and credit columns and the totals underneath.
struct AccountingJournalCard: View {
    var title = "Lines"
    let lines: [AccountingJournalLine]
    let currency: String
    var onAccount: ((AccountingJournalLine) -> AnyView)?

    private var debits: Int { lines.reduce(0) { $0 + $1.debit } }
    private var credits: Int { lines.reduce(0) { $0 + $1.credit } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("\(title) · \(lines.count)")
            CardStack {
                HStack {
                    Text("Account")
                    Spacer()
                    Text("Debit").frame(width: 84, alignment: .trailing)
                    Text("Credit").frame(width: 84, alignment: .trailing)
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(DTheme.inkTertiary)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                ForEach(lines) { line in
                    row(line)
                }
                HStack {
                    Text("Total")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                    Spacer()
                    amount(debits, bold: true)
                    amount(credits, bold: true)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(DTheme.tint.opacity(0.5))
            }
        }
    }

    private func row(_ line: AccountingJournalLine) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if !line.code.isEmpty {
                        Text(line.code)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    Text(line.account)
                        .font(.system(size: 14.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(2)
                }
                if let memo = line.memo, !memo.isEmpty {
                    Text(memo)
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(2)
                }
            }
            .padding(.leading, line.credit > 0 && line.debit == 0 ? 14 : 0)
            Spacer(minLength: 6)
            amount(line.debit)
            amount(line.credit)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private func amount(_ value: Int, bold: Bool = false) -> some View {
        Text(value == 0 && !bold ? "" : Money.format(value, currency: currency))
            .font(.system(size: 14, weight: bold ? .semibold : .medium, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(DTheme.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(width: 84, alignment: .trailing)
    }
}

// MARK: - Detail pieces

/// The top of a detail screen: number and status, a title and a big figure.
struct AccountingHero: View {
    var number: String?
    var status: (text: String, tone: Tone)?
    let title: String
    var amount: Int?
    var currency = "USD"
    var caption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if number != nil || status != nil {
                HStack(spacing: 8) {
                    if let number {
                        Text(number)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    if let status {
                        LedgerStatus(text: status.text, tone: status.tone)
                    }
                }
            }
            Text(title)
                .font(.system(size: amount == nil ? 28 : 17, weight: amount == nil ? .semibold : .medium))
                .tracking(amount == nil ? -0.6 : 0)
                .foregroundStyle(amount == nil ? DTheme.ink : DTheme.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let amount {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .tracking(-1.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            if let caption, !caption.isEmpty {
                Text(caption)
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// "Label ..... value" rows in a card, skipping empty values.
struct AccountingFacts: View {
    var title = "Details"
    let rows: [(String, String?)]

    var body: some View {
        let shown = rows.compactMap { label, value in value.flatMap { $0.isEmpty ? nil : (label, $0) } }
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(title)
                CardStack {
                    ForEach(shown, id: \.0) { label, value in
                        if value.count > 34 {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(label)
                                    .font(.system(size: 13.5))
                                    .foregroundStyle(DTheme.inkSecondary)
                                Text(value)
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .textSelection(.enabled)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        } else {
                            DetailRow(label, value)
                        }
                    }
                }
            }
        }
    }
}

/// Three figures side by side, ledger style, for detail screens.
struct AccountingFigures: View {
    let items: [LedgerTotals.Item]

    var body: some View {
        LedgerTotals(items: items)
            .padding(16)
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
    }
}

/// A period in a schedule: done ones get a check, the next one a dot.
struct AccountingScheduleRow: View {
    let title: String
    var detail: String?
    let amount: Int
    let currency: String
    var trailing: String?
    let done: Bool
    var isNext = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                Circle()
                    .fill(done ? DTheme.positive.opacity(0.14) : (isNext ? DTheme.tintStrong : DTheme.tint))
                    .frame(width: 24, height: 24)
                if done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundStyle(DTheme.positive)
                } else if isNext {
                    Circle().fill(DTheme.ink).frame(width: 7, height: 7)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: isNext ? .semibold : .medium))
                    .foregroundStyle(done ? DTheme.inkSecondary : DTheme.ink)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkTertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(done ? DTheme.inkSecondary : DTheme.ink)
                if let trailing {
                    Text(trailing)
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

/// Primary actions floating over the bottom of a detail screen.
struct AccountingActionBar<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 10) { content }
            .padding(10)
            .glassEffect(.regular, in: .rect(cornerRadius: 32))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
    }
}

/// A form's error line.
struct AccountingFormError: View {
    let message: String?

    var body: some View {
        if let message {
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(DTheme.negative)
                .padding(.horizontal, 4)
                .transition(.opacity)
        }
    }
}

extension View {
    /// Sheet chrome shared by the accounting forms: title, cancel and a save button.
    func accountingFormChrome(title: String, saveTitle: String, canSave: Bool, saving: Bool, save: @escaping () async -> Void) -> some View {
        modifier(AccountingFormChrome(title: title, saveTitle: saveTitle, canSave: canSave, saving: saving, save: save))
    }
}

private struct AccountingFormChrome: ViewModifier {
    let title: String
    let saveTitle: String
    let canSave: Bool
    let saving: Bool
    let save: () async -> Void
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
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
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text(saveTitle) }
                    }
                    .disabled(!canSave || saving)
                }
            }
            .interactiveDismissDisabled(saving)
    }
}

/// Calendar days as the API sends them.
enum AccountingDay {
    static func string(_ date: Date) -> String { DubblDate.string(date) }
    static func date(_ value: String?) -> Date? { DubblDate.parseDay(value) }
}
