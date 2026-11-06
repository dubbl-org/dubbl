import SwiftUI

/// Organization settings (general, members, roles, billing, automation, integrations, preferences, developer).
/// Every page is a native settings screen built in this folder (`OrgSettings…`).
@MainActor
enum OrganizationCatalog {
    static let specs: [RecordSpec] = []

    static let screens: [RecordScreen] = [
        screen("org-general", "/settings", "General") { OrgSettingsGeneralView() },
        screen("org-members", "/settings/members", "Members") { OrgSettingsMembersView() },
        screen("org-roles", "/settings/roles", "Roles") { OrgSettingsRolesView() },
        screen("org-billing", "/settings/billing", "Billing") { OrgSettingsBillingView() },
        screen("org-advisors", "/settings/advisors", "Advisors") { OrgSettingsAdvisorsView() },
        screen("org-templates", "/settings/document-templates", "Templates") { OrgSettingsTemplatesView() },
        screen("org-import-export", "/settings/import-export", "Import and export") { OrgSettingsImportExportView() },
        screen("org-trash", "/settings/trash", "Trash") { OrgSettingsTrashView() },
        screen("org-backups", "/settings/backups", "Backups") { OrgSettingsBackupsView() },
        screen("org-bank-rules", "/settings/bank-rules", "Bank rules") { OrgSettingsBankRulesView() },
        screen("org-approvals", "/settings/approval-workflows", "Approvals") { OrgSettingsApprovalsView() },
        screen("org-bill-matching", "/settings/procurement", "Bill matching") { OrgSettingsBillMatchingView() },
        screen("org-webhooks", "/settings/webhooks", "Webhooks") { OrgSettingsWebhooksView() },
        screen("org-stripe", "/settings/integrations/stripe", "Stripe") { OrgSettingsStripeView() },
        screen("org-email", "/settings/email", "Email sending") { OrgSettingsEmailView() },
        screen("org-reminders", "/settings/reminders", "Reminders") { OrgSettingsRemindersView() },
        screen("org-cost-centers", "/settings/cost-centers", "Cost centers") { OrgSettingsCostCentersView() },
        screen("org-tags", "/settings/tags", "Tags") { OrgSettingsTagsView() },
        screen("org-api-keys", "/settings/api-keys", "API keys") { OrgSettingsAPIKeysView() },
        screen("org-audit-log", "/settings/audit-log", "Audit log") { OrgSettingsAuditLogView() },
    ]

    private static func screen<V: View>(_ key: String, _ path: String, _ title: String, _ make: @escaping () -> V) -> RecordScreen {
        RecordScreen(key: key, webPath: path, title: title) { AnyView(make()) }
    }

    #if DEBUG
    nonisolated static let fixtures: [String: String] = OrgSettingsFixtures.all
    #endif
}
