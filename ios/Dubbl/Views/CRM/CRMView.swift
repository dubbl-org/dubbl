import SwiftUI

struct CRMView: View {
    @State private var pipelines: [Pipeline] = []
    @State private var selectedPipeline: Pipeline?
    @State private var deals: [Deal] = []
    @State private var isLoading = true
    @State private var showCreateDeal = false

    private let service = CRMService()

    var body: some View {
        VStack(spacing: 0) {
            if isLoading {
                LoadingView()
            } else if pipelines.isEmpty {
                EmptyStateView(
                    icon: "chart.bar.xaxis",
                    title: "No Sales Pipelines",
                    message: "Set up a sales pipeline on the web to start tracking deals."
                )
            } else {
                // Pipeline Selector
                if pipelines.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(pipelines) { pipeline in
                                Button(action: { Task { await selectPipeline(pipeline) } }) {
                                    Text(pipeline.name)
                                        .font(.system(size: 14, weight: selectedPipeline?.id == pipeline.id ? .semibold : .regular))
                                        .foregroundColor(selectedPipeline?.id == pipeline.id ? .white : .primary)
                                        .padding(.horizontal, 14).padding(.vertical, 8)
                                        .background(selectedPipeline?.id == pipeline.id ? Color.dubblPrimary : Color(.systemGray6))
                                        .cornerRadius(20)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.vertical, 8)
                }

                // Deals by Stage
                if let pipeline = selectedPipeline, let stages = pipeline.stages {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            ForEach(stages) { stage in
                                let stageDeals = deals.filter { $0.stageId == stage.id }
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Circle()
                                            .fill(Color(hex: stage.color ?? "10b981"))
                                            .frame(width: 8, height: 8)
                                        Text(stage.name)
                                            .font(.subheadline).fontWeight(.semibold)
                                        Spacer()
                                        Text("\(stageDeals.count)")
                                            .font(.caption).foregroundColor(.dubblMuted)
                                            .padding(.horizontal, 8).padding(.vertical, 2)
                                            .background(Color(.systemGray6))
                                            .cornerRadius(10)
                                    }
                                    .padding(.horizontal)

                                    if stageDeals.isEmpty {
                                        Text("No deals in this stage")
                                            .font(.caption).foregroundColor(.dubblMuted)
                                            .padding(.horizontal).padding(.vertical, 8)
                                    } else {
                                        ForEach(stageDeals) { deal in
                                            DealCard(deal: deal)
                                                .padding(.horizontal)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.vertical)
                    }
                }
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Sales")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateDeal = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $showCreateDeal) {
            DealFormView(pipelines: pipelines) { Task { await load() } }
        }
    }

    private func load() async {
        isLoading = true
        do {
            let result = try await service.listPipelines()
            pipelines = result.data
            if selectedPipeline == nil, let first = pipelines.first {
                await selectPipeline(first)
            } else if let current = selectedPipeline {
                let dealResult = try await service.listDeals(pipelineId: current.id)
                deals = dealResult.data
            }
        } catch {}
        isLoading = false
    }

    private func selectPipeline(_ pipeline: Pipeline) async {
        selectedPipeline = pipeline
        do {
            let result = try await service.listDeals(pipelineId: pipeline.id)
            deals = result.data
        } catch {}
    }
}

struct DealCard: View {
    let deal: Deal

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(deal.title).font(.subheadline).fontWeight(.medium)
            HStack {
                if let value = deal.valueCents, value > 0 {
                    Text(value.asCurrency(code: deal.currency ?? "USD"))
                        .font(.caption).fontWeight(.semibold).foregroundColor(.dubblPrimary)
                }
                if let prob = deal.probability {
                    Text("\(prob)%")
                        .font(.caption).foregroundColor(.dubblMuted)
                }
                Spacer()
                if let contact = deal.contact {
                    Text(contact.name)
                        .font(.caption).foregroundColor(.dubblMuted)
                }
            }
            if let closeDate = deal.expectedCloseDate {
                Text("Close: \(closeDate)")
                    .font(.caption2).foregroundColor(.dubblMuted)
            }
        }
        .dubblCard()
    }
}

struct DealFormView: View {
    let pipelines: [Pipeline]
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var pipelineId = ""
    @State private var stageId = ""
    @State private var value = ""
    @State private var probability = ""
    @State private var notes = ""
    @State private var isSubmitting = false
    @State private var error: String?
    private let service = CRMService()
    var onComplete: (() -> Void)?

    private var selectedPipeline: Pipeline? {
        pipelines.first { $0.id == pipelineId }
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Deal Info") {
                    TextField("Deal Title", text: $title)
                    TextField("Value", text: $value).keyboardType(.decimalPad)
                    TextField("Probability (0-100)", text: $probability).keyboardType(.numberPad)
                }
                Section("Pipeline") {
                    Picker("Pipeline", selection: $pipelineId) {
                        Text("Select").tag("")
                        ForEach(pipelines) { p in Text(p.name).tag(p.id) }
                    }
                    if let stages = selectedPipeline?.stages {
                        Picker("Stage", selection: $stageId) {
                            Text("Select").tag("")
                            ForEach(stages) { s in Text(s.name).tag(s.id) }
                        }
                    }
                }
                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 60)
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Deal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary) }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(title.isEmpty || pipelineId.isEmpty || stageId.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        do {
            _ = try await service.createDeal(DealCreate(
                pipelineId: pipelineId, stageId: stageId, title: title,
                valueCents: Int((Double(value) ?? 0) * 100),
                probability: Int(probability),
                notes: notes.isEmpty ? nil : notes
            ))
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
