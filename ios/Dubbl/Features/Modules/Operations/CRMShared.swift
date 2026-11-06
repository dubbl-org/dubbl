import SwiftUI

// CRM pieces shared by the board, the deal screen and the activity feed.
// Deals carry no status column: won when `wonAt` is set, else lost when
// `lostAt` is set, else open. `stageId` is free text naming one of the
// pipeline's `stages[].id`; won and lost are outcomes, not columns.

/// One column of a pipeline.
struct CRMStage: Hashable, Identifiable {
    let id: String
    let name: String
    /// Position in the pipeline, for a stable tone on custom stages.
    var index = 0

    var tone: Tone { CRM.tone(id, index: index) }
}

enum CRM {
    static let wonStage = "closed_won"
    static let lostStage = "closed_lost"

    /// What a pipeline without its own stages uses (the web's DEFAULT_STAGES).
    static let defaultStages: [(id: String, name: String, color: String)] = [
        ("lead", "Lead", "#94a3b8"), ("qualified", "Qualified", "#60a5fa"), ("proposal", "Proposal", "#a78bfa"),
        ("negotiation", "Negotiation", "#f59e0b"), (wonStage, "Won", "#10b981"), (lostStage, "Lost", "#ef4444"),
    ]

    /// Colours the web picks for new stages; stored with the stage.
    static let stageColors = ["#94a3b8", "#60a5fa", "#a78bfa", "#f59e0b", "#f472b6", "#34d399", "#fb923c", "#22d3ee"]

    static let activityTypes: [(value: String, label: String, symbol: String)] = [
        ("note", "Note", "note.text"), ("call", "Call", "phone"), ("email", "Email", "envelope"),
        ("meeting", "Meeting", "person.2"), ("task", "Task", "checkmark.circle"),
    ]

    static let sources: [(value: String, label: String)] = [
        ("website", "Website"), ("referral", "Referral"), ("cold_outreach", "Cold outreach"), ("event", "Event"), ("other", "Other"),
    ]

    static func activitySymbol(_ type: String?) -> String {
        activityTypes.first { $0.value == type }?.symbol ?? "circle"
    }

    static func activityLabel(_ type: String?) -> String {
        activityTypes.first { $0.value == type }?.label ?? (type ?? "Activity").humanized
    }

    static func activityTone(_ type: String?) -> Tone {
        switch type {
        case "call": .positive
        case "email": .info
        case "meeting": .special
        case "task": .warning
        default: .neutral
        }
    }

    /// Every stage of a pipeline in order, defaults when it has none.
    static func stages(_ pipeline: JSONValue?) -> [CRMStage] {
        let own = pipeline?["stages"]?.arrayValue ?? []
        let list: [(String, String)] = own.isEmpty
            ? defaultStages.map { ($0.id, $0.name) }
            : own.compactMap { stage in
                guard let id = stage["id"]?.stringValue else { return nil }
                return (id, stage["name"]?.stringValue ?? id.humanized)
            }
        return list.enumerated().map { CRMStage(id: $1.0, name: $1.1, index: $0) }
    }

    /// The columns of the board: every stage but won and lost.
    static func openStages(_ pipeline: JSONValue?) -> [CRMStage] {
        stages(pipeline).filter { $0.id != wonStage && $0.id != lostStage }
    }

    /// The default pipeline, else the first.
    static func defaultPipeline(_ pipelines: [JSONValue]) -> JSONValue? {
        pipelines.first { $0["isDefault"]?.boolValue == true } ?? pipelines.first
    }

    static func tone(_ stageId: String, index: Int) -> Tone {
        switch stageId {
        case "lead": return .neutral
        case "qualified": return .info
        case "proposal": return .special
        case "negotiation": return .warning
        case wonStage: return .positive
        case lostStage: return .negative
        default:
            let cycle: [Tone] = [.neutral, .info, .special, .warning, .orange, .positive]
            return cycle[index % cycle.count]
        }
    }

    /// "won", "lost" or "open".
    static func outcome(_ deal: JSONValue) -> String {
        if deal["wonAt"]?.stringValue != nil { return "won" }
        if deal["lostAt"]?.stringValue != nil { return "lost" }
        return "open"
    }

    /// The deal's value at its chance of closing, in minor units.
    static func weighted(_ deal: JSONValue) -> Int {
        let value = deal["valueCents"]?.intValue ?? 0
        let probability = deal["probability"]?.intValue ?? 0
        return Int((Double(value) * Double(probability) / 100).rounded())
    }

    /// Name of a stage id in a pipeline, or the id in words.
    static func stageName(_ id: String?, in pipeline: JSONValue?) -> String {
        guard let id else { return "" }
        if let stage = stages(pipeline).first(where: { $0.id == id }) { return stage.name }
        if let stage = defaultStages.first(where: { $0.id == id }) { return stage.name }
        return id.humanized
    }

    /// Close date tone: late is red, within a week amber.
    static func closeTone(_ date: String?) -> Tone {
        guard let days = DubblDate.daysFromToday(date) else { return .neutral }
        if days < 0 { return .negative }
        if days <= 7 { return .warning }
        return .neutral
    }
}

