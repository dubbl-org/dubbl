import SwiftUI

/// /settings/document-templates: how invoices, quotes, receipts, payslips and
/// purchase orders look. Edit the wording, accent colour and what's shown,
/// pick the default per document type and preview the PDF.
struct OrgSettingsTemplatesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var templates = OrgSettingsResource("document-templates")
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false
    @State private var preview: OrgSettingsFile?

    static let types: [(value: String, label: String)] = [
        ("invoice", "Invoice"), ("quote", "Quote"), ("receipt", "Receipt"), ("payslip", "Payslip"), ("purchase_order", "Purchase order"),
    ]

    private var all: [JSONValue] { templates.value?.orgArray("templates") ?? [] }

    var body: some View {
        OrgSettingsPage(loaded: templates.isLoaded, error: templates.error, reload: { await templates.load(env) }) {
            if all.isEmpty {
                EmptyStateView(symbol: "doc.richtext", title: "No templates yet", message: "Documents use dubbl's standard layout until you add one.", actionTitle: "New template", action: { creating = true })
                    .dubblCard()
            }
            ForEach(Self.types, id: \.value) { type in
                let group = all.filter { $0.orgString("type") == type.value }
                if !group.isEmpty {
                    OrgSettingsSection(type.label + "s", inset: 58) {
                        ForEach(group, id: \.recordID) { template in row(template) }
                    }
                }
            }
        }
        .navigationTitle("Templates")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New template", systemImage: "plus") { creating = true }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsTemplateSheet(template: item.value) { Task { await templates.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsTemplateSheet(template: nil) { Task { await templates.load(env) } }
        }
        .orgSettingsPreview($preview)
        .task {
            await templates.load(env)
            #if DEBUG
            OrgSettingsDemo.open("template") { editing = all.first.map(OrgSettingsIdentified.init) }
            #endif
        }
    }

    private func row(_ template: JSONValue) -> some View {
        Button { editing = OrgSettingsIdentified(value: template) } label: {
            OrgSettingsRow(
                symbol: "doc.richtext",
                title: template.orgText("name"),
                subtitle: [template.orgBool("showTaxBreakdown") ? "Tax breakdown" : nil, template.orgBool("showPaymentTerms") ? "Payment terms" : nil].compactMap { $0 }.joined(separator: " · ")
            ) {
                HStack(spacing: 10) {
                    if template.orgBool("isDefault") { StatusPill(text: "Default", tone: .positive) }
                    Circle().fill(OrgSettingsFormat.color(template.orgString("accentColor"))).frame(width: 12, height: 12)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .buttonStyle(RowPressStyle())
        .contextMenu {
            if let id = template.recordID {
                Button("Preview PDF", systemImage: "eye") { Task { await showPreview(id) } }
            }
        }
    }

    private func showPreview(_ id: String) async {
        do {
            let url = try await OrgSettingsAPI.download(env, "document-templates/\(id)/preview", query: ["format": "pdf"], fileName: "template-preview.pdf", demo: "")
            preview = OrgSettingsFile(url: url)
        } catch {
            env.toast.error(error)
        }
    }
}

/// Create or edit a document template.
struct OrgSettingsTemplateSheet: View {
    let template: JSONValue?
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var type: String
    @State private var accent: String
    @State private var showTax: Bool
    @State private var showTerms: Bool
    @State private var notes: String
    @State private var instructions: String
    @State private var bankDetails: String
    @State private var isDefault: Bool
    @State private var confirmDelete = false
    @State private var preview: OrgSettingsFile?
    @State private var loadingPreview = false

    static let accents = ["#10b981", "#111113", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#14b8a6"]

    init(template: JSONValue?, onDone: @escaping () -> Void) {
        self.template = template
        self.onDone = onDone
        _name = State(initialValue: template?.orgText("name") ?? "")
        _type = State(initialValue: template?.orgString("type") ?? "invoice")
        _accent = State(initialValue: template?.orgString("accentColor") ?? "#10b981")
        _showTax = State(initialValue: template?.orgBool("showTaxBreakdown", default: true) ?? true)
        _showTerms = State(initialValue: template?.orgBool("showPaymentTerms", default: true) ?? true)
        _notes = State(initialValue: template?.orgText("notes") ?? "")
        _instructions = State(initialValue: template?.orgText("paymentInstructions") ?? "")
        _bankDetails = State(initialValue: template?.orgText("bankDetails") ?? "")
        _isDefault = State(initialValue: template?.orgBool("isDefault") ?? false)
    }

    var body: some View {
        OrgSettingsFormSheet(title: template == nil ? "New template" : "Edit template", saveTitle: template == nil ? "Create" : "Save", canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty) {
            var body: [String: JSONValue] = [
                "name": .string(name.trimmingCharacters(in: .whitespaces)),
                "accentColor": .string(accent),
                "showTaxBreakdown": .bool(showTax),
                "showPaymentTerms": .bool(showTerms),
                "notes": OrgJSON.text(notes),
                "paymentInstructions": OrgJSON.text(instructions),
                "bankDetails": OrgJSON.text(bankDetails),
                "isDefault": .bool(isDefault),
            ]
            if let id = template?.recordID {
                try await OrgSettingsAPI.send(env, .patch, "document-templates/\(id)", body: body)
            } else {
                body["type"] = .string(type)
                try await OrgSettingsAPI.send(env, .post, "document-templates", body: body)
            }
            env.toast.show(template == nil ? "Template created" : "Template saved")
            onDone()
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. Studio invoice", capitalization: .words)
                OrgSettingsPicker(label: "Document", selection: $type, options: OrgSettingsTemplatesView.types, disabled: template != nil)
                OrgSettingsToggle(title: "Default for this document", isOn: $isDefault)
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Accent colour")
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                    ForEach(Self.accents, id: \.self) { hex in
                        Button { accent = hex } label: {
                            Circle()
                                .fill(OrgSettingsFormat.color(hex))
                                .frame(width: 26, height: 26)
                                .padding(4)
                                .background(accent == hex ? DTheme.tintStrong : .clear, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(hex)
                    }
                }
                .padding(14)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            OrgSettingsSection("Show") {
                OrgSettingsToggle(title: "Tax breakdown", subtitle: "Tax per rate under the totals", isOn: $showTax)
                OrgSettingsToggle(title: "Payment terms", subtitle: "The due date and terms in the header", isOn: $showTerms)
            }
            OrgSettingsSection("Wording", footer: "Printed at the foot of every document that uses this template.") {
                OrgSettingsField(label: "Notes", text: $notes, prompt: "Thank you for your business.", axis: .vertical)
                OrgSettingsField(label: "Payment instructions", text: $instructions, prompt: "How customers should pay", axis: .vertical)
                OrgSettingsField(label: "Bank details", text: $bankDetails, prompt: "Account name, number, routing", mono: true, axis: .vertical)
            }
            if let id = template?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Preview PDF", symbol: "eye", working: loadingPreview) { Task { await showPreview(id) } }
                    OrgSettingsButtonRow(title: "Delete template", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Template deleted", { try await OrgSettingsAPI.send(env, .delete, "document-templates/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("It moves to the trash for 30 days.")
                }
            }
        }
        .orgSettingsPreview($preview)
    }

    private func showPreview(_ id: String) async {
        loadingPreview = true
        defer { loadingPreview = false }
        do {
            let url = try await OrgSettingsAPI.download(env, "document-templates/\(id)/preview", query: ["format": "pdf"], fileName: "template-preview.pdf", demo: "")
            preview = OrgSettingsFile(url: url)
        } catch {
            env.toast.error(error)
        }
    }
}
