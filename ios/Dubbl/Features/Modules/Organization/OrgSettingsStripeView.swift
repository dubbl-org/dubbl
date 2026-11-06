import SwiftUI

/// /settings/integrations/stripe: connected Stripe accounts whose charges,
/// fees and payouts flow into the books. Sync, map accounts and disconnect
/// natively; connecting a new account is Stripe's own OAuth page in Safari.
struct OrgSettingsStripeView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var status = OrgSettingsResource("integrations/stripe/status")
    @State private var connecting = false
    @State private var demoDetail: JSONValue?

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var integrations: [JSONValue] { status.value?.orgArray("integrations") ?? [] }

    /// Stripe isn't configured on self-hosted servers without keys.
    private var unavailable: Bool { status.error?.localizedCaseInsensitiveContains("not configured") == true }

    var body: some View {
        OrgSettingsPage(loaded: status.isLoaded || unavailable, error: status.error, reload: { await status.load(env) }) {
            if unavailable {
                EmptyStateView(symbol: "creditcard.trianglebadge.exclamationmark", title: "Stripe isn't set up", message: "This server has no Stripe keys, so the integration is off.")
                    .dubblCard()
            } else {
                if integrations.isEmpty {
                    EmptyStateView(
                        symbol: "creditcard.and.123", title: "Connect Stripe",
                        message: "Card payments, fees and payouts post to your books and reconcile themselves."
                    )
                    .dubblCard()
                } else {
                    OrgSettingsSection("Connected accounts", inset: 58) {
                        ForEach(integrations, id: \.recordID) { integration in
                            NavigationLink {
                                OrgSettingsStripeDetailView(integration: integration, canManage: canManage) { Task { await status.load(env) } }
                            } label: {
                                row(integration)
                            }
                            .buttonStyle(RowPressStyle())
                        }
                    }
                }
                if canManage {
                    OrgSettingsSection(nil, footer: "Stripe asks you to sign in and approve access in Safari, then sends you back to dubbl.") {
                        OrgSettingsButtonRow(title: integrations.isEmpty ? "Connect a Stripe account" : "Connect another account", symbol: "plus", working: connecting) {
                            Task { await connect() }
                        }
                    }
                }
            }
        }
        .navigationTitle("Stripe")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: Binding(get: { demoDetail != nil }, set: { if !$0 { demoDetail = nil } })) {
            if let demoDetail { OrgSettingsStripeDetailView(integration: demoDetail, canManage: canManage) {} }
        }
        .task {
            await status.load(env)
            #if DEBUG
            OrgSettingsDemo.open("stripe") { demoDetail = integrations.first }
            #endif
        }
    }

    private func row(_ integration: JSONValue) -> some View {
        let healthy = integration.orgBool("healthy", default: true)
        let state = integration.orgString("status") ?? "active"
        let synced = integration.orgString("lastSyncAt").map { "synced \(DubblDate.relative($0).lowercased())" } ?? "not synced yet"
        return OrgSettingsRow(
            symbol: "creditcard", tone: healthy ? .special : .negative,
            title: integration.orgString("displayName") ?? integration.orgText("label"),
            subtitle: [integration.orgBool("livemode") ? "Live" : "Test mode", synced].joined(separator: " · ")
        ) {
            HStack(spacing: 8) {
                LedgerStatus(text: healthy ? state.humanized : "Needs attention", tone: healthy ? RecordFormat.tone(state, spec: nil) : .negative)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
    }

    private func connect() async {
        connecting = true
        defer { connecting = false }
        do {
            let response = try await OrgSettingsAPI.get(env, "integrations/stripe/connect", query: ["label": integrations.isEmpty ? "Default" : "Account \(integrations.count + 1)"])
            if let link = response.orgString("url"), let url = URL(string: link) { openURL(url) }
        } catch {
            env.toast.error(error)
        }
    }
}

/// One connected account: health, sync, the accounts it posts to and its log.
struct OrgSettingsStripeDetailView: View {
    let integration: JSONValue
    let canManage: Bool
    let onChange: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var detail: OrgSettingsResource
    @State private var accounts = OrgSettingsResource("accounts")
    @State private var banks = OrgSettingsResource("bank-accounts")
    @State private var syncing = false
    @State private var confirmation: OrgSettingsConfirmation?

    init(integration: JSONValue, canManage: Bool, onChange: @escaping () -> Void) {
        self.integration = integration
        self.canManage = canManage
        self.onChange = onChange
        _detail = State(initialValue: OrgSettingsResource("integrations/stripe/status", query: ["integrationId": integration.recordID]))
    }

    private var id: String { integration.recordID ?? "" }
    /// The single-integration answer, or the list row until it arrives.
    private var value: JSONValue { detail.value.flatMap { $0["id"] == nil ? nil : $0 } ?? integration }

    var body: some View {
        OrgSettingsPage(loaded: true, error: nil, reload: load) {
            summary
            mapping
            log
            if canManage {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Disconnect", symbol: "bolt.horizontal.circle", destructive: true) {
                        confirmation = OrgSettingsConfirmation(
                            title: "Disconnect \(value.orgString("displayName") ?? "this account")?",
                            message: "New Stripe activity stops flowing into your books. What's already posted stays.",
                            action: "Disconnect"
                        ) {
                            if await OrgSettingsRun.run(env, "Stripe disconnected", { try await OrgSettingsAPI.send(env, .post, "integrations/stripe/disconnect", body: ["integrationId": .string(id)]) }) {
                                onChange()
                                dismiss()
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(value.orgString("displayName") ?? "Stripe")
        .navigationBarTitleDisplayMode(.inline)
        .orgSettingsConfirm($confirmation)
        .task { await load() }
    }

    private var summary: some View {
        let healthy = value.orgBool("healthy", default: true)
        return OrgSettingsSection(nil, footer: value.orgString("healthError") ?? value.orgString("errorMessage")) {
            DetailRow("Account", value.orgText("stripeAccountId"))
            DetailRow("Mode", value.orgBool("livemode") ? "Live" : "Test")
            DetailRow(label: "Connection") {
                LedgerStatus(text: healthy ? "Healthy" : "Can't reach Stripe", tone: healthy ? .positive : .negative)
            }
            DetailRow("Last sync", value.orgString("lastSyncAt").map(OrgSettingsFormat.moment) ?? "Never")
            DetailRow("History imported", value.orgBool("initialSyncCompleted") ? "Last \(value.orgInt("initialSyncDays") ?? 90) days" : "In progress")
            if canManage {
                OrgSettingsButtonRow(title: "Sync now", symbol: "arrow.triangle.2.circlepath", working: syncing) { Task { await sync() } }
            }
        }
    }

    private var mapping: some View {
        let ledger = (accounts.value?.orgArray("accounts") ?? []).compactMap { account in
            account.recordID.map { OrgSettingsChoice(value: $0, label: account.orgText("name"), detail: [account.orgString("code"), account.orgString("type")?.humanized].compactMap { $0 }.joined(separator: " · ")) }
        }
        let bankChoices = OrgSettingsResource.rows(banks.value, key: "bankAccounts").compactMap { bank in
            bank.recordID.map { OrgSettingsChoice(value: $0, label: bank.orgString("accountName") ?? bank.orgText("name"), detail: bank.orgString("bankName")) }
        }
        return OrgSettingsSection("Posts to", footer: "Charges go to revenue through the clearing account, fees to fees and payouts to your bank.") {
            mappingRow("Clearing account", key: "clearingAccountId", choices: ledger)
            mappingRow("Revenue", key: "revenueAccountId", choices: ledger)
            mappingRow("Fees", key: "feesAccountId", choices: ledger)
            mappingRow("Payouts to", key: "payoutBankAccountId", choices: bankChoices)
        }
    }

    private func mappingRow(_ label: String, key: String, choices: [OrgSettingsChoice]) -> some View {
        OrgSettingsChoiceRow(
            label: label, title: label, choices: choices,
            selection: Binding(get: { value.orgString(key) }, set: { new in
                guard let new, new != value.orgString(key) else { return }
                Task {
                    if await OrgSettingsRun.run(env, "\(label) updated", { try await OrgSettingsAPI.send(env, .patch, "integrations/stripe/settings", body: ["integrationId": .string(id), key: .string(new)]) }) {
                        await detail.load(env)
                    }
                }
            }),
            disabled: !canManage
        )
    }

    @ViewBuilder
    private var log: some View {
        let logs = value.orgArray("syncLogs")
        if !logs.isEmpty {
            OrgSettingsSection("Recent activity") {
                ForEach(logs.prefix(12), id: \.recordID) { entry in
                    let status = entry.orgText("status")
                    OrgSettingsRow(
                        title: entry.orgText("eventType"),
                        subtitle: [OrgSettingsFormat.moment(entry.orgString("createdAt")), entry.orgString("errorMessage")].compactMap { $0 }.joined(separator: " · "),
                        mono: true
                    ) {
                        LedgerStatus(text: status.humanized, tone: RecordFormat.tone(status, spec: nil))
                    }
                }
            }
        }
    }

    private func sync() async {
        syncing = true
        defer { syncing = false }
        if await OrgSettingsRun.run(env, "Sync started", { try await OrgSettingsAPI.send(env, .post, "integrations/stripe/sync", body: ["integrationId": .string(id)]) }) {
            onChange()
        }
    }

    private func load() async {
        async let a: Void = detail.load(env)
        async let b: Void = accounts.load(env)
        async let c: Void = banks.load(env)
        _ = await (a, b, c)
    }
}

extension OrgSettingsResource {
    /// Rows under `key`, under `data`, or the only array in the response.
    static func rows(_ response: JSONValue?, key: String) -> [JSONValue] {
        guard let response else { return [] }
        return RecordListStore.rows(in: response, key: key)
    }
}
