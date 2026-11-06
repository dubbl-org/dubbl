import SwiftUI

/// One deal: value and chance up top, the pipeline's stages to move it along,
/// its activity, and buttons to log what happened or close it.
struct CRMDealView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var deal: JSONValue?
    @State private var activities: [JSONValue] = []
    @State private var error: String?
    @State private var working = false
    @State private var logging = false
    @State private var losing = false
    @State private var editing = false
    @State private var confirmDelete = false

    private var currency: String { deal?["currency"]?.stringValue ?? env.session.currency }
    private var outcome: String { deal.map(CRM.outcome) ?? "open" }

    var body: some View {
        ScrollView {
            if let deal {
                VStack(alignment: .leading, spacing: 24) {
                    hero(deal)
                    stagesStrip(deal)
                    details(deal)
                    activitySection
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, outcome == "open" ? 110 : 28)
            } else if let error {
                ErrorStateView(message: error) { await load() }.padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Deal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("What should I do next on the deal \(deal?["title"]?.stringValue ?? "")?", page: "crm")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if deal != nil {
                        Button { editing = true } label: { Label("Edit deal", systemImage: "pencil") }
                        if outcome == "open" {
                            Button { losing = true } label: { Label("Mark as lost…", systemImage: "hand.thumbsdown") }
                        }
                        Button(role: .destructive) { confirmDelete = true } label: { Label("Delete deal", systemImage: "trash") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if deal != nil, outcome == "open" {
                PurchasesActionBar {
                    Button { logging = true } label: { Label("Log activity", systemImage: "plus.bubble") }
                        .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                    Button { Task { await markWon() } } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.inkInverse) } else { Image(systemName: "trophy") }
                            Text("Won")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(working)
                }
            }
        }
        .confirmationDialog("Delete this deal?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $logging) {
            CRMLogActivitySheet(dealId: id, dealTitle: deal?["title"]?.stringValue) { Task { await loadActivities() } }
        }
        .sheet(isPresented: $losing) {
            CRMLostSheet(dealId: id, title: deal?["title"]?.stringValue ?? "Deal") { Task { await load() } }
        }
        .sheet(isPresented: $editing) {
            if let deal {
                CRMEditDealSheet(deal: deal) { Task { await load() } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: Hero

    private func hero(_ deal: JSONValue) -> some View {
        let stageId = deal["stageId"]?.stringValue
        let pipeline = deal["pipeline"]
        let probability = deal["probability"]?.intValue
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                switch outcome {
                case "won": LedgerStatus(text: "Won", tone: .positive)
                case "lost": LedgerStatus(text: "Lost", tone: .negative)
                default:
                    let stage = CRM.stages(pipeline).first { $0.id == stageId }
                    LedgerStatus(text: CRM.stageName(stageId, in: pipeline), tone: stage?.tone ?? .neutral)
                }
                if let name = pipeline?["name"]?.stringValue {
                    Text(name).font(.system(size: 13)).foregroundStyle(DTheme.inkTertiary)
                }
            }
            Text(deal["title"]?.stringValue ?? "Deal")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(deal["valueCents"]?.intValue ?? 0, currency: currency))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.2)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            let who = [deal["contact.name"]?.stringValue, (deal["assignedUser.name"] ?? deal["assignedUser.email"])?.stringValue.map { "Owner \($0)" }].compactMap { $0 }
            if !who.isEmpty {
                Text(who.joined(separator: " · "))
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            if outcome == "open" {
                HStack(spacing: 0) {
                    fact("Chance", probability.map { "\($0)%" } ?? "–")
                    fact("Weighted", Money.short(CRM.weighted(deal), currency: currency))
                    let close = deal["expectedCloseDate"]?.stringValue
                    fact("Close", close.map { DubblDate.short($0) } ?? "–", tone: CRM.closeTone(close))
                }
                .padding(.top, 6)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func fact(_ label: String, _ value: String, tone: Tone = .neutral) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.system(size: 12.5, weight: .medium)).foregroundStyle(DTheme.inkTertiary)
            Text(value)
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone == .neutral ? DTheme.ink : tone.color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Stages

    private func stagesStrip(_ deal: JSONValue) -> some View {
        let stages = CRM.openStages(deal["pipeline"])
        let current = stages.firstIndex { $0.id == deal["stageId"]?.stringValue }
        let open = outcome == "open"
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel(open ? "Stage" : "Stage when closed")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                        let isCurrent = index == current
                        let passed = current.map { index < $0 } ?? false
                        Button {
                            Task { await move(to: stage) }
                        } label: {
                            HStack(spacing: 6) {
                                if passed {
                                    Image(systemName: "checkmark").font(.system(size: 11, weight: .bold))
                                } else {
                                    Circle().fill(isCurrent ? stage.tone.color : DTheme.inkTertiary).frame(width: 7, height: 7)
                                }
                                Text(stage.name)
                            }
                            .font(.system(size: 14, weight: isCurrent ? .semibold : .medium))
                            .foregroundStyle(isCurrent || passed ? DTheme.ink : DTheme.inkSecondary)
                            .padding(.horizontal, 14)
                            .frame(height: 38)
                            .background(isCurrent ? DTheme.tintStrong : DTheme.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(isCurrent ? .clear : DTheme.hairline, lineWidth: 0.5))
                        }
                        .buttonStyle(TapScaleStyle())
                        .disabled(!open || isCurrent || working)
                        .accessibilityAddTraits(isCurrent ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 1)
            }
            .scrollClipDisabled()
        }
        .sensoryFeedback(.selection, trigger: deal["stageId"]?.stringValue)
    }

    // MARK: Details

    private func details(_ deal: JSONValue) -> some View {
        var rows: [(String, String)] = []
        if let source = deal["source"]?.stringValue {
            rows.append(("Source", CRM.sources.first { $0.value == source }?.label ?? source.humanized))
        }
        if let email = deal["contact.email"]?.stringValue { rows.append(("Contact email", email)) }
        if let wonAt = deal["wonAt"]?.stringValue { rows.append(("Won on", DubblDate.display(wonAt))) }
        if let lostAt = deal["lostAt"]?.stringValue { rows.append(("Lost on", DubblDate.display(lostAt))) }
        if let reason = deal["lostReason"]?.stringValue, !reason.isEmpty { rows.append(("Why it was lost", reason)) }
        if let created = deal["createdAt"]?.stringValue { rows.append(("Created", DubblDate.display(created))) }
        let notes = deal["notes"]?.stringValue
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                ForEach(rows, id: \.0) { row in
                    DetailRow(row.0, row.1)
                }
                if let notes, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notes").font(.system(size: 13.5)).foregroundStyle(DTheme.inkSecondary)
                        Text(notes).font(.system(size: 15)).foregroundStyle(DTheme.ink).textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    // MARK: Activity

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Activity · \(activities.count)", action: ("Log", { logging = true }))
            if activities.isEmpty {
                Text("Calls, emails, meetings and notes on this deal show up here.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack(dividerInset: 62) {
                    ForEach(activities, id: \.recordID) { activity in
                        CRMActivityRow(activity: activity, showDeal: false) { done in
                            Task { await setDone(activity, done) }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    // MARK: Actions

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("crm/deals/\(id)")
            withAnimation(.snappy) {
                deal = response["deal"] ?? response
                error = nil
            }
            await loadActivities()
        } catch {
            if deal == nil { self.error = error.localizedDescription }
        }
    }

    private func loadActivities() async {
        if let response: JSONValue = try? await env.api.get("crm/deals/\(id)/activities", query: ["limit": "50"]) {
            withAnimation(.snappy) { activities = response.opsArray("activities") }
        }
    }

    private func move(to stage: CRMStage) async {
        guard let deal else { return }
        let previous = deal
        working = true
        defer { working = false }
        withAnimation(.snappy) { self.deal = deal.opsSetting("stageId", .string(stage.id)) }
        do {
            let _: JSONValue = try await env.api.patch("crm/deals/\(id)/stage", body: CRMStageBody(stageId: stage.id))
            env.toast.show("Moved to \(stage.name)")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
        } catch {
            withAnimation(.snappy) { self.deal = previous }
            env.toast.error(error)
        }
    }

    private func markWon() async {
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.post("crm/deals/\(id)/won")
            env.toast.show("Deal won", symbol: "trophy")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
            if OperationsFormat.isDemo, let deal {
                self.deal = deal.opsSetting("wonAt", .string(Date.now.formatted(.iso8601))).opsSetting("stageId", .string(CRM.wonStage))
            } else {
                await load()
            }
        } catch {
            env.toast.error(error)
        }
    }

    private func setDone(_ activity: JSONValue, _ done: Bool) async {
        guard let activityId = activity.recordID else { return }
        let stamp: JSONValue = done ? .string(Date.now.formatted(.iso8601)) : .null
        withAnimation(.snappy) {
            activities = activities.map { $0.recordID == activityId ? $0.opsSetting("completedAt", stamp) : $0 }
        }
        do {
            let _: JSONValue = try await env.api.patch("crm/activities/\(activityId)", body: CRMCompleteBody(completed: done))
        } catch {
            env.toast.error(error)
            await loadActivities()
        }
    }

    private func delete() async {
        do {
            let _: JSONValue = try await env.api.delete("crm/deals/\(id)")
            env.toast.show("Deal deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

/// One activity: its type, what was said, who and when, and a check to mark it done.
struct CRMActivityRow: View {
    let activity: JSONValue
    var showDeal = true
    let onToggle: (Bool) -> Void

    var body: some View {
        let type = activity["type"]?.stringValue
        let done = activity["completedAt"]?.stringValue != nil
        let scheduled = activity["scheduledAt"]?.stringValue
        let overdue = !done && (DubblDate.parseMoment(scheduled).map { $0 < .now } ?? false)
        HStack(alignment: .top, spacing: 12) {
            IconTile(symbol: CRM.activitySymbol(type), tone: CRM.activityTone(type), size: 34)
            VStack(alignment: .leading, spacing: 4) {
                Text(activity["content"]?.stringValue ?? CRM.activityLabel(type))
                    .font(.system(size: 15))
                    .foregroundStyle(done ? DTheme.inkSecondary : DTheme.ink)
                    .strikethrough(done && type == "task", color: DTheme.inkTertiary)
                    .lineLimit(3)
                let parts: [String] = [
                    scheduled.map { (done ? "Was due " : (overdue ? "Overdue · " : "Due ")) + DubblDate.short($0) } ?? DubblDate.relative(activity["createdAt"]?.stringValue),
                    showDeal ? activity["deal.title"]?.stringValue : nil,
                    activity["user.name"]?.stringValue,
                ].compactMap { $0 }.filter { !$0.isEmpty }
                Text(parts.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(overdue ? DTheme.negative : DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            if scheduled != nil || done {
                Button { onToggle(!done) } label: {
                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 22))
                        .foregroundStyle(done ? DTheme.positive : DTheme.inkTertiary)
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(done ? "Mark as not done" : "Mark as done")
            }
        }
        .padding(.vertical, 12)
        .sensoryFeedback(.success, trigger: done) { old, new in !old && new }
    }
}

/// Edit a deal's title, value, chance, close date and notes.
struct CRMEditDealSheet: View {
    let deal: JSONValue
    let onSaved: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var value = 0
    @State private var probability = 0
    @State private var hasCloseDate = false
    @State private var closeDate = Date.now
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "Edit deal", canSave: OperationsFormat.trimmed(title) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Deal") { TextField("Title", text: $title) }
                FieldRow(label: "Value") { AmountField(minor: $value, currency: deal["currency"]?.stringValue ?? env.session.currency) }
            }
            CardStack {
                Stepper(value: $probability, in: 0 ... 100, step: 5) {
                    HStack {
                        Text("Chance to close").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                        Spacer()
                        Text("\(probability)%").font(DFont.figure(15)).foregroundStyle(DTheme.inkSecondary)
                    }
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                Toggle(isOn: $hasCloseDate.animation(.snappy)) {
                    Text("Expected close").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                if hasCloseDate { OperationsDateRow(label: "Close by", date: $closeDate) }
            }
            CardStack {
                FieldRow(label: "Notes") { TextField("Optional", text: $notes, axis: .vertical).lineLimit(2 ... 6) }
            }
        }
        .presentationDetents([.large])
        .onAppear {
            title = deal["title"]?.stringValue ?? ""
            value = deal["valueCents"]?.intValue ?? 0
            probability = deal["probability"]?.intValue ?? 0
            if let date = DubblDate.parseDay(deal["expectedCloseDate"]?.stringValue) {
                hasCloseDate = true
                closeDate = date
            }
            notes = deal["notes"]?.stringValue ?? ""
        }
    }

    private func save() async {
        guard let id = deal.recordID else { return }
        saving = true
        error = nil
        defer { saving = false }
        let body = CRMDealEditBody(
            title: title.trimmingCharacters(in: .whitespaces),
            valueCents: value,
            probability: probability,
            expectedCloseDate: hasCloseDate ? DubblDate.string(closeDate) : nil,
            notes: OperationsFormat.trimmed(notes)
        )
        do {
            let _: JSONValue = try await env.api.patch("crm/deals/\(id)", body: body)
            env.toast.show("Deal saved")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
