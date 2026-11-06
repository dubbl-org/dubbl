import SwiftUI

/// Payroll settings as a native form that reads and saves
/// `GET/PUT payroll/settings` -> `{ settings }`, with the setup lists the web
/// page manages (deductions, leave policies, tax brackets, approvals, shifts)
/// shown below for reference.
struct PayrollSettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loaded = false
    @State private var error: String?
    @State private var saving = false
    @State private var saved: Values?
    @State private var values = Values()
    @State private var deductions: [JSONValue] = []
    @State private var policies: [JSONValue] = []
    @State private var brackets: [JSONValue] = []
    @State private var chains: [JSONValue] = []
    @State private var shifts: [JSONValue] = []

    /// The editable settings, as typed.
    struct Values: Equatable {
        var taxRate = ""
        var overtimeHours = ""
        var overtimeMultiplier = ""
        var currency = ""
        var expenseAccount = ""
        var taxAccount = ""
        var bankAccount = ""
        var autoApprove = false
    }

    private var dirty: Bool { saved != nil && saved != values }

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    form
                    setupLists
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(DTheme.shell)
        .navigationTitle("Payroll settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text("Save") }
                }
                .disabled(!dirty || saving)
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Pay")
                CardStack {
                    FieldRow(label: "Default tax rate") {
                        HStack(spacing: 4) {
                            TextField("20", text: $values.taxRate)
                                .keyboardType(.decimalPad)
                                .font(DFont.figure(16, weight: .regular))
                            Text("%").foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    FieldRow(label: "Currency") {
                        TextField("USD", text: $values.currency)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(.system(size: 16, design: .monospaced))
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Overtime")
                CardStack {
                    FieldRow(label: "Overtime after") {
                        HStack(spacing: 4) {
                            TextField("40", text: $values.overtimeHours)
                                .keyboardType(.decimalPad)
                                .font(DFont.figure(16, weight: .regular))
                            Text("hours a week").foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    FieldRow(label: "Overtime pays") {
                        HStack(spacing: 4) {
                            TextField("1.5", text: $values.overtimeMultiplier)
                                .keyboardType(.decimalPad)
                                .font(DFont.figure(16, weight: .regular))
                            Text("× the hourly rate").foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Accounts")
                CardStack {
                    FieldRow(label: "Salary expense") { code($values.expenseAccount, "5100") }
                    FieldRow(label: "Tax payable") { code($values.taxAccount, "2200") }
                    FieldRow(label: "Pay from bank account") { code($values.bankAccount, "1100") }
                }
                Text("Account codes from your chart of accounts. Pay runs post here.")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                    .padding(.horizontal, 4)
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Approvals")
                CardStack {
                    Toggle(isOn: $values.autoApprove) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Approve pay runs automatically")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Text("Skip the approval step when no approval chain is set.")
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .tint(DTheme.positive)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    private func code(_ text: Binding<String>, _ placeholder: String) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(.numberPad)
            .font(.system(size: 16, design: .monospaced))
    }

    @ViewBuilder
    private var setupLists: some View {
        setupSection("Deductions", deductions, empty: "No deduction types.") { row in
            let amount = row["defaultAmount"]?.intValue.map { Money.format($0, currency: env.session.currency) }
            let percent = row["defaultPercent"]?.intValue.map { "\($0)%" } ?? row["defaultPercent"]?.stringValue.map { "\($0)%" }
            return (row["name"]?.stringValue ?? "Deduction", row["category"]?.stringValue == "pre_tax" ? "Before tax" : "After tax", amount ?? percent ?? "")
        }
        setupSection("Leave policies", policies, empty: "No leave policies.") { row in
            (row["name"]?.stringValue ?? "Policy",
             "\((row["leaveType"]?.stringValue ?? "").humanized) · \((row["accrualMethod"]?.stringValue ?? "").replacingOccurrences(of: "_", with: " ").humanized)",
             PayrollFormat.hours(row["accrualRate"]))
        }
        setupSection("Tax brackets", brackets, empty: "No tax brackets.") { row in
            let low = Money.short(row["minIncome"]?.intValue ?? 0, currency: env.session.currency)
            let high = row["maxIncome"]?.intValue.map { Money.short($0, currency: env.session.currency) } ?? "and up"
            return (row["name"]?.stringValue ?? "Bracket",
                    [row["jurisdiction"]?.stringValue ?? (row["jurisdictionLevel"]?.stringValue ?? "").humanized, "\(low) – \(high)", row["taxYear"]?.stringValue].compactMap { $0 }.joined(separator: " · "),
                    TaxFormat.percent(row["rate"]?.intValue ?? 0))
        }
        setupSection("Approval chains", chains, empty: "No approval chains. Pay runs can be processed straight away.") { row in
            let steps = row["steps"]?.arrayValue?.count ?? 0
            return (row["name"]?.stringValue ?? "Chain", row["description"]?.stringValue ?? "", "\(steps) \(steps == 1 ? "step" : "steps")")
        }
        setupSection("Shifts", shifts, empty: "No shifts.") { row in
            (row["name"]?.stringValue ?? "Shift",
             "\(row["startTime"]?.stringValue ?? "") – \(row["endTime"]?.stringValue ?? "") · \((row["shiftType"]?.stringValue ?? "").humanized)",
             (row["premiumPercent"]?.intValue).map { $0 > 0 ? "+\($0)%" : "" } ?? "")
        }
    }

    private func setupSection(_ title: String, _ rows: [JSONValue], empty: String, _ describe: @escaping (JSONValue) -> (String, String, String)) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(rows.isEmpty ? title : "\(title) · \(rows.count)")
            CardStack {
                if rows.isEmpty {
                    Text(empty)
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    let (name, detail, value) = describe(row)
                    TaxFigureRow(label: name, value: value, detail: detail.isEmpty ? nil : detail)
                }
            }
        }
    }

    // MARK: Loading and saving

    private func fill(_ settings: JSONValue) {
        func number(_ key: String) -> String {
            guard let value = settings[key] else { return "" }
            if case let .number(double) = value { return double.formatted(.number.precision(.fractionLength(0 ... 2)).grouping(.never)) }
            return value.stringValue ?? ""
        }
        var next = Values()
        next.taxRate = (Double(settings["defaultTaxRate"]?.intValue ?? 0) / 100).formatted(.number.precision(.fractionLength(0 ... 2)).grouping(.never))
        next.overtimeHours = number("overtimeThresholdHours")
        next.overtimeMultiplier = number("overtimeMultiplier")
        next.currency = settings["defaultCurrency"]?.stringValue ?? env.session.currency
        next.expenseAccount = settings["salaryExpenseAccountCode"]?.stringValue ?? ""
        next.taxAccount = settings["taxPayableAccountCode"]?.stringValue ?? ""
        next.bankAccount = settings["bankAccountCode"]?.stringValue ?? ""
        next.autoApprove = settings["autoApprovalEnabled"]?.boolValue ?? false
        values = next
        saved = next
    }

    private func load() async {
        do {
            let api = env.api
            async let settings: JSONValue = api.get("payroll/settings")
            async let d: JSONValue? = try? api.get("payroll/deductions/types")
            async let p: JSONValue? = try? api.get("payroll/leave/policies")
            async let b: JSONValue? = try? api.get("payroll/tax/brackets")
            async let c: JSONValue? = try? api.get("payroll/approval-chains")
            async let s: JSONValue? = try? api.get("payroll/shifts")
            let (response, dr, pr, br, cr, sr) = try await (settings, d, p, b, c, s)
            withAnimation(.snappy) {
                if !dirty { fill(response["settings"] ?? response) }
                deductions = dr?["data"]?.arrayValue ?? []
                policies = pr?["data"]?.arrayValue ?? []
                brackets = br?["data"]?.arrayValue ?? []
                chains = cr?["data"]?.arrayValue ?? []
                shifts = sr?["data"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }

    private func save() async {
        func double(_ text: String) -> Double? { Double(text.replacingOccurrences(of: ",", with: ".")) }
        var body: [String: JSONValue] = ["autoApprovalEnabled": .bool(values.autoApprove)]
        if let rate = double(values.taxRate) { body["defaultTaxRate"] = .number((rate * 100).rounded()) }
        if let hours = double(values.overtimeHours) { body["overtimeThresholdHours"] = .number(hours) }
        if let multiplier = double(values.overtimeMultiplier) { body["overtimeMultiplier"] = .number(max(1, multiplier)) }
        let currency = values.currency.trimmingCharacters(in: .whitespaces).uppercased()
        if currency.count == 3 { body["defaultCurrency"] = .string(currency) }
        for (key, value) in [("salaryExpenseAccountCode", values.expenseAccount), ("taxPayableAccountCode", values.taxAccount), ("bankAccountCode", values.bankAccount)] {
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { body[key] = .string(trimmed) }
        }
        saving = true
        defer { saving = false }
        do {
            _ = try await env.api.payrollPut("payroll/settings", body: body)
            env.toast.show("Settings saved")
            saved = values
        } catch {
            env.toast.error(error)
        }
    }
}
