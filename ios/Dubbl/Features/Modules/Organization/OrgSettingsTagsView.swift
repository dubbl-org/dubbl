import SwiftUI

/// /settings/tags: coloured labels for contacts, invoices and other records.
/// Anyone in the organization can add, rename, recolour or delete them.
struct OrgSettingsTagsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var tags = OrgSettingsResource("tags")
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false

    private var all: [JSONValue] { tags.value?.orgArray("tags") ?? [] }

    /// The web's tag palette.
    static let colors: [(hex: String, label: String)] = [
        ("#6b7280", "Grey"), ("#ef4444", "Red"), ("#f97316", "Orange"), ("#f59e0b", "Amber"), ("#22c55e", "Green"),
        ("#14b8a6", "Teal"), ("#3b82f6", "Blue"), ("#6366f1", "Indigo"), ("#a855f7", "Purple"), ("#ec4899", "Pink"),
    ]

    var body: some View {
        OrgSettingsPage(loaded: tags.isLoaded, error: tags.error, reload: { await tags.load(env) }) {
            if all.isEmpty {
                EmptyStateView(symbol: "tag", title: "No tags yet", message: "Group contacts and documents your own way.", actionTitle: "New tag", action: { creating = true })
                    .dubblCard()
            } else {
                OrgSettingsSection("\(all.count) \(all.count == 1 ? "tag" : "tags")", inset: 44) {
                    ForEach(all, id: \.recordID) { tag in
                        Button { editing = OrgSettingsIdentified(value: tag) } label: {
                            OrgSettingsRow(title: tag.orgText("name"), subtitle: tag.orgString("description")) {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                            .padding(.leading, 30)
                            .overlay(alignment: .leading) {
                                Circle()
                                    .fill(OrgSettingsFormat.color(tag.orgString("color")))
                                    .frame(width: 12, height: 12)
                                    .padding(.leading, 18)
                            }
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
        }
        .navigationTitle("Tags")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New tag", systemImage: "plus") { creating = true }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsTagSheet(tag: item.value) { Task { await tags.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsTagSheet(tag: nil) { Task { await tags.load(env) } }
        }
        .task { await tags.load(env) }
    }
}

/// Create or edit a tag.
struct OrgSettingsTagSheet: View {
    let tag: JSONValue?
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var color: String
    @State private var summary: String
    @State private var confirmDelete = false

    init(tag: JSONValue?, onDone: @escaping () -> Void) {
        self.tag = tag
        self.onDone = onDone
        _name = State(initialValue: tag?.orgText("name") ?? "")
        _color = State(initialValue: tag?.orgString("color") ?? "#6b7280")
        _summary = State(initialValue: tag?.orgText("description") ?? "")
    }

    var body: some View {
        OrgSettingsFormSheet(title: tag == nil ? "New tag" : "Edit tag", saveTitle: tag == nil ? "Create" : "Save", canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty && name.count <= 50) {
            let body: [String: JSONValue] = [
                "name": .string(name.trimmingCharacters(in: .whitespaces)), "color": .string(color), "description": OrgJSON.text(summary),
            ]
            if let id = tag?.recordID {
                try await OrgSettingsAPI.send(env, .put, "tags/\(id)", body: body)
            } else {
                try await OrgSettingsAPI.send(env, .post, "tags", body: body)
            }
            env.toast.show(tag == nil ? "Tag created" : "Tag saved")
            onDone()
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. Retainer")
                OrgSettingsField(label: "Description", text: $summary, prompt: "Optional")
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Colour")
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                    ForEach(OrgSettingsTagsView.colors, id: \.hex) { option in
                        Button { color = option.hex } label: {
                            Circle()
                                .fill(OrgSettingsFormat.color(option.hex))
                                .frame(width: 28, height: 28)
                                .padding(5)
                                .background(color == option.hex ? DTheme.tintStrong : .clear, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(option.label)
                        .accessibilityAddTraits(color == option.hex ? .isSelected : [])
                    }
                }
                .padding(14)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            if let id = tag?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Delete tag", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Tag deleted", { try await OrgSettingsAPI.send(env, .delete, "tags/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("It's removed from everything it's on.")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