// MARK: - Bodies

struct CRMStageBody: Encodable, Sendable {
    var stageId: String
}

struct CRMLostBody: Encodable, Sendable {
    var reason: String?
}

struct CRMActivityBody: Encodable, Sendable {
    var type: String
    var content: String?
    var scheduledAt: String?
}

struct CRMCompleteBody: Encodable, Sendable {
    var completed: Bool
}

struct CRMDealBody: Encodable, Sendable {
    var pipelineId: String
    var stageId: String
    var contactId: String?
    var title: String
    var valueCents: Int
    var currency: String
    var probability: Int?
    var expectedCloseDate: String?
    var source: String?
    var notes: String?
}

/// PATCH crm/deals/{id}. Probability can't be cleared, so it's always sent.
struct CRMDealEditBody: Encodable, Sendable {
    var title: String
    var valueCents: Int
    var probability: Int
    var expectedCloseDate: String?
    var notes: String?
}

// MARK: - Log activity

/// Log a call, note, email, meeting or task on a deal, now or scheduled.
/// Without a fixed deal it asks which open deal first.
struct CRMLogActivitySheet: View {
    var dealId: String?
    var dealTitle: String?
    var onSaved: () -> Void = {}

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var type = "call"
    @State private var content = ""
    @State private var schedule = false
    @State private var when = Date.now.addingTimeInterval(3600)
    @State private var pickedDeal = ""
    @State private var deals: [JSONValue] = []
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var targetDeal: String? { dealId ?? (pickedDeal.isEmpty ? nil : pickedDeal) }

