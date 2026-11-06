import SwiftUI

/// /settings/webhooks: endpoints dubbl calls when invoices, payments, bills
/// and approvals change. Admins add and edit endpoints, send a test, read the
/// signing secret and see recent deliveries.
struct OrgSettingsWebhooksView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var webhooks = OrgSettingsResource("webhooks", query: ["limit": "100"])
    @State private var creating = false
    @State private var demoDetail: String?

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { webhooks.value?.orgArray("data") ?? [] }

    static let eventGroups: [(label: String, events: [String])] = [
        ("Invoices", ["invoice.created", "invoice.paid", "invoice.overdue"]),
        ("Payments", ["payment.received"]),
        ("Expenses", ["expense.created"]),
        ("Bills", ["bill.created", "bill.due"]),
        ("Contacts", ["contact.created"]),
        ("Accounting", ["journal.posted"]),
        ("Approvals", ["approval.requested", "approval.completed"]),
    ]

    var body: some View {
        OrgSettingsPage(loaded: webhooks.isLoaded, error: webhooks.error, reload: { await webhooks.load(env) }) {
            if !canManage {
                OrgSettingsNotice(text: OrgSettingsLevel.admin.readOnlyMessage)
            }
            if all.isEmpty {
                EmptyStateView(
                    symbol: "point.3.connected.trianglepath.dotted", title: "No webhooks yet",
                    message: "Send events to your own systems as they happen in dubbl.",
                    actionTitle: canManage ? "Add endpoint" : nil, action: { creating = true }
                )
                .dubblCard()
            } else {
                OrgSettingsSection("Endpoints", inset: 58) {
                    ForEach(all, id: \.recordID) { webhook in
                        NavigationLink {
                            OrgSettingsWebhookDetailView(id: webhook.recordID ?? "", canManage: canManage) { Task { await webhooks.load(env) } }
                        } label: {
                            row(webhook)
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
        }
        .navigationTitle("Webhooks")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add endpoint", systemImage: "plus") { creating = true }
                }
            }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsWebhookSheet(webhook: nil) { _ in Task { await webhooks.load(env) } }
        }
        .navigationDestination(isPresented: Binding(get: { demoDetail != nil }, set: { if !$0 { demoDetail = nil } })) {
            OrgSettingsWebhookDetailView(id: demoDetail ?? "", canManage: canManage) {}
        }
        .task {
            await webhooks.load(env)
            #if DEBUG
            OrgSettingsDemo.open("webhook") { demoDetail = all.first?.recordID }
            #endif
        }
    }

    private func row(_ webhook: JSONValue) -> some View {
        let active = webhook.orgBool("isActive", default: true)
        let events = webhook.orgArray("events").count
        return OrgSettingsRow(
            symbol: "point.3.connected.trianglepath.dotted", tone: active ? .info : .neutral,
            title: Self.host(webhook.orgText("url")),
            subtitle: [webhook.orgString("description"), "\(events) \(events == 1 ? "event" : "events")"].compactMap { $0 }.joined(separator: " · ")
        ) {
            HStack(spacing: 8) {
                LedgerStatus(text: active ? "Active" : "Paused", tone: active ? .positive : .neutral)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
    }

    /// "https://hooks.acme.com/dubbl" -> "hooks.acme.com/dubbl"
    static func host(_ url: String) -> String {
        url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }
}

/// One endpoint: its events, signing secret, test sends and deliveries.
struct OrgSettingsWebhookDetailView: View {
    let id: String
    let canManage: Bool
    let onChange: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var webhook: OrgSettingsResource
    @State private var deliveries: OrgSettingsResource
    @State private var editing = false
    @State private var revealSecret = false
    @State private var testing = false
    @State private var confirmation: OrgSettingsConfirmation?

    init(id: String, canManage: Bool, onChange: @escaping () -> Void) {
        self.id = id
        self.canManage = canManage
        self.onChange = onChange
        _webhook = State(initialValue: OrgSettingsResource("webhooks/\(id)"))
        _deliveries = State(initialValue: OrgSettingsResource("webhooks/\(id)/deliveries", query: ["limit": "20"]))
    }

    private var value: JSONValue? { webhook.value?["webhook"] }

    var body: some View {
        OrgSettingsPage(loaded: webhook.isLoaded, error: webhook.error, reload: load) {
            if let value {
                endpoint(value)
                events(value)
                secret(value)
                recent
                if canManage {
                    OrgSettingsSection(nil) {
                        OrgSettingsButtonRow(title: "Delete endpoint", symbol: "trash", destructive: true) {
                            confirmation = OrgSettingsConfirmation(title: "Delete this endpoint?", message: "dubbl stops sending it events.", action: "Delete") {
                                if await OrgSettingsRun.run(env, "Endpoint deleted", { try await OrgSettingsAPI.send(env, .delete, "webhooks/\(id)") }) {
                                    onChange()
                                    dismiss()
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Endpoint")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage, value != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { editing = true }
                }
            }
        }
        .sheet(isPresented: $editing) {
            OrgSettingsWebhookSheet(webhook: value) { _ in
                Task { await load() }
                onChange()
            }
        }
        .orgSettingsConfirm($confirmation)
        .task { await load() }
    }

    private func endpoint(_ value: JSONValue) -> some View {
        let active = value.orgBool("isActive", default: true)
        return OrgSettingsSection(nil) {
            VStack(alignment: .leading, spacing: 6) {
                Text(value.orgText("url"))
                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                    .foregroundStyle(DTheme.ink)
                    .textSelection(.enabled)
                if let description = value.orgString("description") {
                    Text(description)
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            OrgSettingsToggle(title: "Sending events", isOn: Binding(get: { active }, set: { on in
                Task {
                    if await OrgSettingsRun.run(env, on ? "Endpoint resumed" : "Endpoint paused", { try await OrgSettingsAPI.send(env, .patch, "webhooks/\(id)", body: ["isActive": .bool(on)]) }) {
                        webhook.update { $0 = .object(["webhook": .object((value.objectValue ?? [:]).merging(["isActive": .bool(on)]) { $1 })]) }
                        onChange()
                    }
                }
            }), disabled: !canManage)
            if canManage {
                OrgSettingsButtonRow(title: "Send test event", symbol: "paperplane", working: testing) { Task { await test() } }
            }
        }
    }

    private func events(_ value: JSONValue) -> some View {
        let events = value.orgArray("events").compactMap(\.stringValue)
        return OrgSettingsSection("Events") {
            ForEach(events, id: \.self) { event in
                OrgSettingsRow(title: event, mono: true, chevron: false)
            }
        }
    }

    private func secret(_ value: JSONValue) -> some View {
        let secret = value.orgText("secret")
        return OrgSettingsSection("Signing secret", footer: "Check the X-Dubbl-Signature header with this secret to know a request came from dubbl.") {
            HStack(spacing: 12) {
                Text(revealSecret ? secret : String(repeating: "•", count: 24))
                    .font(.system(size: 13.5, design: .monospaced))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(revealSecret ? 3 : 1)
                    .textSelection(.enabled)
                Spacer(minLength: 8)
                Button(revealSecret ? "Hide" : "Show") { withAnimation(.snappy) { revealSecret.toggle() } }
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Button {
                    UIPasteboard.general.string = secret
                    env.toast.show("Secret copied")
                } label: {
                    Image(systemName: "doc.on.doc").font(.system(size: 15))
                }
                .foregroundStyle(DTheme.ink)
                .accessibilityLabel("Copy secret")
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
        }
    }

    @ViewBuilder
    private var recent: some View {
        let all = deliveries.value?.orgArray("data") ?? []
        OrgSettingsSection("Recent deliveries") {
            if all.isEmpty {
                Text("No deliveries yet.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            ForEach(all, id: \.recordID) { delivery in
                let status = delivery.orgText("status")
                let code = delivery.orgInt("responseStatus").map { "HTTP \($0)" }
                let attempts = delivery.orgInt("attempts").map { $0 > 1 ? "\($0) attempts" : nil } ?? nil
                OrgSettingsRow(title: delivery.orgText("event"), subtitle: [OrgSettingsFormat.moment(delivery.orgString("createdAt")), code, attempts].compactMap { $0 }.joined(separator: " · "), mono: true) {
                    LedgerStatus(text: status.humanized, tone: RecordFormat.tone(status, spec: nil))
                }
            }
        }
    }

    private func test() async {
        testing = true
        defer { testing = false }
        do {
            let response = try await OrgSettingsAPI.send(env, .post, "webhooks/\(id)/test")
            let status = response.orgString("delivery.status")
            if status == "failed" {
                env.toast.show("Test failed\(response.orgInt("delivery.responseStatus").map { " (HTTP \($0))" } ?? "")", isError: true)
            } else {
                env.toast.show("Test event sent")
            }
            await deliveries.load(env)
        } catch {
            env.toast.error(error)
        }
    }

    private func load() async {
        async let a: Void = webhook.load(env)
        async let b: Void = deliveries.load(env)
        _ = await (a, b)
    }
}

/// Add or edit an endpoint: URL, a note and the events to send.
struct OrgSettingsWebhookSheet: View {
    let webhook: JSONValue?
    let onDone: (JSONValue) -> Void

    @Environment(AppEnvironment.self) private var env
    @State private var url: String
    @State private var note: String
    @State private var events: Set<String>

    init(webhook: JSONValue?, onDone: @escaping (JSONValue) -> Void) {
        self.webhook = webhook
        self.onDone = onDone
        _url = State(initialValue: webhook?.orgText("url") ?? "https://")
        _note = State(initialValue: webhook?.orgText("description") ?? "")
        _events = State(initialValue: Set((webhook?.orgArray("events") ?? []).compactMap(\.stringValue)))
    }

    private var valid: Bool {
        guard let parsed = URL(string: url.trimmingCharacters(in: .whitespaces)), let scheme = parsed.scheme, ["http", "https"].contains(scheme), parsed.host() != nil else { return false }
        return !events.isEmpty
    }

    var body: some View {
        OrgSettingsFormSheet(title: webhook == nil ? "Add endpoint" : "Edit endpoint", saveTitle: webhook == nil ? "Add" : "Save", canSave: valid) {
            let body: [String: JSONValue] = [
                "url": .string(url.trimmingCharacters(in: .whitespaces)),
                "description": OrgJSON.text(note),
                "events": OrgJSON.strings(events.sorted()),
            ]
            let response: JSONValue
            if let id = webhook?.recordID {
                response = try await OrgSettingsAPI.send(env, .patch, "webhooks/\(id)", body: body)
            } else {
                response = try await OrgSettingsAPI.send(env, .post, "webhooks", body: body)
            }
            env.toast.show(webhook == nil ? "Endpoint added" : "Endpoint saved")
            onDone(response)
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "URL", text: $url, prompt: "https://", keyboard: .URL, content: .URL, capitalization: .never, mono: true)
                OrgSettingsField(label: "Description", text: $note, prompt: "What this endpoint does")
            }
            ForEach(OrgSettingsWebhooksView.eventGroups, id: \.label) { group in
                OrgSettingsSection(group.label) {
                    ForEach(group.events, id: \.self) { event in
                        Toggle(isOn: Binding(get: { events.contains(event) }, set: { if $0 { events.insert(event) } else { events.remove(event) } })) {
                            Text(event)
                                .font(.system(size: 15, design: .monospaced))
                                .foregroundStyle(DTheme.ink)
                        }
                        .tint(DTheme.positive)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 48)
                    }
                }
            }
        }
    }
}
