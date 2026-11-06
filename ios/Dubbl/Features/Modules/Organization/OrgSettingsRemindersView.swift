import SwiftUI

/// /settings/reminders: automatic emails before, on or after an invoice or
/// bill falls due, plus a log of what was sent. Owners and admins edit rules.
struct OrgSettingsRemindersView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var rules = OrgSettingsResource("reminders")
    @State private var logs = OrgSettingsResource("reminders/logs", query: ["limit": "20"])
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { rules.value?.orgArray("data") ?? [] }

    static func trigger(_ rule: JSONValue) -> String {
        let days = rule.orgInt("triggerDays") ?? 0
        let unit = days == 1 ? "day" : "days"
        switch rule.orgString("triggerType") {
        case "before_due": return "\(days) \(unit) before due"
        case "after_due": return "\(days) \(unit) overdue"
        default: return "On the due date"
        }
    }

    var body: some View {
        OrgSettingsPage(loaded: rules.isLoaded, error: rules.error, reload: load) {
            if !canManage {
                OrgSettingsNotice(text: OrgSettingsLevel.admin.readOnlyMessage)
            }
            if all.isEmpty {
                EmptyStateView(
                    symbol: "bell.badge", title: "No reminders yet",
                    message: "Nudge customers before and after invoices fall due, automatically.",
                    actionTitle: canManage ? "New reminder" : nil, action: { creating = true }
                )
                .dubblCard()
            } else {
                OrgSettingsSection("Rules", footer: canManage ? "Switch a rule off to pause it without losing the wording." : nil, inset: 58) {
                    ForEach(all, id: \.recordID) { rule in row(rule) }
                }
            }
            history
        }
        .navigationTitle("Reminders")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New reminder", systemImage: "plus") { creating = true }
                }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsReminderSheet(rule: item.value, canManage: canManage) { Task { await rules.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsReminderSheet(rule: nil, canManage: true) { Task { await rules.load(env) } }
        }
        .task { await load() }
    }

    private func row(_ rule: JSONValue) -> some View {
        let enabled = rule.orgBool("enabled")
        let isBill = rule.orgString("documentType") == "bill"
        return HStack(spacing: 0) {
            Button { editing = OrgSettingsIdentified(value: rule) } label: {
                OrgSettingsRow(
                    symbol: isBill ? "doc.plaintext" : "doc.text", tone: enabled ? .info : .neutral,
                    title: rule.orgText("name"),
                    subtitle: "\(isBill ? "Bills" : "Invoices") · \(Self.trigger(rule))"
                ) { EmptyView() }
            }
            .buttonStyle(RowPressStyle())
            Toggle("", isOn: Binding(get: { enabled }, set: { on in
                Task {
                    guard let id = rule.recordID else { return }
                    if await OrgSettingsRun.run(env, on ? "Reminder on" : "Reminder paused", { try await OrgSettingsAPI.send(env, .put, "reminders/\(id)", body: ["enabled": .bool(on)]) }) {
                        await rules.load(env)
                    }
                }
            }))
            .labelsHidden()
            .tint(DTheme.positive)
            .disabled(!canManage)
            .padding(.trailing, 14)
        }
    }

    @ViewBuilder
    private var history: some View {
        let entries = logs.value?.orgArray("data") ?? []
        if !entries.isEmpty {
            OrgSettingsSection("Recently sent") {
                ForEach(entries, id: \.recordID) { entry in
                    let status = entry.orgText("status")
                    OrgSettingsRow(
                        title: entry.orgText("subject"),
                        subtitle: [entry.orgString("recipientEmail"), OrgSettingsFormat.moment(entry.orgString("sentAt")), entry.orgString("errorMessage")].compactMap { $0 }.joined(separator: " · ")
                    ) {
                        LedgerStatus(text: status.humanized, tone: status == "sent" ? .positive : status == "failed" ? .negative : .neutral)
                    }
                }
            }
        }
    }

    private func load() async {
        async let a: Void = rules.load(env)
        async let b: Void = logs.load(env)
        _ = await (a, b)
        #if DEBUG
        OrgSettingsDemo.open("reminder") { editing = all.dropFirst().first.map(OrgSettingsIdentified.init) }
        #endif
    }
}

/// Create or edit a reminder rule.
struct OrgSettingsReminderSheet: View {
    let rule: JSONValue?
    let canManage: Bool
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var documentType: String
    @State private var triggerType: String
    @State private var days: Int
    @State private var recipientType: String
    @State private var customEmails: String
    @State private var subject: String
    @State private var message: String
    @State private var enabled: Bool
    @State private var confirmDelete = false
    @FocusState private var focus: Field?

    enum Field { case subject, message }

    static let placeholders: [(label: String, token: String)] = [
        ("Contact", "{{contactName}}"), ("Number", "{{documentNumber}}"), ("Amount due", "{{amountDue}}"),
        ("Due date", "{{dueDate}}"), ("Days overdue", "{{daysOverdue}}"), ("Organization", "{{organizationName}}"),
    ]

