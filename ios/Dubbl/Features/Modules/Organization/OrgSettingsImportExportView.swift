import SwiftUI

/// /settings/import-export: export any part of the books as CSV (or all of
/// it as a ZIP) to share from the phone, and follow past imports. Importing
/// needs a CSV and column mapping, so that step opens on the web.
struct OrgSettingsImportExportView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var jobs = OrgSettingsResource("bulk/import-jobs", query: ["limit": "20"])
    @State private var limitDates = false
    @State private var from = Calendar.current.date(byAdding: .month, value: -12, to: .now) ?? .now
    @State private var to = Date.now
    @State private var exporting: String?
    @State private var file: OrgSettingsFile?

    static let entities: [(key: String, label: String, symbol: String, dated: Bool)] = [
        ("accounts", "Chart of accounts", "list.number", false),
        ("contacts", "Contacts", "person.2", false),
        ("invoices", "Invoices", "doc.text", true),
        ("bills", "Bills", "doc.plaintext", true),
        ("entries", "Journal entries", "book.closed", true),
        ("products", "Products", "shippingbox", false),
        ("bank-transactions", "Bank transactions", "building.columns", true),
    ]

    var body: some View {
        OrgSettingsPage(loaded: jobs.isLoaded || jobs.error != nil, error: nil, reload: { await jobs.load(env) }) {
            OrgSettingsSection("Export", footer: "Each export is a CSV you can save to Files or send. Dates apply to invoices, bills, entries and bank transactions.", inset: 58) {
                OrgSettingsToggle(title: "Limit to dates", isOn: $limitDates.animation(.snappy))
                if limitDates {
                    DatePicker("From", selection: $from, displayedComponents: .date)
                        .padding(.horizontal, 16).frame(minHeight: 48).tint(DTheme.ink)
                    DatePicker("To", selection: $to, in: from..., displayedComponents: .date)
                        .padding(.horizontal, 16).frame(minHeight: 48).tint(DTheme.ink)
                }
                ForEach(Self.entities, id: \.key) { entity in
                    exportRow(key: entity.key, label: entity.label, symbol: entity.symbol, detail: entity.dated && limitDates ? "In the date range" : "Everything")
                }
                exportRow(key: "all", label: "Everything", symbol: "archivebox", detail: "One ZIP with every CSV")
            }
            OrgSettingsSection("Import", footer: "Bring in data from QuickBooks, Xero, FreshBooks, Wave or any CSV. Mapping columns works best on a bigger screen.") {
                Button {
                    if let url = AppConfig.webURL("/settings/import-export") { openURL(url) }
                } label: {
                    OrgSettingsRow(symbol: "square.and.arrow.down", title: "Import a CSV on the web") {
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                .buttonStyle(RowPressStyle())
            }
            history
        }
        .navigationTitle("Import and export")
        .navigationBarTitleDisplayMode(.inline)
        .orgSettingsPreview($file)
        .task { await jobs.load(env) }
    }

    private func exportRow(key: String, label: String, symbol: String, detail: String) -> some View {
        Button { Task { await export(key) } } label: {
            OrgSettingsRow(symbol: symbol, title: label, subtitle: detail) {
                if exporting == key {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(DTheme.ink)
                }
            }
        }
        .buttonStyle(RowPressStyle())
        .disabled(exporting != nil)
    }

    @ViewBuilder
    private var history: some View {
        let all = jobs.value?.orgArray("jobs") ?? []
        if !all.isEmpty {
            OrgSettingsSection("Recent imports", inset: 58) {
                ForEach(all, id: \.recordID) { job in
                    let status = job.orgText("status")
                    let total = job.orgInt("totalRows") ?? 0
                    let errors = job.orgInt("errorRows") ?? 0
                    let processed = job.orgInt("processedRows") ?? 0
                    OrgSettingsRow(
                        symbol: "doc.badge.arrow.up",
                        title: job.orgText("fileName"),
                        subtitle: [job.orgString("type")?.humanized, "\(processed) of \(total) rows", errors > 0 ? "\(errors) failed" : nil, DubblDate.short(job.orgString("createdAt"))].compactMap { $0 }.joined(separator: " · ")
                    ) {
                        LedgerStatus(text: status.humanized, tone: errors > 0 && status == "completed" ? .warning : RecordFormat.tone(status, spec: nil))
                    }
                }
            }
        }
    }

    private func export(_ key: String) async {
        exporting = key
        defer { exporting = nil }
        var query: [String: String?] = [:]
        if limitDates {
            query["startDate"] = DubblDate.string(from)
            query["endDate"] = DubblDate.string(to)
        }
        let isZip = key == "all"
        let stamp = DubblDate.string(.now)
        do {
            let url = try await OrgSettingsAPI.download(
                env, "export/\(key)", query: query,
                fileName: isZip ? "dubbl-export-\(stamp).zip" : "\(key)-\(stamp).csv",
                demo: "name,email\nAcme Corp,ap@acme.com\nGlobex,billing@globex.com\n"
            )
            file = OrgSettingsFile(url: url)
        } catch {
            env.toast.error(error)
        }
    }
}