    var body: some View {
        OperationsFormSheet(
            title: "Log activity",
            confirm: schedule ? "Schedule" : "Log",
            canSave: targetDeal != nil,
            saving: saving,
            error: error,
            onSave: save
        ) {
            if dealId == nil {
                CardStack {
                    OperationsPickerRow(
                        label: "Deal",
                        selection: $pickedDeal,
                        options: [("", deals.isEmpty ? "Loading…" : "Choose")] + deals.compactMap { deal in
                            deal.recordID.map { ($0, deal["title"]?.stringValue ?? "Deal") }
                        }
                    )
                }
            } else if let dealTitle {
                Text(dealTitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(.horizontal, 4)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CRM.activityTypes, id: \.value) { option in
                        let selected = type == option.value
                        Button {
                            withAnimation(.snappy(duration: 0.2)) { type = option.value }
                        } label: {
                            Label(option.label, systemImage: option.symbol)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                                .padding(.horizontal, 14)
                                .frame(height: 38)
                                .background(selected ? DTheme.tintStrong : DTheme.card, in: Capsule())
                                .overlay(Capsule().strokeBorder(selected ? .clear : DTheme.hairline, lineWidth: 0.5))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
            .sensoryFeedback(.selection, trigger: type)

            CardStack {
                FieldRow(label: "What happened") {
                    TextField(placeholder, text: $content, axis: .vertical)
                        .lineLimit(3 ... 8)
                        .focused($focused)
                }
            }

            CardStack {
                Toggle(isOn: $schedule.animation(.snappy)) {
                    Text("Schedule for later")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                if schedule {
                    DatePicker(selection: $when) {
                        Text("When").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                    }
                    .tint(DTheme.ink)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                }
            }
        }
        .presentationDetents([.large])
        .task {
            if dealId == nil { await loadDeals() } else { focused = true }
        }
    }

    private var placeholder: String {
        switch type {
        case "call": "Who you spoke to and what was agreed"
        case "email": "What you sent or received"
        case "meeting": "Who was there, next steps"
        case "task": "What needs doing"
        default: "A note on this deal"
        }
    }

    private func loadDeals() async {
        if let response: JSONValue = try? await env.api.get("crm/deals", query: ["status": "active", "limit": "100", "sortBy": "name", "sortOrder": "asc"]) {
            deals = response["data"]?.arrayValue ?? []
        }
    }

    private func save() async {
        guard let targetDeal else { return }
        saving = true
        error = nil
        defer { saving = false }
        let body = CRMActivityBody(
            type: type,
            content: OperationsFormat.trimmed(content),
            scheduledAt: schedule ? when.formatted(.iso8601) : nil
        )
        do {
            let _: JSONValue = try await env.api.post("crm/deals/\(targetDeal)/activities", body: body)
            env.toast.show(schedule ? "Activity scheduled" : "\(CRM.activityLabel(type)) logged")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Lost reason

/// Close a deal as lost, with an optional reason.
struct CRMLostSheet: View {
    let dealId: String
    let title: String
    var onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "Mark as lost", confirm: "Mark lost", saving: saving, error: error, onSave: save) {
            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
                .padding(.horizontal, 4)
            CardStack {
                FieldRow(label: "Why was it lost?") {
                    TextField("Optional, e.g. went with a competitor", text: $reason, axis: .vertical)
                        .lineLimit(2 ... 5)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("crm/deals/\(dealId)/lost", body: CRMLostBody(reason: OperationsFormat.trimmed(reason)))
            env.toast.show("Marked as lost")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - New deal

/// New deal: title, value, pipeline and stage, contact, chance and close date.
struct CRMNewDealSheet: View {
    var pipelineId: String?
    var stageId: String?
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var value = 0
    @State private var pipelines: [JSONValue] = []
    @State private var pipeline = ""
    @State private var stage = ""
    @State private var contacts: [Contact] = []
    @State private var contact = ""
    @State private var probability = 20
    @State private var hasCloseDate = true
    @State private var closeDate = Calendar.current.date(byAdding: .day, value: 30, to: .now) ?? .now
    @State private var source = ""
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var chosenPipeline: JSONValue? { pipelines.first { $0.recordID == pipeline } }
    private var canSave: Bool { OperationsFormat.trimmed(title) != nil && !pipeline.isEmpty && !stage.isEmpty }

    var body: some View {
        OperationsFormSheet(title: "New deal", confirm: "Add", canSave: canSave, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Deal") {
                    TextField("e.g. Website rebuild for Hooli", text: $title)
                        .focused($focused)
                }
                FieldRow(label: "Value") {
                    AmountField(minor: $value, currency: env.session.currency)
                }
            }
            CardStack {
                if pipelines.count > 1 {
                    OperationsPickerRow(label: "Pipeline", selection: $pipeline, options: pipelines.compactMap { item in
                        item.recordID.map { ($0, item["name"]?.stringValue ?? "Pipeline") }
                    })
                }
                OperationsPickerRow(label: "Stage", selection: $stage, options: CRM.openStages(chosenPipeline).map { ($0.id, $0.name) })
                OperationsPickerRow(label: "Contact", selection: $contact, options: [("", "None")] + contacts.map { ($0.id, $0.name) })
            }
            CardStack {
                Stepper(value: $probability, in: 0 ... 100, step: 10) {
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
                if hasCloseDate {
                    OperationsDateRow(label: "Close by", date: $closeDate)
                }
                OperationsPickerRow(label: "Source", selection: $source, options: [("", "None")] + CRM.sources.map { ($0.value, $0.label) })
            }
            CardStack {
                FieldRow(label: "Notes") {
                    TextField("Optional", text: $notes, axis: .vertical).lineLimit(2 ... 6)
                }
            }
        }
        .presentationDetents([.large])
        .onChange(of: pipeline) { _, _ in
            let open = CRM.openStages(chosenPipeline)
            if !open.contains(where: { $0.id == stage }) { stage = open.first?.id ?? "" }
        }
        .task { await load() }
    }

    private func load() async {
        focused = true
        async let pipelinesResponse: JSONValue? = try? env.api.get("crm/pipelines")
        async let contactsResponse: Page<Contact>? = try? env.api.get("contacts", query: ["limit": "100", "sortBy": "name", "sortOrder": "asc"])
        let (loadedPipelines, loadedContacts) = await (pipelinesResponse, contactsResponse)
        pipelines = loadedPipelines?["pipelines"]?.arrayValue ?? []
        contacts = loadedContacts?.data ?? []
        pipeline = pipelineId ?? CRM.defaultPipeline(pipelines)?.recordID ?? ""
        let open = CRM.openStages(chosenPipeline)
        stage = stageId.flatMap { id in open.first { $0.id == id }?.id } ?? open.first?.id ?? ""
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let body = CRMDealBody(
            pipelineId: pipeline,
            stageId: stage,
            contactId: contact.isEmpty ? nil : contact,
            title: title.trimmingCharacters(in: .whitespaces),
            valueCents: value,
            currency: env.session.currency,
            probability: probability,
            expectedCloseDate: hasCloseDate ? DubblDate.string(closeDate) : nil,
            source: source.isEmpty ? nil : source,
            notes: OperationsFormat.trimmed(notes)
        )
        do {
            let _: JSONValue = try await env.api.post("crm/deals", body: body)
            env.toast.show("Deal added")
            NotificationCenter.default.post(name: .recordsChanged, object: "crm-deals")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Deal card

/// A deal on the board: title, contact, value, chance, close date and owner.
struct CRMDealCard: View {
    let deal: JSONValue
    let currency: String

    var body: some View {
        let closeDate = deal["expectedCloseDate"]?.stringValue
        let owner = deal["assignedUser.name"]?.stringValue ?? deal["assignedUser.email"]?.stringValue
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(deal["title"]?.stringValue ?? "Deal")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                Spacer(minLength: 6)
                if let owner {
                    Avatar(name: owner, size: 22)
                }
            }
            if let contact = deal["contact.name"]?.stringValue {
                Text(contact)
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            HStack(spacing: 8) {
                OperationsMoney(minor: deal["valueCents"]?.intValue ?? 0, currency: deal["currency"]?.stringValue ?? currency, size: 15)
                if let probability = deal["probability"]?.intValue {
                    Text("\(probability)%")
                        .font(DFont.figure(12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                Spacer(minLength: 4)
                if let closeDate {
                    let tone = CRM.closeTone(closeDate)
                    Label(DubblDate.short(closeDate), systemImage: "calendar")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(tone == .neutral ? DTheme.inkTertiary : tone.color)
                        .labelStyle(.titleAndIcon)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(DTheme.hairline, lineWidth: 0.5))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
