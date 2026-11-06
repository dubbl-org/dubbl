import SwiftUI

/// /settings/billing: the plan, its renewal, usage against limits and the
/// plans to switch to. Switching an active subscription happens natively;
/// starting a new one hands only the card step to Stripe Checkout in Safari,
/// and invoices and payment methods live in Stripe's billing portal.
struct OrgSettingsBillingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var billing = OrgSettingsResource("billing")
    @State private var interval = "monthly"
    @State private var confirmation: OrgSettingsConfirmation?
    @State private var working: String?

    private var canManage: Bool { OrgSettingsAccess.allows(.owner, env) }
    private var summary: JSONValue? { billing.value?["billing"] }
    private var selfHosted: Bool { billing.value?.orgBool("selfHosted") ?? false }
    private var currentPlan: String { summary?.orgString("plan") ?? "free" }
    private var managedManually: Bool { summary?.orgString("managedBy") == "manual" }

    /// Plans as the web's pricing table lists them; USD per month, `annual`
    /// is the monthly equivalent when billed yearly.
    struct Plan {
        let key: String
        let name: String
        let monthly: Int
        let annual: Int
        let tagline: String
        let highlights: [String]
    }

    static let plans: [Plan] = [
        Plan(key: "free", name: "Free", monthly: 0, annual: 0, tagline: "Everything a one-person business needs.", highlights: ["1 user", "3 bank accounts", "Payroll for 2 employees"]),
        Plan(key: "standard", name: "Standard", monthly: 19, annual: 15, tagline: "For teams. One price, everyone included.", highlights: ["Unlimited users", "Multi-currency", "Payroll for 10 employees"]),
        Plan(key: "premium", name: "Premium", monthly: 49, annual: 39, tagline: "For growing businesses and groups.", highlights: ["Consolidation across 3 entities", "Payroll for 50 employees", "Priority support"]),
        Plan(key: "ultimate", name: "Ultimate", monthly: 99, annual: 79, tagline: "For large and multi-entity businesses.", highlights: ["Unlimited entities", "Unlimited payroll", "Priority onboarding"]),
    ]

    var body: some View {
        OrgSettingsPage(loaded: billing.isLoaded, error: billing.error, reload: load) {
            if let summary {
                hero(summary)
                if selfHosted {
                    OrgSettingsNotice(symbol: "server.rack", text: "This server runs without billing, so every plan limit is lifted.", tone: .positive)
                }
                usage(summary)
                if !selfHosted {
                    plans
                    portal
                }
            }
        }
        .navigationTitle("Billing")
        .navigationBarTitleDisplayMode(.inline)
        .orgSettingsConfirm($confirmation)
        .task { await load() }
    }

    // MARK: Plan

    private func hero(_ summary: JSONValue) -> some View {
        let status = summary.orgString("status") ?? "active"
        let renews = summary.orgString("currentPeriodEnd").map(DubblDate.display)
        let cancelling = summary.orgBool("cancelAtPeriodEnd")
        let line: String = {
            if selfHosted { return "Self-hosted" }
            if currentPlan == "free" { return "Free forever" }
            let billed = summary.orgString("billingInterval") == "annual" ? "Billed yearly" : "Billed monthly"
            guard let renews else { return billed }
            return "\(billed) · \(cancelling ? "ends" : "renews") \(renews)"
        }()
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("Current plan")
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                Spacer()
                StatusPill(text: cancelling ? "Cancels at period end" : status.humanized, tone: cancelling ? .warning : RecordFormat.tone(status, spec: nil))
            }
            Text(summary.orgString("planName") ?? currentPlan.humanized)
                .displayFont(30)
                .foregroundStyle(DTheme.ink)
            Text(line)
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .dubblCard(padding: 18)
    }

    private func usage(_ summary: JSONValue) -> some View {
        OrgSettingsSection("Usage") {
            meter("Members", "members")
            meter("Payroll employees", "employees")
            meter("Bank accounts", "bankAccounts")
            meter("Projects", "projects")
            meter("Storage", "storageBytes", format: OrgSettingsFormat.bytes)
            meter("Emails this month", "emailsThisMonth")
        }
    }

    private func meter(_ label: String, _ key: String, format: @escaping (Int) -> String = { $0.formatted() }) -> some View {
        OrgSettingsMeter(label: label, used: summary?.orgInt("usage.\(key).used") ?? 0, max: summary?.orgInt("usage.\(key).max"), format: format)
    }

    // MARK: Switching

    @ViewBuilder
    private var plans: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Plans")
            ChipRow(options: [("monthly", "Monthly", nil), ("annual", "Yearly · save 20%", nil)], selection: $interval)
                .padding(.horizontal, -16)
            CardStack {
                ForEach(Self.plans, id: \.key) { plan in planRow(plan) }
            }
            Text(footnote)
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkTertiary)
                .padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var footnote: String {
        if managedManually { return "This plan is managed by the dubbl team. Contact support to change it." }
        if !canManage { return OrgSettingsLevel.owner.readOnlyMessage }
        return "Prices are per organization in USD, with every user included. A new subscription opens Stripe Checkout in Safari to add a card."
    }

    private func planRow(_ plan: Plan) -> some View {
        let isCurrent = plan.key == currentPlan
        let price = interval == "annual" ? plan.annual : plan.monthly
        return Button { choose(plan) } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(plan.name)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(DTheme.ink)
                        if isCurrent { StatusPill(text: "Current", tone: .positive) }
                    }
                    Text(plan.tagline)
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                    Text(plan.highlights.joined(separator: " · "))
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    if working == plan.key {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(price == 0 ? "$0" : "$\(price)")
                            .font(.system(size: 20, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                        Text("a month")
                            .font(.system(size: 12))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
            }
            .padding(16)
            .background(isCurrent ? DTheme.tint : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .disabled(!canManage || managedManually || isCurrent || working != nil)
    }

    private func choose(_ plan: Plan) {
        if plan.key == "free" {
            confirmation = OrgSettingsConfirmation(
                title: "Move to the Free plan?",
                message: "Cancel your subscription in Stripe's billing portal. You keep your plan until the end of the period.",
                action: "Open billing portal", destructive: false
            ) { await openPortal() }
            return
        }
        let price = interval == "annual" ? plan.annual : plan.monthly
        let switching = summary?.orgBool("hasStripeSubscription") == true && ["active", "trialing"].contains(summary?.orgString("status") ?? "")
        confirmation = OrgSettingsConfirmation(
            title: "Switch to \(plan.name) for $\(price) a month?",
            message: switching
                ? "Your subscription changes now and the difference is prorated."
                : "Stripe Checkout opens in Safari to add a card. Come back here when you're done.",
            action: switching ? "Switch plan" : "Continue to checkout", destructive: false
        ) { await checkout(plan) }
    }

    private func checkout(_ plan: Plan) async {
        working = plan.key
        defer { working = nil }
        do {
            let response = try await OrgSettingsAPI.send(env, .post, "billing/checkout", body: ["plan": .string(plan.key), "interval": .string(interval)])
            if let link = response.orgString("url"), let url = URL(string: link) {
                openURL(url)
            } else {
                env.toast.show("You're on \(plan.name)")
                await load()
                await env.session.refreshIdentity()
            }
        } catch {
            env.toast.error(error)
        }
    }

    // MARK: Portal

    @ViewBuilder
    private var portal: some View {
        if canManage, summary?.orgBool("hasStripeSubscription") == true {
            OrgSettingsSection("Payments", footer: "Invoices, receipts and your card are kept by Stripe and open in Safari.") {
                Button { Task { await openPortal() } } label: {
                    OrgSettingsRow(symbol: "doc.text", title: "Invoices and payment method") {
                        if working == "portal" {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                }
                .buttonStyle(RowPressStyle())
            }
        }
    }

    private func openPortal() async {
        working = "portal"
        defer { working = nil }
        do {
            let response = try await OrgSettingsAPI.send(env, .post, "billing/portal")
            if let link = response.orgString("url"), let url = URL(string: link) { openURL(url) }
        } catch {
            env.toast.error(error)
        }
    }

    private func load() async {
        await billing.load(env)
        if let current = summary?.orgString("billingInterval"), working == nil { interval = current }
    }
}
