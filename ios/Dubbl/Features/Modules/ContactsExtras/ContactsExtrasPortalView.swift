import SwiftUI
import UIKit

/// Customer portal links: who has one, when it expires, how much they use
/// it, and what they've been looking at. Share or revoke a link from its row;
/// invite someone new from the toolbar.
struct ContactsExtrasPortalView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var links = ContactsExtrasRemote()
    @State private var activity = ContactsExtrasRemote()
    @State private var showInactive = false
    @State private var inviting = false
    @State private var revoking: JSONValue?

    private var all: [JSONValue] { links.value?["data"]?.arrayValue ?? [] }
    private var rows: [JSONValue] {
        all.filter { showInactive || $0["status"]?.stringValue == "active" }
    }

    var body: some View {
        ContactsExtrasLoadState(value: links.value, error: links.error, retry: load) { _ in
            List {
                let active = all.filter { $0["status"]?.stringValue == "active" }
                LedgerTotals(items: [
                    .init(label: "Live links", value: "\(active.count)", detail: "\(Set(active.compactMap { $0["contactId"]?.stringValue }).count) customers", tint: DTheme.positive),
                    .init(label: "Visits", value: "\(active.reduce(0) { $0 + ($1["activityCount"]?.intValue ?? 0) })", detail: "on live links", tint: DTheme.accent),
                ])
                .padding(.vertical, 14)
                .ledgerRow()
                Section {
                    ForEach(rows, id: \.self) { row in
                        ContactsExtrasPortalRow(row: row)
                            .ledgerRow()
                            .swipeActions(edge: .trailing) {
                                if row["status"]?.stringValue == "active" {
                                    Button("Revoke", systemImage: "xmark.circle", role: .destructive) { revoking = row }
                                }
                            }
                            .contextMenu { menu(row) }
                    }
                } header: {
                    header("Links")
                }
                let events = activity.value?["data"]?.arrayValue ?? []
                if !events.isEmpty {
                    Section {
                        ForEach(Array(events.prefix(20).enumerated()), id: \.offset) { _, event in
                            ContactsExtrasPortalEventRow(event: event)
                                .ledgerRow()
                        }
                    } header: {
                        header("Recent activity")
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
            .overlay {
                if all.isEmpty {
                    EmptyStateView(symbol: "globe", title: "No portal links yet", message: "Give a customer a private page to see their invoices, statements and quotes, and pay online.", actionTitle: "Invite a customer") { inviting = true }
                        .background(DTheme.canvas)
                }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Customer portal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Toggle("Show revoked and expired", isOn: $showInactive)
                } label: {
                    Image(systemName: showInactive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease")
                }
                .accessibilityLabel("Filter links")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Invite a customer", systemImage: "plus") { inviting = true }
            }
        }
        .confirmationDialog("Revoke \(revoking?["contactName"]?.stringValue ?? "this")'s link?", isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }), titleVisibility: .visible, presenting: revoking) { row in
            Button("Revoke link", role: .destructive) { Task { await revoke(row) } }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("The link stops working straight away. You can send a new one any time.")
        }
        .sheet(isPresented: $inviting) {
            ContactsExtrasInviteSheet { Task { await load() } }
        }
        .task { await load() }
    }

    private func header(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13.5, weight: .semibold))
            .foregroundStyle(DTheme.ink)
            .padding(.vertical, 4)
    }

    @ViewBuilder
    private func menu(_ row: JSONValue) -> some View {
        if let url = Self.url(row) {
            Button("Copy link", systemImage: "doc.on.doc") {
                UIPasteboard.general.url = url
                env.toast.show("Link copied")
            }
            ShareLink(item: url) {
                Label("Share link", systemImage: "square.and.arrow.up")
            }
        }
        if row["status"]?.stringValue == "active" {
            Button("Revoke", systemImage: "xmark.circle", role: .destructive) { revoking = row }
        }
    }

    static func url(_ row: JSONValue) -> URL? {
        (row["portalUrl"]?.stringValue).flatMap(AppConfig.webURL)
    }

    private func load() async {
        async let list: Void = links.load(env.api, "portal/access", query: ["status": "all"])
        async let events: Void = activity.load(env.api, "portal/activity", query: ["limit": "30"])
        _ = await (list, events)
    }

    private func revoke(_ row: JSONValue) async {
        guard let id = row.recordID else { return }
        do {
            let _: JSONValue = try await env.api.delete("portal/access/\(id)")
            env.toast.show("Link revoked")
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// "Acme Corp · Expires 12 Nov · 14 visits, last 2d ago   [share]  Active"
struct ContactsExtrasPortalRow: View {
    let row: JSONValue

    var body: some View {
        let name = row["contactName"]?.stringValue ?? "Customer"
        let status = row["status"]?.stringValue ?? "active"
        let visits = row["activityCount"]?.intValue ?? 0
        HStack(spacing: 12) {
            Avatar(name: name, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(status == "active" ? DTheme.ink : DTheme.inkSecondary)
                    .lineLimit(1)
                Text(detail(status: status, visits: visits))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if status == "active", let url = ContactsExtrasPortalView.url(row) {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .frame(width: 34, height: 34)
                        .background(DTheme.tint, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Share \(name)'s link")
            }
            LedgerStatus(text: status.humanized, tone: status == "active" ? .positive : (status == "expired" ? .warning : .neutral))
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func detail(status: String, visits: Int) -> String {
        var parts: [String] = []
        switch status {
        case "revoked": parts.append("Revoked \(DubblDate.short(row["revokedAt"]?.stringValue))")
        case "expired": parts.append("Expired \(DubblDate.short(row["expiresAt"]?.stringValue))")
        default:
            if let expires = row["expiresAt"]?.stringValue { parts.append("Expires \(DubblDate.short(expires))") } else { parts.append("Never expires") }
        }
        if visits > 0 {
            parts.append("\(visits) \(visits == 1 ? "visit" : "visits")\(row["lastActivityAt"]?.stringValue.map { ", last \(DubblDate.relative($0).lowercased())" } ?? "")")
        } else {
            parts.append("Not opened yet")
        }
        return parts.joined(separator: " · ")
    }
}

/// "Acme Corp looked at their invoices · 2h ago"
struct ContactsExtrasPortalEventRow: View {
    let event: JSONValue

    static func label(_ action: String) -> String {
        [
            "view_portal": "Opened their portal", "view_invoices": "Looked at their invoices", "approve_quote": "Accepted a quote",
            "accept_quote": "Accepted a quote", "view_statements": "Looked at their statement", "view_payments": "Looked at their payments",
        ][action] ?? action.humanized
    }

    var body: some View {
        let action = event["action"]?.stringValue ?? ""
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: action.contains("quote") ? "checkmark.seal" : (action.contains("invoice") ? "doc.text" : "eye"))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(action.contains("quote") ? DTheme.positive : DTheme.inkSecondary)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(event["contactName"]?.stringValue ?? "Customer")
                    .font(.system(size: 14.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Text(Self.label(action))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer()
            Text(DubblDate.relative(event["createdAt"]?.stringValue))
                .font(.system(size: 12.5))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.vertical, 10)
    }
}

/// Make a portal link for a customer and send or share it.
struct ContactsExtrasInviteSheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var customer: ContactsExtrasContactRef?
    @State private var days = 30
    @State private var sendEmail = true
    @State private var message = ""
    @State private var saving = false
    @State private var error: String?
    @State private var created: URL?
    @State private var emailNote: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let created {
                    done(created)
                } else {
                    form
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle(created == nil ? "Invite to portal" : "Link ready")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if created == nil {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", role: .cancel) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            Task { await save() }
                        } label: {
                            if saving { ProgressView() } else { Text(sendEmail ? "Send" : "Create") }
                        }
                        .disabled(customer == nil || saving)
                    }
                } else {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 22) {
            CardStack {
                ContactsExtrasContactField(label: "Customer", type: "customer", contact: $customer)
            }
            CardStack {
                HStack {
                    Text("Link works for")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.ink)
                    Spacer()
                    Picker("Link works for", selection: $days) {
                        ForEach([7, 14, 30, 90, 365], id: \.self) { value in
                            Text(value == 365 ? "A year" : "\(value) days").tag(value)
                        }
                    }
                    .labelsHidden()
                    .tint(DTheme.inkSecondary)
                }
                .padding(.leading, 16)
                .padding(.trailing, 6)
                .frame(minHeight: 50)
                Toggle(isOn: $sendEmail) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Email the link")
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                        Text(customer?.email.map { "To \($0)" } ?? (customer == nil ? "Uses your workspace's email settings." : "This customer has no email; share the link instead."))
                            .font(.system(size: 12.5))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                if sendEmail {
                    FieldRow(label: "Message") {
                        TextField("Optional note to include", text: $message, axis: .vertical)
                            .lineLimit(2 ... 5)
                    }
                }
            }
            Text("They'll see their invoices, statements and quotes, and can pay online. Nothing else in your books is shared.")
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkSecondary)
                .padding(.horizontal, 4)
            if let error {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.negative)
                    .padding(.horizontal, 4)
            }
        }
        .padding(20)
        .animation(.snappy, value: sendEmail)
    }

    private func done(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(DTheme.positive)
                Text(customer?.name ?? "Customer")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                Text(emailNote ?? "Share the link with them.")
                    .font(.system(size: 14.5))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Text(url.absoluteString)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(DTheme.inkSecondary)
                .lineLimit(2)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .dubblCard(padding: 14, radius: 16)
            HStack(spacing: 10) {
                Button {
                    UIPasteboard.general.url = url
                    env.toast.show("Link copied")
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                ShareLink(item: url) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            }
        }
        .padding(20)
    }

    private func save() async {
        guard let customer else { return }
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [
            "contactId": .string(customer.id),
            "expiresInDays": .number(Double(days)),
            "sendEmail": .bool(sendEmail && customer.email != nil),
        ]
        let note = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if sendEmail, !note.isEmpty { body["message"] = .string(note) }
        do {
            let response: JSONValue = try await env.api.post("portal/invite", body: body)
            let link = response["url"]?.stringValue.flatMap(URL.init(string:)) ?? response["portalUrl"]?.stringValue.flatMap(AppConfig.webURL)
            if response["emailed"]?.boolValue == true {
                emailNote = "Emailed to \(customer.email ?? "them"). You can share it too."
            } else if let failure = response["emailError"]?.stringValue {
                emailNote = "Couldn't email it: \(failure)"
            }
            onDone()
            withAnimation(.snappy) { created = link ?? AppConfig.webURL("/portal") }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
