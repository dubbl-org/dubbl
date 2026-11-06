import SwiftUI

/// /settings/approval-workflows: which bills, expenses, invoices, journal
/// entries and purchase orders need sign-off, on what conditions and by whom,
/// step by step.
struct OrgSettingsApprovalsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var workflows = OrgSettingsResource("approval-workflows", query: ["limit": "100"])
    @State private var members = OrgSettingsResource("members")
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false

    static let entityTypes: [(value: String, label: String)] = [
        ("bill", "Bills"), ("expense", "Expenses"), ("invoice", "Invoices"), ("journal_entry", "Journal entries"), ("purchase_order", "Purchase orders"),
    ]

    private var all: [JSONValue] { workflows.value?.orgArray("data") ?? [] }

    var body: some View {
        OrgSettingsPage(loaded: workflows.isLoaded, error: workflows.error, reload: load) {
            if all.isEmpty {
                EmptyStateView(
                    symbol: "checkmark.seal", title: "No approval workflows",
                    message: "Ask for sign-off on large bills or expenses before they go out.",
                    actionTitle: "New workflow", action: { creating = true }
                )
                .dubblCard()
            }
            ForEach(Self.entityTypes, id: \.value) { type in
                let group = all.filter { $0.orgString("entityType") == type.value }
                if !group.isEmpty {
                    OrgSettingsSection(type.label, inset: 58) {
                        ForEach(group, id: \.recordID) { workflow in row(workflow) }
                    }
                }
            }
        }
        .navigationTitle("Approvals")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New workflow", systemImage: "plus") { creating = true }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsWorkflowSheet(workflow: item.value, members: memberChoices) { Task { await workflows.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsWorkflowSheet(workflow: nil, members: memberChoices) { Task { await workflows.load(env) } }
        }
        .task { await load() }
    }

    private var memberChoices: [OrgSettingsChoice] {
        (members.value?.orgArray("members") ?? []).compactMap { member in
            member.recordID.map { OrgSettingsChoice(value: $0, label: member.orgString("userName") ?? member.orgText("userEmail"), detail: member.orgString("role")?.humanized) }
        }
    }

    private func row(_ workflow: JSONValue) -> some View {
        let active = workflow.orgBool("isActive", default: true)
        let approvers = workflow.orgArray("steps").map { $0.orgString("approver.user.name") ?? $0.orgString("approver.user.email") ?? "Approver" }
        let conditions = workflow.orgArray("conditions").map { OrgSettingsWorkflowSheet.summary($0, currency: env.session.currency) }
        return Button { editing = OrgSettingsIdentified(value: workflow) } label: {
            OrgSettingsRow(
                symbol: "checkmark.seal", tone: active ? .positive : .neutral,
                title: workflow.orgText("name"),
                subtitle: [conditions.isEmpty ? "Always" : "When " + conditions.joined(separator: " and "), approvers.joined(separator: " → ")].filter { !$0.isEmpty }.joined(separator: " · ")
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
    }

    private func load() async {
        async let a: Void = workflows.load(env)
        async let b: Void = members.load(env)
        _ = await (a, b)
        #if DEBUG
        OrgSettingsDemo.open("workflow") { editing = all.first.map(OrgSettingsIdentified.init) }
        #endif
    }
}

/// Create or edit an approval workflow.
struct OrgSettingsWorkflowSheet: View {
    let workflow: JSONValue?
    let members: [OrgSettingsChoice]
    let onDone: () -> Void

    struct Condition: Identifiable {
        var id = UUID()
        var field = "total"
        var op = "gt"
        var value = ""
    }

    struct Step: Identifiable {
        var id = UUID()
        var approverID: String?
        var required = true
    }

    /// Document fields worth testing; money ones are typed in major units and sent in cents.
    static let fields: [(value: String, label: String)] = [
        ("total", "Total"), ("subtotal", "Subtotal"), ("taxTotal", "Tax"), ("currencyCode", "Currency"), ("status", "Status"),
    ]
    static let moneyFields: Set<String> = ["total", "subtotal", "taxTotal", "amount"]
    static let operators: [(value: String, label: String)] = [
        ("gt", "is more than"), ("gte", "is at least"), ("lt", "is less than"), ("lte", "is at most"), ("eq", "is"), ("neq", "is not"),
    ]

    /// "total is more than 5,000"
    static func summary(_ condition: JSONValue, currency: String) -> String {
        let field = condition.orgText("field")
        let label = fields.first { $0.value == field }?.label.lowercased() ?? field
        let op = operators.first { $0.value == condition.orgString("operator") }?.label ?? condition.orgText("operator")
        var value = condition.orgText("value")
        if moneyFields.contains(field), let cents = Int(value) { value = Money.short(cents, currency: currency) }
        return "\(label) \(op) \(value)"
    }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var entityType: String
    @State private var isActive: Bool
    @State private var conditions: [Condition]
    @State private var steps: [Step]
    @State private var confirmDelete = false

    init(workflow: JSONValue?, members: [OrgSettingsChoice], onDone: @escaping () -> Void) {
        self.workflow = workflow
        self.members = members
        self.onDone = onDone
        _name = State(initialValue: workflow?.orgText("name") ?? "")
        _entityType = State(initialValue: workflow?.orgString("entityType") ?? "bill")
        _isActive = State(initialValue: workflow?.orgBool("isActive", default: true) ?? true)
        _conditions = State(initialValue: (workflow?.orgArray("conditions") ?? []).map { item in
            let field = item.orgText("field")
            var value = item.orgText("value")
            if Self.moneyFields.contains(field), let cents = Int(value) { value = String(format: "%g", Double(cents) / 100) }
            return Condition(field: field, op: item.orgString("operator") ?? "gt", value: value)
        })
        let existing = (workflow?.orgArray("steps") ?? []).map { Step(approverID: $0.orgString("approverId"), required: $0.orgBool("isRequired", default: true)) }
        _steps = State(initialValue: existing.isEmpty ? [Step()] : existing)
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !steps.isEmpty && steps.allSatisfy { $0.approverID != nil }
    }

    var body: some View {
        OrgSettingsFormSheet(title: workflow == nil ? "New workflow" : "Edit workflow", saveTitle: workflow == nil ? "Create" : "Save", canSave: valid) {
            let tests: [JSONValue] = conditions.filter { !$0.value.isEmpty }.map { condition in
                var value = condition.value.trimmingCharacters(in: .whitespaces)
                if Self.moneyFields.contains(condition.field), let major = Double(value.replacingOccurrences(of: ",", with: "")) {
                    value = String(Int((major * 100).rounded()))
                }
                return .object(["field": .string(condition.field), "operator": .string(condition.op), "value": .string(value)])
            }
            let body: [String: JSONValue] = [
                "name": .string(name.trimmingCharacters(in: .whitespaces)),
                "entityType": .string(entityType),
                "isActive": .bool(isActive),
                "conditions": .array(tests),
                "steps": .array(steps.compactMap { step in
                    step.approverID.map { .object(["approverId": .string($0), "isRequired": .bool(step.required)]) }
                }),
            ]
            if let id = workflow?.recordID {
                try await OrgSettingsAPI.send(env, .patch, "approval-workflows/\(id)", body: body)
            } else {
                try await OrgSettingsAPI.send(env, .post, "approval-workflows", body: body)
            }
            env.toast.show(workflow == nil ? "Workflow created" : "Workflow saved")
            onDone()
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. Bills over $5,000", capitalization: .sentences)
                OrgSettingsPicker(label: "Applies to", selection: $entityType, options: OrgSettingsApprovalsView.entityTypes)
                OrgSettingsToggle(title: "Workflow is on", isOn: $isActive)
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Only when")
                CardStack {
                    if conditions.isEmpty {
                        Text("Every document of this kind needs approval.")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach($conditions) { $condition in conditionRow($condition) }
                    OrgSettingsButtonRow(title: "Add condition", symbol: "plus") {
                        withAnimation(.snappy) { conditions.append(Condition()) }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Approvers, in order")
                CardStack {
                    ForEach($steps) { $step in
                        stepRow(index: steps.firstIndex { $0.id == step.id } ?? 0, step: $step)
                    }
                    OrgSettingsButtonRow(title: "Add step", symbol: "plus") {
                        withAnimation(.snappy) { steps.append(Step()) }
                    }
                }
            }
            if let id = workflow?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Delete workflow", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Workflow deleted", { try await OrgSettingsAPI.send(env, .delete, "approval-workflows/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("New documents won't need this approval any more.")
                }
            }
        }
    }

    private func conditionRow(_ condition: Binding<Condition>) -> some View {
        let isMoney = Self.moneyFields.contains(condition.wrappedValue.field)
        return HStack(spacing: 8) {
            Menu {
                Picker("Field", selection: condition.field) {
                    ForEach(Self.fields, id: \.value) { Text($0.label).tag($0.value) }
                }
            } label: { chip(Self.fields.first { $0.value == condition.wrappedValue.field }?.label ?? condition.wrappedValue.field) }
            Menu {
                Picker("Test", selection: condition.op) {
                    ForEach(Self.operators, id: \.value) { Text($0.label).tag($0.value) }
                }
            } label: { chip(Self.operators.first { $0.value == condition.wrappedValue.op }?.label ?? "is") }
            TextField(isMoney ? "0.00" : "Value", text: condition.value)
                .keyboardType(isMoney ? .decimalPad : .default)
                .textInputAutocapitalization(.never)
                .font(isMoney ? DFont.figure(16, weight: .regular) : .system(size: 16))
                .multilineTextAlignment(.trailing)
            Button {
                withAnimation(.snappy) { conditions.removeAll { $0.id == condition.wrappedValue.id } }
            } label: {
                Image(systemName: "minus.circle.fill").font(.system(size: 18)).foregroundStyle(DTheme.inkTertiary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove condition")
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }

    private func stepRow(index: Int, step: Binding<Step>) -> some View {
        HStack(spacing: 12) {
            Text("\(index + 1)")
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(DTheme.inkSecondary)
                .frame(width: 26, height: 26)
                .background(DTheme.tint, in: Circle())
            OrgSettingsChoiceRow(label: "Approver", title: "Approver", choices: members, selection: step.approverID)
                .padding(.horizontal, -16)
            if steps.count > 1 {
                Button {
                    withAnimation(.snappy) { steps.removeAll { $0.id == step.wrappedValue.id } }
                } label: {
                    Image(systemName: "minus.circle.fill").font(.system(size: 18)).foregroundStyle(DTheme.inkTertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove step")
            }
        }
        .padding(.horizontal, 16)
    }

    private func chip(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text).lineLimit(1)
            Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(DTheme.ink)
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(DTheme.tint, in: Capsule())
        .fixedSize()
    }
}
