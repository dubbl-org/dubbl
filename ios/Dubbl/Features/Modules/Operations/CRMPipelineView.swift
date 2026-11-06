import SwiftUI

/// The CRM board: a pipeline's open stages as columns you page through
/// sideways, with chips to jump between them. Long-press a deal to move it to
/// another stage or close it as won or lost; tap it to open the deal.
struct CRMPipelineView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var pipelines: [JSONValue] = []
    @State private var pipelineId: String?
    @State private var deals: [JSONValue] = []
    @State private var won: (count: Int, value: Int)?
    @State private var lostCount: Int?
    @State private var loaded = false
    @State private var error: String?
    @State private var chip = ""
    @State private var scrolled: String?
    @State private var creating = false
    @State private var losing: JSONValue?
    @State private var logging: JSONValue?
    @State private var settingUp = false

    @AppStorage("crm.pipeline") private var savedPipeline = ""

    private var pipeline: JSONValue? {
        pipelines.first { $0.recordID == pipelineId } ?? CRM.defaultPipeline(pipelines)
    }

    private var stages: [CRMStage] { CRM.openStages(pipeline) }

    /// Deals per column; unknown stages land in the first one, like the web.
    private var byStage: [String: [JSONValue]] {
        let known = Set(stages.map(\.id))
        var groups = [String: [JSONValue]]()
        for deal in deals {
            let stage = deal["stageId"]?.stringValue ?? ""
            groups[known.contains(stage) ? stage : stages.first?.id ?? "", default: []].append(deal)
        }
        return groups
    }

    var body: some View {
        content
            .background(DTheme.shell)
            .navigationTitle(pipelines.count > 1 ? (pipeline?["name"]?.stringValue ?? "Pipeline") : "Pipeline")
            .navigationSubtitle(loaded && pipeline != nil ? "\(deals.count) open \(deals.count == 1 ? "deal" : "deals")" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if pipelines.count > 1 {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Pipeline", selection: Binding(get: { pipeline?.recordID ?? "" }, set: { choose($0) })) {
                                ForEach(pipelines.compactMap(\.recordID), id: \.self) { id in
                                    Text(pipelines.first { $0.recordID == id }?["name"]?.stringValue ?? "Pipeline").tag(id)
                                }
                            }
                        } label: {
                            Image(systemName: "rectangle.split.3x1")
                        }
                        .accessibilityLabel("Choose pipeline")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        NavigationLink(value: RecordPageRoute(path: "/crm/deals")) { Label("All deals", systemImage: "list.bullet") }
                        NavigationLink(value: RecordPageRoute(path: "/crm/activities")) { Label("Activities", systemImage: "checklist") }
                        NavigationLink(value: RecordPageRoute(path: "/crm/pipelines")) { Label("Pipelines and stages", systemImage: "slider.horizontal.3") }
                        Button {
                            env.router.askTilly("Which deals in my pipeline are most likely to close this month?", page: "crm")
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("More")
                }
                if pipeline != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("New deal", systemImage: "plus") { creating = true }
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == "crm-deals" { Task { await loadDeals() } }
            }
            .sheet(isPresented: $creating) {
                CRMNewDealSheet(pipelineId: pipeline?.recordID, stageId: scrolled ?? stages.first?.id) {
                    Task { await loadDeals() }
                }
            }
            .sheet(item: Binding(get: { losing.map(CRMDealRef.init) }, set: { if $0 == nil { losing = nil } })) { ref in
                CRMLostSheet(dealId: ref.id, title: ref.title) {
                    withAnimation(.snappy) { deals.removeAll { $0.recordID == ref.id } }
                    Task { await loadOutcomes() }
                }
            }
            .sheet(item: Binding(get: { logging.map(CRMDealRef.init) }, set: { if $0 == nil { logging = nil } })) { ref in
                CRMLogActivitySheet(dealId: ref.id, dealTitle: ref.title)
            }
    }

    @ViewBuilder
    private var content: some View {
        if !loaded {
            if let error {
                ErrorStateView(message: error) { await load() }.frame(maxHeight: .infinity)
            } else {
                ScrollView { SkeletonRows(rows: 7, avatar: false) }
            }
        } else if pipeline == nil {
            EmptyStateView(
                symbol: "rectangle.split.3x1",
                title: "No pipeline yet",
                message: "Start with Lead, Qualified, Proposal and Negotiation. You can rename stages later.",
                actionTitle: settingUp ? "Setting up…" : "Set up pipeline",
                action: { Task { await setUp() } }
            )
            .frame(maxHeight: .infinity)
        } else {
            board
        }
    }

    // MARK: Board

    private var board: some View {
        let groups = byStage
        let openValue = deals.reduce(0) { $0 + ($1["valueCents"]?.intValue ?? 0) }
        let forecast = deals.reduce(0) { $0 + CRM.weighted($1) }
        return VStack(spacing: 0) {
            LedgerTotals(items: [
                .init(label: "Open", value: Money.short(openValue, currency: env.session.currency), detail: "\(deals.count) \(deals.count == 1 ? "deal" : "deals")", tint: DTheme.info),
                .init(label: "Weighted", value: Money.short(forecast, currency: env.session.currency), detail: "By odds", tint: DTheme.special),
                .init(label: "Won", value: won.map { Money.short($0.value, currency: env.session.currency) }, detail: won.map { "\($0.count) won · \(lostCount ?? 0) lost" }, tint: DTheme.positive),
            ])
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 14)

            ChipRow(
                options: stages.map { (value: $0.id, label: $0.name, count: groups[$0.id]?.count) },
                selection: $chip
            )
            .padding(.bottom, 12)

            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(stages) { stage in
                        column(stage, deals: groups[stage.id] ?? [])
                            .containerRelativeFrame(.horizontal) { length, _ in length * 0.86 }
                            .id(stage.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $scrolled)
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, 16, for: .scrollContent)
        }
        .onChange(of: chip) { _, value in
            guard value != scrolled else { return }
            withAnimation(.snappy) { scrolled = value }
        }
        .onChange(of: scrolled) { _, value in
            if let value, value != chip { chip = value }
        }
        .onAppear {
            if chip.isEmpty { chip = stages.first?.id ?? "" }
        }
    }

    private func column(_ stage: CRMStage, deals: [JSONValue]) -> some View {
        let value = deals.reduce(0) { $0 + ($1["valueCents"]?.intValue ?? 0) }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(stage.tone.color).frame(width: 8, height: 8)
                Text(stage.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                Text("\(deals.count)")
                    .font(DFont.figure(13.5))
                    .foregroundStyle(DTheme.inkTertiary)
                Spacer()
                Text(Money.short(value, currency: env.session.currency))
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .padding(.horizontal, 4)

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(deals, id: \.recordID) { deal in
                        card(deal, in: stage)
                    }
                    if deals.isEmpty {
                        Button {
                            creating = true
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: "plus").font(.system(size: 15, weight: .medium))
                                Text("No deals here").font(.system(size: 13.5))
                            }
                            .foregroundStyle(DTheme.inkTertiary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 110)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(DTheme.hairline, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                            )
                        }
                        .buttonStyle(TapScaleStyle())
                    }
                }
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func card(_ deal: JSONValue, in stage: CRMStage) -> some View {
        NavigationLink(value: RecordRoute(spec: "crm-deals", id: deal.recordID ?? "")) {
            CRMDealCard(deal: deal, currency: env.session.currency)
        }
        .buttonStyle(TapScaleStyle())
        .contextMenu {
            Menu {
                ForEach(stages.filter { $0.id != stage.id }) { target in
                    Button(target.name) { move(deal, to: target) }
                }
            } label: {
                Label("Move to", systemImage: "arrow.right")
            }
            Button { markWon(deal) } label: { Label("Mark as won", systemImage: "trophy") }
            Button { losing = deal } label: { Label("Mark as lost…", systemImage: "hand.thumbsdown") }
            Divider()
            Button { logging = deal } label: { Label("Log activity", systemImage: "plus.bubble") }
            Button {
                env.router.askTilly("Tell me about the deal \(deal["title"]?.stringValue ?? "") and what to do next.", page: "crm")
            } label: {
                Label("Ask Tilly", systemImage: "sparkle")
            }
        }
    }

    // MARK: Actions

    private func choose(_ id: String) {
        guard id != pipelineId else { return }
        pipelineId = id
        savedPipeline = id
        chip = ""
        scrolled = nil
        Task {
            await loadDeals()
            chip = stages.first?.id ?? ""
        }
    }

    private func move(_ deal: JSONValue, to stage: CRMStage) {
        guard let id = deal.recordID else { return }
        let previous = deals
        withAnimation(.snappy) {
            deals = deals.map { $0.recordID == id ? $0.opsSetting("stageId", .string(stage.id)) : $0 }
            chip = stage.id
        }
        Task {
            do {
                let _: JSONValue = try await env.api.patch("crm/deals/\(id)/stage", body: CRMStageBody(stageId: stage.id))
                env.toast.show("Moved to \(stage.name)")
            } catch {
                withAnimation(.snappy) { deals = previous }
                env.toast.error(error)
            }
        }
    }

    private func markWon(_ deal: JSONValue) {
        guard let id = deal.recordID else { return }
        let previous = deals
        withAnimation(.snappy) { deals.removeAll { $0.recordID == id } }
        Task {
            do {
                let _: JSONValue = try await env.api.post("crm/deals/\(id)/won")
                env.toast.show("\(deal["title"]?.stringValue ?? "Deal") won", symbol: "trophy")
                await loadOutcomes()
            } catch {
                withAnimation(.snappy) { deals = previous }
                env.toast.error(error)
            }
        }
    }

    // MARK: Loading

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("crm/pipelines")
            pipelines = response.opsArray("pipelines")
            if pipelineId == nil {
                pipelineId = pipelines.first { $0.recordID == savedPipeline }?.recordID ?? CRM.defaultPipeline(pipelines)?.recordID
            }
            if pipeline != nil { await loadDeals() }
            error = nil
            withAnimation(.snappy) { loaded = true }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }

    private func loadDeals() async {
        guard let id = pipeline?.recordID else { return }
        async let outcomes: Void = loadOutcomes()
        if let response: JSONValue = try? await env.api.get("crm/deals", query: [
            "pipelineId": id, "status": "active", "sortBy": "value", "sortOrder": "desc", "limit": "100",
        ]) {
            var rows = response.opsArray("data")
            if OperationsFormat.isDemo { rows = rows.filter { CRM.outcome($0) == "open" } }
            withAnimation(.snappy) { deals = rows }
        }
        await outcomes
    }

    private func loadOutcomes() async {
        guard let id = pipeline?.recordID else { return }
        async let wonResponse: JSONValue? = try? env.api.get("crm/deals", query: ["pipelineId": id, "status": "won", "limit": "1"])
        async let lostResponse: JSONValue? = try? env.api.get("crm/deals", query: ["pipelineId": id, "status": "lost", "limit": "1"])
        let (wonData, lostData) = await (wonResponse, lostResponse)
        withAnimation(.snappy) {
            if let summary = wonData?["summary"] {
                won = (summary["wonCount"]?.intValue ?? 0, summary["wonValue"]?.intValue ?? 0)
            }
            if OperationsFormat.isDemo {
                lostCount = lostData.map { $0.opsArray("data").filter { CRM.outcome($0) == "lost" }.count }
            } else {
                lostCount = lostData?["pagination.total"]?.intValue
            }
        }
    }

    private func setUp() async {
        settingUp = true
        defer { settingUp = false }
        let stages: [[String: String]] = CRM.defaultStages.map { ["id": $0.id, "name": $0.name, "color": $0.color] }
        do {
            let _: JSONValue = try await env.api.post("crm/pipelines", body: CRMPipelineBody(name: "Sales pipeline", stages: stages, isDefault: true))
            env.toast.show("Pipeline ready")
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// A deal handed to a sheet.
struct CRMDealRef: Identifiable {
    let id: String
    let title: String

    init(_ deal: JSONValue) {
        id = deal.recordID ?? ""
        title = deal["title"]?.stringValue ?? "Deal"
    }
}

/// POST/PATCH crm/pipelines: the whole stage list in order.
struct CRMPipelineBody: Encodable, Sendable {
    var name: String
    var stages: [[String: String]]
    var isDefault: Bool?
}