    init(rule: JSONValue?, canManage: Bool, onDone: @escaping () -> Void) {
        self.rule = rule
        self.canManage = canManage
        self.onDone = onDone
        _name = State(initialValue: rule?.orgText("name") ?? "")
        _documentType = State(initialValue: rule?.orgString("documentType") ?? "invoice")
        _triggerType = State(initialValue: rule?.orgString("triggerType") ?? "after_due")
        _days = State(initialValue: rule?.orgInt("triggerDays") ?? 7)
        _recipientType = State(initialValue: rule?.orgString("recipientType") ?? "contact_email")
        _customEmails = State(initialValue: (rule?.orgArray("customEmails") ?? []).compactMap(\.stringValue).joined(separator: ", "))
        _subject = State(initialValue: rule?.orgText("subjectTemplate") ?? "Reminder: {{documentNumber}} is due")
        _message = State(initialValue: rule?.orgText("bodyTemplate") ?? "Hi {{contactName}},\n\nA friendly reminder that {{documentNumber}} for {{amountDue}} was due on {{dueDate}}.\n\nThank you,\n{{organizationName}}")
        _enabled = State(initialValue: rule?.orgBool("enabled") ?? true)
    }

    private var emails: [String] {
        customEmails.split(whereSeparator: { $0 == "," || $0 == " " || $0 == "\n" }).map(String.init).filter { $0.contains("@") }
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !subject.isEmpty && !message.isEmpty && (recipientType != "custom" || !emails.isEmpty)
    }

    var body: some View {
        OrgSettingsFormSheet(title: rule == nil ? "New reminder" : (canManage ? "Edit reminder" : "Reminder"), saveTitle: rule == nil ? "Create" : "Save", canSave: valid, readOnly: !canManage) {
            let body: [String: JSONValue] = [
                "name": .string(name.trimmingCharacters(in: .whitespaces)),
                "documentType": .string(documentType),
                "triggerType": .string(triggerType),
                "triggerDays": OrgJSON.number(triggerType == "on_due" ? 0 : days),
                "recipientType": .string(recipientType),
                "customEmails": recipientType == "custom" ? OrgJSON.strings(emails) : .null,
                "subjectTemplate": .string(subject),
                "bodyTemplate": .string(message),
                "enabled": .bool(enabled),
            ]
            if let id = rule?.recordID {
                try await OrgSettingsAPI.send(env, .put, "reminders/\(id)", body: body)
            } else {
                try await OrgSettingsAPI.send(env, .post, "reminders", body: body)
            }
            env.toast.show(rule == nil ? "Reminder created" : "Reminder saved")
            onDone()
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. A week overdue", disabled: !canManage)
                OrgSettingsToggle(title: "Reminder is on", isOn: $enabled, disabled: !canManage)
            }
            OrgSettingsSection("When") {
                OrgSettingsPicker(label: "For", selection: $documentType, options: [("invoice", "Invoices"), ("bill", "Bills")], disabled: !canManage)
                OrgSettingsPicker(label: "Send", selection: $triggerType, options: [("before_due", "Before due"), ("on_due", "On the due date"), ("after_due", "After due")], disabled: !canManage)
                if triggerType != "on_due" {
                    Stepper(value: $days, in: 1 ... 120) {
                        HStack {
                            Text("Days").font(.system(size: 16)).foregroundStyle(DTheme.ink)
                            Spacer()
                            Text("\(days)").font(DFont.figure(15)).foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .disabled(!canManage)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 52)
                }
            }
            OrgSettingsSection("To") {
                OrgSettingsPicker(label: "Recipients", selection: $recipientType, options: [("contact_email", "Contact's email"), ("contact_persons", "Contact people"), ("custom", "These addresses")], disabled: !canManage)
                if recipientType == "custom" {
                    OrgSettingsField(label: "Email addresses", text: $customEmails, prompt: "ap@acme.com, finance@acme.com", keyboard: .emailAddress, capitalization: .never, axis: .vertical, disabled: !canManage)
                }
            }
            OrgSettingsSection("Email", footer: canManage ? "Tap a placeholder to add it where you're typing." : nil) {
                FieldRow(label: "Subject") {
                    TextField("Subject", text: $subject)
                        .focused($focus, equals: .subject)
                        .disabled(!canManage)
                }
                FieldRow(label: "Message") {
                    TextField("Message", text: $message, axis: .vertical)
                        .lineLimit(6 ... 14)
                        .focused($focus, equals: .message)
                        .disabled(!canManage)
                }
                if canManage {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Self.placeholders, id: \.token) { item in
                                Button(item.label) { insert(item.token) }
                                    .buttonStyle(SoftButtonStyle(size: .small))
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                }
            }
            if canManage, let id = rule?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Delete reminder", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Reminder deleted", { try await OrgSettingsAPI.send(env, .delete, "reminders/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                }
            }
        }
    }

    /// Appends a placeholder to the field being edited (the message otherwise).
    private func insert(_ token: String) {
        if focus == .subject {
            subject += (subject.hasSuffix(" ") || subject.isEmpty ? "" : " ") + token
        } else {
            message += (message.hasSuffix(" ") || message.hasSuffix("\n") || message.isEmpty ? "" : " ") + token
        }
    }
}
