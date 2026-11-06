import SwiftUI

/// /settings/backups: scheduled and manual snapshots of the books. Admins
/// take and download snapshots; only the owner restores one (current data is
/// snapshotted first) or deletes it.
struct OrgSettingsBackupsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var backups = OrgSettingsResource("backups", query: ["limit": "50"])
    @State private var creating = false
    @State private var working: String?
    @State private var confirmation: OrgSettingsConfirmation?
    @State private var file: OrgSettingsFile?

    private var canView: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var isOwner: Bool { OrgSettingsAccess.allows(.owner, env) }
    private var all: [JSONValue] { backups.value?.orgArray("data") ?? [] }

    var body: some View {
        Group {
            if canView {
                OrgSettingsPage(loaded: backups.isLoaded, error: backups.error, reload: { await backups.load(env) }) {
                    summary
                    if all.isEmpty {
                        EmptyStateView(symbol: "externaldrive", title: "No backups yet", message: "Take a snapshot before big changes, or let the scheduled ones run.")
                            .dubblCard()
                    } else {
                        OrgSettingsSection("Snapshots", footer: "Touch and hold a snapshot to download, restore or delete it.", inset: 58) {
                            ForEach(all, id: \.recordID) { backup in row(backup) }
                        }
                    }
                }
            } else {
                EmptyStateView(symbol: "lock", title: "Admins only", message: OrgSettingsLevel.admin.readOnlyMessage)
                    .frame(maxHeight: .infinity)
                    .background(DTheme.shell)
            }
        }
        .navigationTitle("Backups")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canView {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await create() } } label: {
                        if creating { ProgressView() } else { Label("Back up now", systemImage: "plus") }
                    }
                    .disabled(creating)
                }
            }
        }
        .orgSettingsConfirm($confirmation)
        .orgSettingsPreview($file)
        .task { if canView { await backups.load(env) } }
    }

    @ViewBuilder
    private var summary: some View {
        if let latest = all.first(where: { $0.orgString("status") == "completed" }) {
            LedgerTotals(items: [
                .init(label: "Last backup", value: DubblDate.relative(latest.orgString("createdAt")), detail: DubblDate.display(latest.orgString("createdAt")), tint: DTheme.positive),
                .init(label: "Snapshots", value: "\(backups.value?.orgInt("total") ?? all.count)", detail: OrgSettingsFormat.bytes(all.reduce(0) { $0 + ($1.orgInt("sizeBytes") ?? 0) })),
            ])
            .padding(16)
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func row(_ backup: JSONValue) -> some View {
        let status = backup.orgText("status")
        let type = backup.orgText("type")
        let counts = backup["entityCounts"]?.objectValue?.values.compactMap(\.intValue).reduce(0, +)
        let expires = backup.orgString("expiresAt").map { "kept until \(DubblDate.short($0))" }
        return OrgSettingsRow(
            symbol: type == "scheduled" ? "clock.arrow.circlepath" : type == "uploaded" ? "square.and.arrow.up" : "hand.tap",
            title: OrgSettingsFormat.moment(backup.orgString("createdAt")),
            subtitle: [type.humanized, backup.orgInt("sizeBytes").map(OrgSettingsFormat.bytes), counts.map { "\($0.formatted()) records" }, expires].compactMap { $0 }.joined(separator: " · ")
        ) {
            if working == backup.recordID {
                ProgressView().controlSize(.small)
            } else {
                LedgerStatus(text: status.humanized, tone: RecordFormat.tone(status == "completed" ? "success" : status, spec: nil))
            }
        }
        .contextMenu {
            if let id = backup.recordID, status == "completed" {
                Button("Download", systemImage: "arrow.down.circle") { Task { await download(id) } }
                if isOwner {
                    Button("Restore", systemImage: "arrow.counterclockwise") { confirmRestore(backup, id: id) }
                }
            }
            if isOwner, let id = backup.recordID {
                Button("Delete", systemImage: "trash", role: .destructive) {
                    confirmation = OrgSettingsConfirmation(title: "Delete this backup?", message: "It moves to the trash for 30 days.", action: "Delete") {
                        if await OrgSettingsRun.run(env, "Backup deleted", { try await OrgSettingsAPI.send(env, .delete, "backups/\(id)") }) {
                            await backups.load(env)
                        }
                    }
                }
            }
        }
    }

    // MARK: Actions

    private func create() async {
        creating = true
        defer { creating = false }
        if await OrgSettingsRun.run(env, "Backup taken", { try await OrgSettingsAPI.send(env, .post, "backups") }) {
            await backups.load(env)
        }
    }

    private func confirmRestore(_ backup: JSONValue, id: String) {
        confirmation = OrgSettingsConfirmation(
            title: "Restore the backup from \(OrgSettingsFormat.moment(backup.orgString("createdAt")))?",
            message: "Your books are replaced with this snapshot. A backup of the current data is taken first.",
            action: "Restore"
        ) {
            working = id
            defer { working = nil }
            if await OrgSettingsRun.run(env, "Backup restored", { try await OrgSettingsAPI.send(env, .post, "backups/\(id)/restore", body: ["confirm": .bool(true)]) }) {
                await backups.load(env)
            }
        }
    }

    private func download(_ id: String) async {
        working = id
        defer { working = nil }
        do {
            let url = try await OrgSettingsAPI.download(env, "backups/\(id)/download", fileName: "dubbl-backup-\(id.prefix(8)).json", demo: #"{"organization":"Northwind Studio","contacts":42,"invoices":318}"#)
            file = OrgSettingsFile(url: url)
        } catch {
            env.toast.error(error)
        }
    }
}
