import SwiftUI

/// /settings/bank-rules: rules that code bank lines automatically. Each rule
/// matches on description, reference, payee, counterparty or amount and
/// codes the line to an account, optionally reconciling it straight away.
struct OrgSettingsBankRulesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var rules = OrgSettingsResource("bank-rules", query: ["limit": "100"])
    @State private var accounts = OrgSettingsResource("accounts")
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { rules.value?.orgArray("data") ?? [] }

    var body: some View {
        OrgSettingsPage(loaded: rules.isLoaded, error: rules.error, reload: load) {
            if !canManage {
                OrgSettingsNotice(text: OrgSettingsLevel.admin.readOnlyMessage)
            }
            if all.isEmpty {
                EmptyStateView(
                    symbol: "wand.and.stars", title: "No bank rules yet",
                    message: "Code recurring bank lines, like AWS or WeWork, without lifting a finger.",
                    actionTitle: canManage ? "New rule" : nil, action: { creating = true }
                )
                .dubblCard()
            } else {
                OrgSettingsSection("Rules", footer: "Higher priority rules are checked first. The first match wins.", inset: 58) {
                    ForEach(all, id: \.recordID) { rule in row(rule) }
                }
            }
        }
        .navigationTitle("Bank rules")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New rule", systemImage: "plus") { creating = true }
                }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsBankRuleSheet(rule: item.value, accounts: accountChoices, canManage: canManage) { Task { await rules.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsBankRuleSheet(rule: nil, accounts: accountChoices, canManage: true) { Task { await rules.load(env) } }
        }
        .task { await load() }
    }

    private var accountChoices: [OrgSettingsChoice] {
        (accounts.value?.orgArray("accounts") ?? []).compactMap { account in
            account.recordID.map { OrgSettingsChoice(value: $0, label: account.orgText("name"), detail: [account.orgString("code"), account.orgString("type")?.humanized].compactMap { $0 }.joined(separator: " · ")) }
        }
    }

    private func row(_ rule: JSONValue) -> some View {
        let active = rule.orgBool("isActive", default: true)
        let account = rule.orgString("accountId").flatMap { id in accountChoices.first { $0.value == id }?.label }
        let conditions = OrgSettingsBankRuleSheet.conditions(of: rule)
        let joiner = rule.orgBool("matchAll", default: true) ? " and " : " or "
        let summary = conditions.map { $0.summary }.joined(separator: joiner)
        return Button { editing = OrgSettingsIdentified(value: rule) } label: {
            OrgSettingsRow(
                symbol: rule.orgBool("autoReconcile") ? "bolt.badge.checkmark" : "wand.and.stars",
                tone: active ? .info : .neutral,
                title: rule.orgText("name"),
                subtitle: [summary.isEmpty ? nil : "If \(summary)", account.map { "code to \($0)" }].compactMap { $0 }.joined(separator: ", ")
            ) {
                HStack(spacing: 8) {
                    if !active { LedgerStatus(text: "Off", tone: .neutral) }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .buttonStyle(RowPressStyle())
        .contextMenu {
            if canManage, let id = rule.recordID {
                Button(active ? "Turn off" : "Turn on", systemImage: active ? "pause.circle" : "play.circle") {
                    Task {
                        if await OrgSettingsRun.run(env, active ? "Rule turned off" : "Rule turned on", { try await OrgSettingsAPI.send(env, .patch, "bank-rules/\(id)", body: ["isActive": .bool(!active)]) }) {
                            await rules.load(env)
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        async let a: Void = rules.load(env)
        async let b: Void = accounts.load(env)
        _ = await (a, b)
        #if DEBUG
        OrgSettingsDemo.open("rule") { editing = all.dropFirst().first.map(OrgSettingsIdentified.init) }
        #endif
    }
}

/// Create or edit a bank rule: conditions, the account to code to and switches.
struct OrgSettingsBankRuleSheet: View {
    let rule: JSONValue?
    let accounts: [OrgSettingsChoice]
    let canManage: Bool
    let onDone: () -> Void

    /// One test against a bank line. Amounts are typed in major units here and
    /// sent in cents ("min,max" for between).
    struct Condition: Identifiable, Equatable {
        var id = UUID()
        var field = "description"
        var op = "contains"
        var value = ""

        var summary: String {
            let field = OrgSettingsBankRuleSheet.fields.first { $0.value == self.field }?.label.lowercased() ?? self.field
            let op = OrgSettingsBankRuleSheet.operators.first { $0.value == self.op }?.label ?? self.op
            let shown = self.field == "amount" ? value.replacingOccurrences(of: ",", with: "–") : "“\(value)”"
            return "\(field) \(op) \(shown)"
        }
    }

    nonisolated static let fields: [(value: String, label: String)] = [
        ("description", "Description"), ("reference", "Reference"), ("payee", "Payee"), ("counterparty", "Counterparty"), ("amount", "Amount"),
    ]
    nonisolated static let operators: [(value: String, label: String)] = [
        ("contains", "contains"), ("equals", "equals"), ("starts_with", "starts with"), ("ends_with", "ends with"),
        ("gt", "is more than"), ("lt", "is less than"), ("between", "is between"),
    ]

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var matchAll: Bool
    @State private var conditions: [Condition]
    @State private var accountID: String?
    @State private var autoReconcile: Bool
    @State private var isActive: Bool
    @State private var priority: Int
    @State private var confirmDelete = false

    init(rule: JSONValue?, accounts: [OrgSettingsChoice], canManage: Bool, onDone: @escaping () -> Void) {
        self.rule = rule
        self.accounts = accounts
        self.canManage = canManage
        self.onDone = onDone
        _name = State(initialValue: rule?.orgText("name") ?? "")
        _matchAll = State(initialValue: rule?.orgBool("matchAll", default: true) ?? true)
        let existing = rule.map(Self.conditions(of:)) ?? []
        _conditions = State(initialValue: existing.isEmpty ? [Condition()] : existing)
        _accountID = State(initialValue: rule?.orgString("accountId"))
        _autoReconcile = State(initialValue: rule?.orgBool("autoReconcile") ?? false)
        _isActive = State(initialValue: rule?.orgBool("isActive", default: true) ?? true)
        _priority = State(initialValue: rule?.orgInt("priority") ?? 0)
    }

    /// The rule's conditions, or its legacy single match as one condition.
    static func conditions(of rule: JSONValue) -> [Condition] {
        let list = rule.orgArray("conditions").map { item in
            let field = item.orgText("field")
            let value = item.orgText("value")
            return Condition(field: field, op: item.orgText("op"), value: field == "amount" ? majorText(value) : value)
        }
        if !list.isEmpty { return list }
        guard let value = rule.orgString("matchValue") else { return [] }
        return [Condition(field: rule.orgString("matchField") ?? "description", op: rule.orgString("matchType") ?? "contains", value: value)]
    }

    /// "1250" -> "12.50"; "1000,5000" -> "10,50".
    private static func majorText(_ cents: String) -> String {
        cents.split(separator: ",").map { part in
            Int(part).map { String(format: "%g", Double($0) / 100) } ?? String(part)
        }.joined(separator: ",")
    }

    /// "12.50" -> "1250"
    private static func centsText(_ major: String) -> String {
        major.split(separator: ",").map { part in
            Double(part.trimmingCharacters(in: .whitespaces)).map { String(Int(($0 * 100).rounded())) } ?? String(part)
        }.joined(separator: ",")
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && conditions.contains { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    var body: some View {
        OrgSettingsFormSheet(title: rule == nil ? "New rule" : (canManage ? "Edit rule" : "Rule"), saveTitle: rule == nil ? "Create" : "Save", canSave: valid, readOnly: !canManage) {
            let tests: [JSONValue] = conditions
                .filter { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }
                .map { condition in
                    let value = condition.value.trimmingCharacters(in: .whitespaces)
                    return .object([
                        "field": .string(condition.field), "op": .string(condition.op),
                        "value": .string(condition.field == "amount" ? Self.centsText(value) : value),
                    ])
                }
            var body: [String: JSONValue] = [
                "name": .string(name.trimmingCharacters(in: .whitespaces)),
                "conditions": .array(tests),
                "matchAll": .bool(matchAll),
                "accountId": accountID.map(JSONValue.string) ?? .null,
                "autoReconcile": .bool(autoReconcile),
                "priority": OrgJSON.number(priority),
            ]
            if let id = rule?.recordID {
                body["isActive"] = .bool(isActive)
                try await OrgSettingsAPI.send(env, .patch, "bank-rules/\(id)", body: body)
            } else {
                try await OrgSettingsAPI.send(env, .post, "bank-rules", body: body)
            }
            env.toast.show(rule == nil ? "Rule created" : "Rule saved")
            onDone()
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. AWS hosting", capitalization: .words, disabled: !canManage)
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("When a bank line matches")
                CardStack {
                    OrgSettingsPicker(label: "Match", selection: $matchAll, options: [(true, "All conditions"), (false, "Any condition")], disabled: !canManage)
                    ForEach($conditions) { $condition in
                        conditionRow($condition)
                    }
                    if canManage {
                        OrgSettingsButtonRow(title: "Add condition", symbol: "plus") {
                            withAnimation(.snappy) { conditions.append(Condition()) }
                        }
                    }
                }
            }
            OrgSettingsSection("Then", footer: "Amounts are in your base currency. For between, enter the low and high amounts separated by a comma.") {
                OrgSettingsChoiceRow(label: "Code to", title: "Account", choices: accounts, selection: $accountID, allowsNone: true, disabled: !canManage)
                OrgSettingsToggle(title: "Reconcile automatically", subtitle: "Matched lines are coded and reconciled without review", isOn: $autoReconcile, disabled: !canManage)
                Stepper(value: $priority, in: 0 ... 100) {
                    HStack {
                        Text("Priority").font(.system(size: 16)).foregroundStyle(DTheme.ink)
                        Spacer()
                        Text("\(priority)").font(DFont.figure(15)).foregroundStyle(DTheme.inkSecondary)
                    }
                }
                .disabled(!canManage)
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                if rule != nil {
                    OrgSettingsToggle(title: "Rule is on", isOn: $isActive, disabled: !canManage)
                }
            }
            if canManage, let id = rule?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Delete rule", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Rule deleted", { try await OrgSettingsAPI.send(env, .delete, "bank-rules/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Lines it already coded stay as they are.")
                }
            }
        }
    }

    private func conditionRow(_ condition: Binding<Condition>) -> some View {
        let isAmount = condition.wrappedValue.field == "amount"
        let ops = Self.operators.filter { isAmount ? ["equals", "gt", "lt", "between"].contains($0.value) : !["gt", "lt", "between"].contains($0.value) }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Menu {
                    Picker("Field", selection: condition.field) {
                        ForEach(Self.fields, id: \.value) { Text($0.label).tag($0.value) }
                    }
                } label: {
                    chip(Self.fields.first { $0.value == condition.wrappedValue.field }?.label ?? "Field")
                }
                Menu {
                    Picker("Test", selection: condition.op) {
                        ForEach(ops, id: \.value) { Text($0.label).tag($0.value) }
                    }
                } label: {
                    chip(Self.operators.first { $0.value == condition.wrappedValue.op }?.label ?? "Test")
                }
                Spacer()
                if canManage, conditions.count > 1 {
                    Button {
                        withAnimation(.snappy) { conditions.removeAll { $0.id == condition.wrappedValue.id } }
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove condition")
                }
            }
            .disabled(!canManage)
            TextField(isAmount ? (condition.wrappedValue.op == "between" ? "100, 500" : "0.00") : "Text to look for", text: condition.value)
                .keyboardType(isAmount ? .numbersAndPunctuation : .default)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(isAmount ? DFont.figure(16, weight: .regular) : .system(size: 16))
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(DTheme.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .disabled(!canManage)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .onChange(of: condition.wrappedValue.field) { _, field in
            // Keep the test valid for the field's kind.
            if !ops.contains(where: { $0.value == condition.wrappedValue.op }) || (field == "amount") != isAmount {
                condition.wrappedValue.op = field == "amount" ? "equals" : "contains"
            }
        }
    }

    private func chip(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text)
            Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(DTheme.ink)
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(DTheme.tint, in: Capsule())
    }
}
