import SwiftUI

// Projects: budgets, time and profit per job. Durations are integer minutes
// (`totalHours` and `estimatedHours` included, despite the names); rates,
// budgets and amounts are minor units.

enum Projects {
    static let statuses: [(value: String, label: String)] = [
        ("active", "Active"), ("on_hold", "On hold"), ("completed", "Completed"), ("cancelled", "Cancelled"), ("archived", "Archived"),
    ]

    static let billingTypes: [(value: String, label: String)] = [
        ("hourly", "Hourly"), ("fixed", "Fixed price"), ("milestone", "Milestones"), ("non_billable", "Not billable"),
    ]

    static let priorities: [(value: String, label: String)] = [
        ("low", "Low"), ("medium", "Medium"), ("high", "High"), ("urgent", "Urgent"),
    ]

    static func priorityTone(_ priority: String?) -> Tone {
        switch priority {
        case "urgent": .negative
        case "high": .orange
        case "medium": .info
        default: .neutral
        }
    }

    /// Value of an entry at its rate.
    static func amount(_ entry: JSONValue) -> Int {
        let minutes = entry["minutes"]?.intValue ?? 0
        let rate = entry["hourlyRate"]?.intValue ?? 0
        return Int((Double(minutes) * Double(rate) / 60).rounded())
    }

    static func taskDone(_ task: JSONValue) -> Bool {
        let status = task["status"]?.stringValue
        return status == "done" || status == "cancelled"
    }
}

struct ProjectsTimeBody: Encodable, Sendable {
    var date: String
    var minutes: Int
    var description: String?
    var isBillable: Bool
    var taskId: String?
}

struct ProjectsTaskBody: Encodable, Sendable {
    var title: String
    var priority: String
    var dueDate: String?
    var assigneeId: String?
}

struct ProjectsTimerBody: Encodable, Sendable {
    var isBillable = true
}

