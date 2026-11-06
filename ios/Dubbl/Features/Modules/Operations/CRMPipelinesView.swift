import SwiftUI

/// Pipelines and their stages: rename, reorder and add stages, pick the
/// default pipeline, or start a new one.
struct CRMPipelinesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var editing: CRMPipelineDraft?
    @State private var deleting: JSONValue?

    private var pipelines: [JSONValue] { loader.value?.opsArray("pipelines") ?? [] }

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { _ in
            if pipelines.isEmpty {
                EmptyStateView(
                    symbol: "rectangle.split.3x1",
                    title: "No pipelines yet",
                    message: "A pipeline is the set of stages a deal moves through.",
                    actionTitle: "New pipeline",
                    action: { editing = CRMPipelineDraft(pipeline: nil, isFirst: true) }
                )
                .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(pipelines, id: \.recordID) { pipeline in
                            card(pipeline)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Pipelines and stages")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New pipeline", systemImage: "plus") { editing = CRMPipelineDraft(pipeline: nil, isFirst: pipelines.isEmpty) }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { draft in
            CRMPipelineEditor(draft: draft) { Task { await load() } }
        }
        .confirmationDialog(
            "Delete \(deleting?["name"]?.stringValue ?? "this pipeline")?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let deleting { Task { await delete(deleting) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its deals stay in the deals list.")
        }
    }

    private func card(_ pipeline: JSONValue) -> some View {
        let stages = CRM.stages(pipeline)
        let isDefault = pipeline["isDefault"]?.boolValue == true
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text(pipeline["name"]?.stringValue ?? "Pipeline")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                if isDefault { StatusPill(text: "Default", tone: .info) }
                Spacer()
                Menu {
                    Button { editing = CRMPipelineDraft(pipeline: pipeline, isFirst: false) } label: { Label("Edit stages", systemImage: "pencil") }
                    if !isDefault {
                        Button { Task { await makeDefault(pipeline) } } label: { Label("Make default", systemImage: "star") }
                    }
                    Button(role: .destructive) { deleting = pipeline } label: { Label("Delete pipeline", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Pipeline actions")
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                    HStack(spacing: 12) {
                        Text("\(index + 1)")
                            .font(DFont.figure(12.5))
                            .foregroundStyle(DTheme.inkTertiary)
                            .frame(width: 18, alignment: .trailing)
                        Circle().fill(stage.tone.color).frame(width: 8, height: 8)
                        Text(stage.name).font(.system(size: 15)).foregroundStyle(DTheme.ink)
                        Spacer()
                        if stage.id == CRM.wonStage || stage.id == CRM.lostStage {
                            Text("Outcome").font(.system(size: 12.5)).foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                    .frame(height: 36)
                }
            }
        }
        .dubblCard()
        .contentShape(Rectangle())
        .onTapGesture { editing = CRMPipelineDraft(pipeline: pipeline, isFirst: false) }
    }

    private func load() async {
        await loader.load(env.api, "crm/pipelines")
    }

    private func makeDefault(_ pipeline: JSONValue) async {
        guard let id = pipeline.recordID else { return }
        do {
            // isDefault isn't exclusive on the server, so clear the others first.
            for other in pipelines where other.recordID != id && other["isDefault"]?.boolValue == true {
                if let otherId = other.recordID {
                    let _: JSONValue = try await env.api.patch("crm/pipelines/\(otherId)", body: ["isDefault": false])
                }
            }
            let _: JSONValue = try await env.api.patch("crm/pipelines/\(id)", body: ["isDefault": true])
            env.toast.show("Default pipeline set")
            await load()
        } catch {
            env.toast.error(error)
        }
    }

    private func delete(_ pipeline: JSONValue) async {
        guard let id = pipeline.recordID else { return }
        do {
            let _: JSONValue = try await env.api.delete("crm/pipelines/\(id)")
            env.toast.show("Pipeline deleted")
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// What the editor opens with: an existing pipeline or a new one.
struct CRMPipelineDraft: Identifiable {
    let pipeline: JSONValue?
    let isFirst: Bool
    let id = UUID()
}

/// A stage being edited. `id` is the stage id the deals point at, so renaming
/// keeps them in place.
private struct CRMEditableStage: Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
}

/// Name a pipeline and arrange its open stages; won and lost stay at the end.
struct CRMPipelineEditor: View {
    let draft: CRMPipelineDraft
    let onSaved: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var isDefault = false
    @State private var stages: [CRMEditableStage] = []
    @State private var outcomes: [CRMEditableStage] = []
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool {
        OperationsFormat.trimmed(name) != nil && !stages.isEmpty && stages.allSatisfy { OperationsFormat.trimmed($0.name) != nil } && !saving
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Pipeline name", text: $name)
                        .font(.system(size: 16))
                    Toggle("Default pipeline", isOn: $isDefault)
                        .tint(DTheme.positive)
                }
                Section {
                    ForEach($stages) { $stage in
                        HStack(spacing: 12) {
                            Circle().fill(CRM.tone(stage.id, index: stages.firstIndex(of: stage) ?? 0).color).frame(width: 8, height: 8)
                            TextField("Stage name", text: $stage.name)
                        }
                    }
                    .onMove { stages.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { stages.remove(atOffsets: $0) }
                    Button {
                        withAnimation(.snappy) {
                            let suffix = String(UUID().uuidString.prefix(6)).lowercased()
                            stages.append(CRMEditableStage(
                                id: "stage_\(Int(Date.now.timeIntervalSince1970 * 1000))_\(suffix)",
                                name: "",
                                color: CRM.stageColors[stages.count % CRM.stageColors.count]
                            ))
                        }
                    } label: {
                        Label("Add stage", systemImage: "plus")
                    }
                } header: {
                    Text("Stages")
                } footer: {
                    Text("Drag to reorder. Won and lost are added at the end as outcomes. Deals in a removed stage show in the first column.")
                }
            }
            .environment(\.editMode, .constant(.active))
            .scrollContentBackground(.hidden)
            .background(DTheme.shell)
            .navigationTitle(draft.pipeline == nil ? "New pipeline" : "Edit pipeline")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(!canSave)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let error {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.negative)
                        .padding()
                }
            }
        }
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
        .onAppear(perform: fill)
    }

    private func fill() {
        let source = draft.pipeline?.opsArray("stages") ?? []
        let all: [CRMEditableStage] = source.isEmpty
            ? CRM.defaultStages.map { CRMEditableStage(id: $0.id, name: $0.name, color: $0.color) }
            : source.compactMap { stage in
                guard let id = stage["id"]?.stringValue else { return nil }
                return CRMEditableStage(id: id, name: stage["name"]?.stringValue ?? "", color: stage["color"]?.stringValue ?? "#94a3b8")
            }
        name = draft.pipeline?["name"]?.stringValue ?? (draft.isFirst ? "Sales pipeline" : "")
        isDefault = draft.pipeline?["isDefault"]?.boolValue ?? draft.isFirst
        stages = all.filter { $0.id != CRM.wonStage && $0.id != CRM.lostStage }
        outcomes = all.filter { $0.id == CRM.wonStage || $0.id == CRM.lostStage }
        if outcomes.isEmpty {
            outcomes = CRM.defaultStages.filter { $0.id == CRM.wonStage || $0.id == CRM.lostStage }
                .map { CRMEditableStage(id: $0.id, name: $0.name, color: $0.color) }
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let body = CRMPipelineBody(
            name: name.trimmingCharacters(in: .whitespaces),
            stages: (stages + outcomes).map { ["id": $0.id, "name": $0.name.trimmingCharacters(in: .whitespaces), "color": $0.color] },
            isDefault: isDefault
        )
        do {
            if let id = draft.pipeline?.recordID {
                let _: JSONValue = try await env.api.patch("crm/pipelines/\(id)", body: body)
            } else {
                let _: JSONValue = try await env.api.post("crm/pipelines", body: body)
            }
            env.toast.show("Pipeline saved")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
