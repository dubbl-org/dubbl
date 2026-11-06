import SwiftUI

/// /settings/api-keys: keys for the dubbl API and MCP. A new key's secret is
/// shown exactly once, to copy; after that only its prefix is kept. Owners
/// and admins create and revoke keys.
struct OrgSettingsAPIKeysView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var keys = OrgSettingsResource("api-keys")
    @State private var creating = false
    @State private var created: OrgSettingsNewKey?
    /// Held until the create sheet has gone, then revealed in its own sheet.
    @State private var pending: OrgSettingsNewKey?
    @State private var confirmation: OrgSettingsConfirmation?

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { keys.value?.orgArray("keys") ?? [] }
    private var maxKeys: Int { keys.value?.orgInt("maxKeys") ?? 20 }
    private var hasAccess: Bool { keys.value?.orgBool("apiAccess", default: true) ?? true }

    var body: some View {
        Group {
            if canManage {
                OrgSettingsPage(loaded: keys.isLoaded, error: keys.error, reload: { await keys.load(env) }) {
                    if !hasAccess {
                        OrgSettingsNotice(symbol: "sparkles", text: "Your plan doesn't include API access.", tone: .warning)
                    }
                    if all.isEmpty {
                        EmptyStateView(
                            symbol: "key", title: "No API keys yet",
                            message: "Connect scripts, Zapier or an AI agent over MCP.",
                            actionTitle: hasAccess ? "Create key" : nil, action: { creating = true }
                        )
                        .dubblCard()
                    } else {
                        OrgSettingsSection("\(all.count) of \(maxKeys) keys", footer: "Touch and hold a key to revoke it. Anything using it stops working straight away.", inset: 58) {
                            ForEach(all, id: \.recordID) { key in row(key) }
                        }
                    }
                }
            } else {
                EmptyStateView(symbol: "lock", title: "Admins only", message: "Ask an owner or admin to create an API key.")
                    .frame(maxHeight: .infinity)
                    .background(DTheme.shell)
            }
        }
        .navigationTitle("API keys")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage, hasAccess {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Create key", systemImage: "plus") { creating = true }
                        .disabled(all.count >= maxKeys)
                }
            }
        }
        .sheet(isPresented: $creating, onDismiss: {
            created = pending
            pending = nil
        }) {
            OrgSettingsCreateKeySheet { key in
                pending = key
                Task { await keys.load(env) }
            }
        }
        .sheet(item: $created) { key in
            OrgSettingsKeyRevealSheet(key: key)
        }
        .orgSettingsConfirm($confirmation)
        .task {
            if canManage { await keys.load(env) }
            #if DEBUG
            OrgSettingsDemo.open("key") { created = OrgSettingsNewKey(id: "demo-key-4", name: "Zapier (new)", secret: "dk_live_Qz8rT2vN6mK4pX9wL1sD7fH3jB5cA0eY") }
            #endif
        }
    }

    private func row(_ key: JSONValue) -> some View {
        let expires = key.orgString("expiresAt")
        let expired = DubblDate.parseMoment(expires).map { $0 < .now } ?? false
        let used = key.orgString("lastUsedAt").map { "used \(DubblDate.relative($0).lowercased())" } ?? "never used"
        return OrgSettingsRow(
            symbol: "key", tone: expired ? .negative : .neutral,
            title: key.orgText("name"),
            subtitle: ["\(key.orgText("keyPrefix"))…", used, expires.map { (expired ? "expired " : "expires ") + DubblDate.short($0) }].compactMap { $0 }.joined(separator: " · ")
        ) {
            if expired { LedgerStatus(text: "Expired", tone: .negative) }
        }
        .contextMenu {
            if let id = key.recordID {
                Button("Revoke key", systemImage: "xmark.circle", role: .destructive) {
                    confirmation = OrgSettingsConfirmation(title: "Revoke \(key.orgText("name"))?", message: "Apps using this key lose access immediately.", action: "Revoke") {
                        if await OrgSettingsRun.run(env, "Key revoked", { try await OrgSettingsAPI.send(env, .delete, "api-keys/\(id)") }) {
                            await keys.load(env)
                        }
                    }
                }
            }
        }
    }
}

/// A freshly created key, with its secret.
struct OrgSettingsNewKey: Identifiable {
    let id: String
    let name: String
    let secret: String
}

/// Name a key and choose when it expires.
struct OrgSettingsCreateKeySheet: View {
    let onCreate: (OrgSettingsNewKey) -> Void
    @Environment(AppEnvironment.self) private var env
    @State private var name = ""
    @State private var expiry = 0

    var body: some View {
        OrgSettingsFormSheet(title: "New API key", saveTitle: "Create", canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty) {
            var body: [String: JSONValue] = ["name": .string(name.trimmingCharacters(in: .whitespaces))]
            if expiry > 0, let date = Calendar.current.date(byAdding: .day, value: expiry, to: .now) {
                body["expiresAt"] = .string(date.formatted(.iso8601))
            }
            let response = try await OrgSettingsAPI.send(env, .post, "api-keys", body: body)
            guard let secret = response.orgString("plainKey") else { throw APIError.decoding(URLError(.cannotParseResponse)) }
            onCreate(OrgSettingsNewKey(id: response.orgString("key.id") ?? UUID().uuidString, name: response.orgString("key.name") ?? name, secret: secret))
        } content: {
            OrgSettingsSection(nil, footer: "Keys act with full access to this organization. Give each app its own key.") {
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. Zapier", capitalization: .words)
                OrgSettingsPicker(label: "Expires", selection: $expiry, options: [(0, "Never"), (30, "In 30 days"), (90, "In 90 days"), (365, "In a year")])
            }
        }
        .presentationDetents([.medium])
    }
}

/// Shows a new key once, to copy or share.
struct OrgSettingsKeyRevealSheet: View {
    let key: OrgSettingsNewKey
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env
    @State private var copied = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                OrgSettingsNotice(symbol: "exclamationmark.triangle.fill", text: "Copy this key now. You won't be able to see it again.", tone: .warning)
                VStack(alignment: .leading, spacing: 10) {
                    Text(key.name)
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                    Text(key.secret)
                        .font(.system(size: 15, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.ink)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                HStack(spacing: 10) {
                    Button {
                        UIPasteboard.general.string = key.secret
                        copied = true
                        env.toast.show("Key copied")
                    } label: {
                        Label(copied ? "Copied" : "Copy key", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(InkButtonStyle(fullWidth: true))
                    ShareLink(item: key.secret) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .buttonStyle(SoftButtonStyle())
                }
                Spacer()
            }
            .padding(20)
            .background(DTheme.shell)
            .navigationTitle("Your new key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
        .interactiveDismissDisabled(!copied)
    }
}