/// A project: progress on time, budget and tasks, profit so far, its tasks,
/// time and milestones, with a timer and "Log time" at hand.
struct ProjectsDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var project: JSONValue?
    @State private var profit: JSONValue?
    @State private var timer: JSONValue?
    @State private var error: String?
    @State private var loggingMinutes: Int?
    @State private var addingTask = false
    @State private var confirmInvoice = false
    @State private var working = false

    private var currency: String { project?["currency"]?.stringValue ?? env.session.currency }

    var body: some View {
        ScrollView {
            if let project {
                VStack(alignment: .leading, spacing: 24) {
                    hero(project)
                    progress(project)
                    if let profit { profitCard(profit) }
                    tasks(project)
                    time(project)
                    milestones(project)
                    members(project)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }.padding(.top, 80)
            } else {
                SkeletonRows(rows: 8, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Project")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("How is the project \(project?["name"]?.stringValue ?? "") tracking against its budget?", page: "projects")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if project?["billingType"]?.stringValue != "non_billable", project?["contact"]?.objectValue != nil {
                        Button { confirmInvoice = true } label: { Label("Invoice unbilled time", systemImage: "doc.text") }
                    }
                    Menu {
                        ForEach(Projects.statuses, id: \.value) { status in
                            Button(status.label) { Task { await setStatus(status.value) } }
                                .disabled(project?["status"]?.stringValue == status.value)
                        }
                    } label: {
                        Label("Change status", systemImage: "flag")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if project != nil {
                PurchasesActionBar {
                    timerButton
                    Button { loggingMinutes = 60 } label: { Label("Log time", systemImage: "clock") }
                        .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                }
            }
        }
        .confirmationDialog("Invoice unbilled time?", isPresented: $confirmInvoice, titleVisibility: .visible) {
            Button("Create invoice") { Task { await invoice() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("A draft invoice is made for \(project?["contact.name"]?.stringValue ?? "the client") from every unbilled billable entry.")
        }
        .sheet(item: Binding(get: { loggingMinutes.map(ProjectsMinutes.init) }, set: { loggingMinutes = $0?.minutes })) { start in
            if let project {
                ProjectsLogTimeSheet(project: project, minutes: start.minutes) {
                    Task { await load() }
                }
            }
        }
        .sheet(isPresented: $addingTask) {
            if let project { ProjectsNewTaskSheet(project: project) { Task { await load() } } }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: Hero and progress

    private func hero(_ project: JSONValue) -> some View {
        let status = project["status"]?.stringValue ?? "active"
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                if let priority = project["priority"]?.stringValue, priority != "medium" {
                    LedgerStatus(text: "\(priority.humanized) priority", tone: Projects.priorityTone(priority))
                }
            }
            Text(project["name"]?.stringValue ?? "Project")
                .font(.system(size: 28, weight: .semibold))
                .tracking(-0.6)
                .foregroundStyle(DTheme.ink)
            let facts = [
                project["contact.name"]?.stringValue,
                Projects.billingTypes.first { $0.value == project["billingType"]?.stringValue }?.label,
                rateText(project),
                dates(project),
            ].compactMap { $0 }
            Text(facts.joined(separator: " · "))
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
            if let description = project["description"]?.stringValue, !description.isEmpty {
                Text(description).font(.system(size: 14)).foregroundStyle(DTheme.inkSecondary).padding(.top, 2)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func rateText(_ project: JSONValue) -> String? {
        switch project["billingType"]?.stringValue {
        case "hourly":
            let rate = project["hourlyRate"]?.intValue ?? 0
            return rate > 0 ? "\(Money.format(rate, currency: currency))/h" : nil
        case "fixed":
            let price = project["fixedPrice"]?.intValue ?? 0
            return price > 0 ? Money.format(price, currency: currency) : nil
        default:
            return nil
        }
    }

    private func dates(_ project: JSONValue) -> String? {
        let start = project["startDate"]?.stringValue.map { DubblDate.short($0) }
        let end = project["endDate"]?.stringValue.map { DubblDate.short($0) }
        switch (start, end) {
        case let (start?, end?): return "\(start) – \(end)"
        case let (nil, end?): return "Due \(end)"
        case let (start?, nil): return "From \(start)"
        default: return nil
        }
    }

    private func progress(_ project: JSONValue) -> some View {
        let logged = project["totalHours"]?.intValue ?? 0
        let estimate = project["estimatedHours"]?.intValue ?? 0
        let budget = project["budget"]?.intValue ?? 0
        let entries = project.opsArray("timeEntries")
        let timeValue = entries.reduce(0) { $0 + Projects.amount($1) }
        let tasks = project.opsArray("tasks")
        let done = tasks.filter { $0["status"]?.stringValue == "done" }.count
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Progress")
            VStack(alignment: .leading, spacing: 16) {
                meter(
                    "Time",
                    value: OperationsFormat.minutes(logged),
                    of: estimate > 0 ? OperationsFormat.minutes(estimate) : nil,
                    fraction: estimate > 0 ? Double(logged) / Double(estimate) : nil
                )
                meter(
                    "Budget",
                    value: Money.short(timeValue, currency: currency),
                    of: budget > 0 ? Money.short(budget, currency: currency) : nil,
                    fraction: budget > 0 ? Double(timeValue) / Double(budget) : nil
                )
                if !tasks.isEmpty {
                    meter("Tasks", value: "\(done)", of: "\(tasks.count)", fraction: Double(done) / Double(tasks.count))
                }
                let billed = project["totalBilled"]?.intValue ?? 0
                if billed > 0 {
                    HStack {
                        Text("Billed so far").font(.system(size: 14)).foregroundStyle(DTheme.inkSecondary)
                        Spacer()
                        OperationsMoney(minor: billed, currency: currency, size: 14)
                    }
                }
            }
            .dubblCard()
        }
    }

    private func meter(_ label: String, value: String, of total: String?, fraction: Double?) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).font(.system(size: 14, weight: .medium)).foregroundStyle(DTheme.inkSecondary)
                Spacer()
                Text(value)
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle((fraction ?? 0) > 1 ? DTheme.negative : DTheme.ink)
                if let total {
                    Text("of \(total)").font(.system(size: 13.5)).monospacedDigit().foregroundStyle(DTheme.inkTertiary)
                }
            }
            if let fraction {
                OperationsBar(fraction: fraction, tone: fraction > 0.9 ? .warning : .neutral)
            }
        }
    }

    private func profitCard(_ entry: JSONValue) -> some View {
        let profitValue = entry["profit"]?.intValue ?? 0
        let margin = OperationsFormat.double(entry["margin"])
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Profit this year")
            CardStack {
                DetailRow("Revenue", Money.format(entry["revenue"]?.intValue ?? 0, currency: currency))
                DetailRow("Costs", Money.format(entry["costs"]?.intValue ?? 0, currency: currency))
                DetailRow(label: "Profit") {
                    HStack(spacing: 6) {
                        Text(Money.format(profitValue, currency: currency))
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .foregroundStyle(profitValue < 0 ? DTheme.negative : DTheme.ink)
                        if let margin {
                            Text("\(OperationsFormat.number((margin * 10).rounded() / 10))%").foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                }
            }
        }
    }

    // MARK: Tasks

    private func tasks(_ project: JSONValue) -> some View {
        let all = project.opsArray("tasks").sorted { a, b in
            let doneA = Projects.taskDone(a), doneB = Projects.taskDone(b)
            if doneA != doneB { return !doneA }
            return (a["dueDate"]?.stringValue ?? "9999", a["sortOrder"]?.intValue ?? 0) < (b["dueDate"]?.stringValue ?? "9999", b["sortOrder"]?.intValue ?? 0)
        }
        let open = all.filter { !Projects.taskDone($0) }.count
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Tasks · \(open) open", action: ("Add", { addingTask = true }))
            if all.isEmpty {
                Text("Break the work into tasks to track what's left.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack(dividerInset: 52) {
                    ForEach(all.prefix(12), id: \.recordID) { task in
                        taskRow(task)
                    }
                }
            }
        }
    }

    private func taskRow(_ task: JSONValue) -> some View {
        let done = task["status"]?.stringValue == "done"
        let due = task["dueDate"]?.stringValue
        let dueTone = done ? Tone.neutral : CRM.closeTone(due)
        let parts = [
            task["assignee.user.name"]?.stringValue,
            due.map { "Due \(DubblDate.short($0))" },
            (task["status"]?.stringValue).flatMap { ["in_progress", "in_review", "backlog"].contains($0) ? RecordFormat.statusLabel($0) : nil },
        ].compactMap { $0 }
        return HStack(alignment: .top, spacing: 12) {
            Button { Task { await toggle(task) } } label: {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(done ? DTheme.positive : DTheme.inkTertiary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(done ? "Mark as not done" : "Mark as done")
            VStack(alignment: .leading, spacing: 3) {
                Text(task["title"]?.stringValue ?? "Task")
                    .font(.system(size: 15))
                    .foregroundStyle(done ? DTheme.inkTertiary : DTheme.ink)
                    .strikethrough(done, color: DTheme.inkTertiary)
                if !parts.isEmpty {
                    Text(parts.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(dueTone == .negative ? DTheme.negative : DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            if let priority = task["priority"]?.stringValue, priority == "high" || priority == "urgent", !done {
                LedgerStatus(text: priority.humanized, tone: Projects.priorityTone(priority))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: Time

    private func time(_ project: JSONValue) -> some View {
        let entries = project.opsArray("timeEntries").sorted { ($0["date"]?.stringValue ?? "") > ($1["date"]?.stringValue ?? "") }
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Time · \(entries.count) \(entries.count == 1 ? "entry" : "entries")", action: ("Log", { loggingMinutes = 60 }))
            if entries.isEmpty {
                Text("Time you log on this project shows up here.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(entries.prefix(10), id: \.recordID) { entry in
                        let subtitle = [
                            entry["user.name"]?.stringValue,
                            DubblDate.short(entry["date"]?.stringValue),
                            entry["isBillable"]?.boolValue == false ? "Not billable" : (entry["invoiceId"]?.stringValue != nil ? "Invoiced" : nil),
                        ].compactMap { $0 }
                        OperationsCardRow(
                            title: entry["description"]?.stringValue ?? entry["task.title"]?.stringValue ?? "Time",
                            subtitle: subtitle.joined(separator: " · ")
                        ) {
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(OperationsFormat.minutes(entry["minutes"]?.intValue ?? 0))
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.ink)
                                let amount = Projects.amount(entry)
                                if amount > 0 {
                                    Text(Money.format(amount, currency: currency))
                                        .font(.system(size: 12.5))
                                        .monospacedDigit()
                                        .foregroundStyle(DTheme.inkSecondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Milestones and members

    @ViewBuilder
    private func milestones(_ project: JSONValue) -> some View {
        let milestones = project.opsArray("milestones").sorted { ($0["sortOrder"]?.intValue ?? 0) < ($1["sortOrder"]?.intValue ?? 0) }
        if !milestones.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Milestones")
                CardStack {
                    ForEach(milestones, id: \.recordID) { milestone in
                        let status = milestone["status"]?.stringValue ?? "upcoming"
                        OperationsCardRow(
                            title: milestone["title"]?.stringValue ?? "Milestone",
                            subtitle: [milestone["dueDate"]?.stringValue.map { "Due \(DubblDate.short($0))" }, milestone["progressPercent"]?.intValue.map { "\($0)% done" }].compactMap { $0 }.joined(separator: " · ")
                        ) {
                            VStack(alignment: .trailing, spacing: 5) {
                                let amount = milestone["amount"]?.intValue ?? 0
                                if amount > 0 { OperationsMoney(minor: amount, currency: currency) }
                                LedgerStatus(text: RecordFormat.statusLabel(status), tone: status == "upcoming" ? .neutral : RecordFormat.tone(status, spec: nil))
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func members(_ project: JSONValue) -> some View {
        let members = project.opsArray("members")
        if !members.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("People")
                CardStack {
                    ForEach(members, id: \.recordID) { member in
                        let name = member["member.user.name"]?.stringValue ?? member["member.user.email"]?.stringValue ?? "Member"
                        HStack(spacing: 12) {
                            Avatar(name: name, imageURL: member["member.user.image"]?.stringValue, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(name).font(.system(size: 15, weight: .medium)).foregroundStyle(DTheme.ink)
                                Text(RecordFormat.statusLabel(member["role"]?.stringValue ?? "contributor"))
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                            Spacer()
                            if let rate = member["hourlyRate"]?.intValue, rate > 0 {
                                Text("\(Money.format(rate, currency: currency))/h").font(.system(size: 13.5)).monospacedDigit().foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                }
            }
        }
    }

    // MARK: Timer

    @ViewBuilder
    private var timerButton: some View {
        if let timer {
            Button { Task { await stopTimer(timer) } } label: {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    HStack(spacing: 8) {
                        Image(systemName: "stop.fill")
                        Text(Self.clock(Self.elapsed(timer, now: context.date))).monospacedDigit()
                    }
                }
            }
            .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true, tone: .negative))
            .disabled(working)
        } else {
            Button { Task { await startTimer() } } label: { Label("Timer", systemImage: "play.fill") }
                .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                .disabled(working)
        }
    }

    /// Seconds on a timer: paused ones hold their total, running ones add time since start.
    static func elapsed(_ timer: JSONValue, now: Date) -> Int {
        let accumulated = timer["accumulatedSeconds"]?.intValue ?? 0
        if timer["pausedAt"]?.stringValue != nil { return accumulated }
        guard let started = DubblDate.parseMoment(timer["startedAt"]?.stringValue) else { return accumulated }
        return accumulated + max(0, Int(now.timeIntervalSince(started)))
    }

    static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
    }

    private func startTimer() async {
        working = true
        defer { working = false }
        do {
            let response: JSONValue = try await env.api.post("projects/\(id)/timer", body: ProjectsTimerBody())
            let started = response["timer"].flatMap { $0.isNull ? nil : $0 }
            withAnimation(.snappy) {
                timer = started ?? .object(["startedAt": .string(Date.now.formatted(.iso8601)), "accumulatedSeconds": .number(0)])
            }
        } catch {
            env.toast.error(error)
        }
    }

    /// Stopping doesn't log anything by itself: open "Log time" with the elapsed minutes, then clear the timer.
    private func stopTimer(_ timer: JSONValue) async {
        let minutes = max(1, Int((Double(Self.elapsed(timer, now: .now)) / 60).rounded()))
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.delete("projects/\(id)/timer")
            withAnimation(.snappy) { self.timer = nil }
            loggingMinutes = minutes
        } catch {
            env.toast.error(error)
        }
    }

    // MARK: Loading and actions

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("projects/\(id)")
            async let timerResponse: JSONValue? = try? env.api.get("projects/\(id)/timer")
            // The Reports area's demo fixture for this route is grouped by contact, so demo mode reads its own copy.
            let profitPath = OperationsFormat.isDemo ? "reports/profitability/demo-projects" : "reports/profitability"
            async let profitResponse: JSONValue? = try? env.api.get(profitPath, query: ["groupBy": "project"])
            let (timerData, profitData) = await (timerResponse, profitResponse)
            withAnimation(.snappy) {
                project = response["project"] ?? response
                timer = timerData?["timer"].flatMap { $0.isNull || $0.isEmpty ? nil : $0 }
                profit = profitData?.opsArray("entries").first { $0["projectId"]?.stringValue == id }
                error = nil
            }
        } catch {
            if project == nil { self.error = error.localizedDescription }
        }
    }

    private func toggle(_ task: JSONValue) async {
        guard let taskId = task.recordID, let project else { return }
        let next = task["status"]?.stringValue == "done" ? "todo" : "done"
        let tasks = project.opsArray("tasks").map { $0.recordID == taskId ? $0.opsSetting("status", .string(next)) : $0 }
        withAnimation(.snappy) { self.project = project.opsSetting("tasks", .array(tasks)) }
        do {
            let _: JSONValue = try await env.api.patch("projects/\(id)/tasks/\(taskId)", body: InventoryStatusBody(status: next))
        } catch {
            env.toast.error(error)
            await load()
        }
    }

    private func setStatus(_ status: String) async {
        do {
            let _: JSONValue = try await env.api.patch("projects/\(id)", body: InventoryStatusBody(status: status))
            env.toast.show("Project \(RecordFormat.statusLabel(status).lowercased())")
            NotificationCenter.default.post(name: .recordsChanged, object: "projects")
            if OperationsFormat.isDemo, let project { self.project = project.opsSetting("status", .string(status)) } else { await load() }
        } catch {
            env.toast.error(error)
        }
    }

    private func invoice() async {
        do {
            let response: JSONValue = try await env.api.post("projects/\(id)/invoice", body: [String: String]())
            let number = response["invoice.invoiceNumber"]?.stringValue
            env.toast.show(number.map { "Invoice \($0) drafted" } ?? "Invoice drafted")
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// How long the "Log time" sheet starts with.
struct ProjectsMinutes: Identifiable {
    let minutes: Int
    var id: Int { minutes }
}

/// Log time on a project: when, how long, what on, and whether it's billable.
struct ProjectsLogTimeSheet: View {
    let project: JSONValue
    var minutes: Int = 60
    let onSaved: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var duration = 60
    @State private var description = ""
    @State private var billable = true
    @State private var task = ""
    @State private var saving = false
    @State private var error: String?

    private var openTasks: [JSONValue] { project.opsArray("tasks").filter { !Projects.taskDone($0) } }

    var body: some View {
        OperationsFormSheet(title: "Log time", confirm: "Log", canSave: duration > 0, saving: saving, error: error, onSave: save) {
            VStack(alignment: .leading, spacing: 2) {
                Text(project["name"]?.stringValue ?? "Project").font(.system(size: 15, weight: .medium)).foregroundStyle(DTheme.inkSecondary)
                Text(OperationsFormat.minutes(duration))
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                    .contentTransition(.numericText(value: Double(duration)))
                    .animation(.snappy, value: duration)
            }
            .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach([15, 30, 60, 90, 120, 240, 480], id: \.self) { option in
                        let selected = duration == option
                        Button { duration = option } label: {
                            Text(OperationsFormat.minutes(option))
                                .font(.system(size: 13.5, weight: .medium))
                                .monospacedDigit()
                                .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                                .padding(.horizontal, 12)
                                .frame(height: 32)
                                .background(selected ? DTheme.tintStrong : DTheme.card, in: Capsule())
                                .overlay(Capsule().strokeBorder(selected ? .clear : DTheme.hairline, lineWidth: 0.5))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .sensoryFeedback(.selection, trigger: duration)

            CardStack {
                Stepper(value: $duration, in: 1 ... 24 * 60, step: 15) {
                    Text("Adjust by 15 minutes").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                OperationsDateRow(label: "Date", date: $date)
            }
            CardStack {
                FieldRow(label: "What did you work on?") {
                    TextField("e.g. Homepage wireframes", text: $description, axis: .vertical).lineLimit(1 ... 4)
                }
                if !openTasks.isEmpty {
                    OperationsPickerRow(label: "Task", selection: $task, options: [("", "None")] + openTasks.compactMap { item in
                        item.recordID.map { ($0, item["title"]?.stringValue ?? "Task") }
                    })
                }
                Toggle(isOn: $billable) {
                    Text("Billable").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
            }
        }
        .presentationDetents([.large])
        .onAppear {
            duration = minutes
            billable = project["billingType"]?.stringValue != "non_billable"
        }
    }

    private func save() async {
        guard let id = project.recordID else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = ProjectsTimeBody(
                date: DubblDate.string(date),
                minutes: duration,
                description: OperationsFormat.trimmed(description),
                isBillable: billable,
                taskId: task.isEmpty ? nil : task
            )
            let _: JSONValue = try await env.api.post("projects/\(id)/time-entries", body: body)
            env.toast.show("\(OperationsFormat.minutes(duration)) logged")
            NotificationCenter.default.post(name: .recordsChanged, object: "projects")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A new task on a project.
struct ProjectsNewTaskSheet: View {
    let project: JSONValue
    let onSaved: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var priority = "medium"
    @State private var hasDue = false
    @State private var due = Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now
    @State private var assignee = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        OperationsFormSheet(title: "New task", confirm: "Add", canSave: OperationsFormat.trimmed(title) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Task") { TextField("What needs doing", text: $title).focused($focused) }
                let members = project.opsArray("members")
                if !members.isEmpty {
                    OperationsPickerRow(label: "Assignee", selection: $assignee, options: [("", "Nobody")] + members.compactMap { member in
                        member["memberId"]?.stringValue.map { ($0, member["member.user.name"]?.stringValue ?? member["member.user.email"]?.stringValue ?? "Member") }
                    })
                }
                OperationsPickerRow(label: "Priority", selection: $priority, options: Projects.priorities)
                Toggle(isOn: $hasDue.animation(.snappy)) {
                    Text("Due date").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                if hasDue { OperationsDateRow(label: "Due", date: $due) }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { focused = true }
    }

    private func save() async {
        guard let id = project.recordID else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = ProjectsTaskBody(
                title: title.trimmingCharacters(in: .whitespaces),
                priority: priority,
                dueDate: hasDue ? DubblDate.string(due) : nil,
                assigneeId: assignee.isEmpty ? nil : assignee
            )
            let _: JSONValue = try await env.api.post("projects/\(id)/tasks", body: body)
            env.toast.show("Task added")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ProjectsCreateBody: Encodable, Sendable {
    var name: String
    var contactId: String?
    var billingType: String
    var hourlyRate: Int
    var fixedPrice: Int
    var budget: Int
    var estimatedHours: Int
    var currency: String
    var startDate: String?
    var endDate: String?
}

/// A new project: who it's for, how it's billed, and its budget.
struct ProjectsNewSheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var contacts: [Contact] = []
    @State private var contact = ""
    @State private var billing = "hourly"
    @State private var rate = 0
    @State private var fixedPrice = 0
    @State private var budget = 0
    @State private var hours = ""
    @State private var hasEnd = false
    @State private var start = Date.now
    @State private var end = Calendar.current.date(byAdding: .month, value: 1, to: .now) ?? .now
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "New project", confirm: "Create", canSave: OperationsFormat.trimmed(name) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("e.g. Hooli website rebuild", text: $name) }
                OperationsPickerRow(label: "Client", selection: $contact, options: [("", "None")] + contacts.map { ($0.id, $0.name) })
            }
            OperationsSegment(selection: $billing, options: [("hourly", "Hourly"), ("fixed", "Fixed"), ("milestone", "Milestones"), ("non_billable", "Internal")])
            CardStack {
                if billing == "hourly" {
                    FieldRow(label: "Hourly rate") { AmountField(minor: $rate, currency: env.session.currency) }
                }
                if billing == "fixed" {
                    FieldRow(label: "Fixed price") { AmountField(minor: $fixedPrice, currency: env.session.currency) }
                }
                FieldRow(label: "Budget") { AmountField(minor: $budget, currency: env.session.currency) }
                FieldRow(label: "Estimated hours") { TextField("Optional", text: $hours).keyboardType(.numberPad) }
            }
            CardStack {
                OperationsDateRow(label: "Starts", date: $start)
                Toggle(isOn: $hasEnd.animation(.snappy)) {
                    Text("End date").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                if hasEnd { OperationsDateRow(label: "Ends", date: $end) }
            }
        }
        .presentationDetents([.large])
        .task {
            let page: Page<Contact>? = try? await env.api.get("contacts", query: ["limit": "100", "sortBy": "name", "sortOrder": "asc"])
            contacts = (page?.data ?? []).filter { $0.type != "supplier" }
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = ProjectsCreateBody(
                name: name.trimmingCharacters(in: .whitespaces),
                contactId: contact.isEmpty ? nil : contact,
                billingType: billing,
                hourlyRate: billing == "hourly" ? rate : 0,
                fixedPrice: billing == "fixed" ? fixedPrice : 0,
                budget: budget,
                estimatedHours: (Int(hours) ?? 0) * 60,
                currency: env.session.currency,
                startDate: DubblDate.string(start),
                endDate: hasEnd ? DubblDate.string(end) : nil
            )
            let _: JSONValue = try await env.api.post("projects", body: body)
            env.toast.show("Project created")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
