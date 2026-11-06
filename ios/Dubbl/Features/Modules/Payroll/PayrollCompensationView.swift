import SwiftUI

/// Compensation: salary bands with where each person sits in theirs, and
/// review cycles. `GET payroll/compensation/bands`, `/reviews` and
/// `/equity-analysis` -> `{ data }`.
struct PayrollCompensationView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var bands: [JSONValue] = []
    @State private var reviews: [JSONValue] = []
    @State private var people: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var creatingReview = false

    private var currency: String { env.session.currency }

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    summary
                    bandsSection
                    reviewsSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Compensation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New review", systemImage: "plus") { creatingReview = true }
            }
        }
        .sheet(isPresented: $creatingReview) {
            PayrollReviewSheet { Task { await load() } }
        }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == "payroll-comp-reviews" { Task { await load() } }
        }
    }

    private var summary: some View {
        let banded = people.filter { $0["bandId"]?.stringValue != nil }
        let outside = banded.filter { $0["belowMin"]?.boolValue == true || $0["aboveMax"]?.boolValue == true }
        let active = reviews.filter { ["draft", "in_progress"].contains($0["status"]?.stringValue ?? "") }
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            PayrollStat(label: "Bands", value: "\(bands.count)", detail: "\(banded.count) of \(people.count) people placed")
            PayrollStat(label: "Outside band", value: "\(outside.count)", detail: outside.isEmpty ? "Everyone in range" : "Below or above range")
            PayrollStat(label: "Open reviews", value: "\(active.count)", detail: "\(reviews.count) in total")
            PayrollStat(label: "Review budget", value: Money.short(active.reduce(0) { $0 + ($1["totalBudget"]?.intValue ?? 0) }, currency: currency), detail: "Open reviews")
        }
    }

    @ViewBuilder
    private var bandsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Salary bands")
            if bands.isEmpty {
                Text("No bands yet. Bands set the salary range for each level.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                let floor = bands.compactMap { $0["minSalary"]?.intValue }.min() ?? 0
                let ceiling = max(bands.compactMap { $0["maxSalary"]?.intValue }.max() ?? 1, floor + 1)
                CardStack {
                    ForEach(Array(bands.sorted { ($0["minSalary"]?.intValue ?? 0) < ($1["minSalary"]?.intValue ?? 0) }.enumerated()), id: \.offset) { _, band in
                        PayrollBandRow(band: band, people: people.filter { $0["bandId"]?.stringValue == band.recordID }, floor: floor, ceiling: ceiling, currency: band["currency"]?.stringValue ?? currency)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var reviewsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Reviews")
            if reviews.isEmpty {
                Text("No reviews yet. Start one to plan raises for a date.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(Array(reviews.enumerated()), id: \.offset) { _, review in
                        if let id = review.recordID {
                            NavigationLink(value: RecordRoute(spec: "payroll-comp-reviews", id: id)) {
                                PayrollReviewRow(review: review, currency: currency)
                            }
                            .buttonStyle(RowPressStyle())
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let api = env.api
            async let bandsResponse: JSONValue = api.get("payroll/compensation/bands")
            async let reviewsResponse: JSONValue = api.get("payroll/compensation/reviews")
            async let equityResponse: JSONValue? = try? api.get("payroll/compensation/equity-analysis")
            let (b, r, e) = try await (bandsResponse, reviewsResponse, equityResponse)
            withAnimation(.snappy) {
                bands = b["data"]?.arrayValue ?? []
                reviews = r["data"]?.arrayValue ?? []
                people = e?["data"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

/// A band's range drawn on a shared scale, with a dot per person in it.
private struct PayrollBandRow: View {
    let band: JSONValue
    let people: [JSONValue]
    let floor: Int
    let ceiling: Int
    let currency: String

    var body: some View {
        let low = band["minSalary"]?.intValue ?? 0
        let mid = band["midSalary"]?.intValue ?? 0
        let high = band["maxSalary"]?.intValue ?? 0
        let span = CGFloat(ceiling - floor)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(band["name"]?.stringValue ?? "Band")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                if let level = band["level"]?.stringValue {
                    Text(level)
                        .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                Spacer()
                Text("\(people.count) \(people.count == 1 ? "person" : "people")")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            GeometryReader { proxy in
                let width = proxy.size.width
                let x = { (value: Int) in width * CGFloat(value - floor) / span }
                ZStack(alignment: .leading) {
                    Capsule().fill(DTheme.tint).frame(height: 8)
                    Capsule().fill(DTheme.tintStrong)
                        .frame(width: max(8, x(high) - x(low)), height: 8)
                        .offset(x: x(low))
                    Rectangle().fill(DTheme.inkTertiary).frame(width: 1.5, height: 12).offset(x: x(mid))
                    ForEach(Array(people.enumerated()), id: \.offset) { _, person in
                        let salary = person["salary"]?.intValue ?? 0
                        let outside = person["belowMin"]?.boolValue == true || person["aboveMax"]?.boolValue == true
                        Circle()
                            .fill(outside ? DTheme.warning : DTheme.ink)
                            .frame(width: 9, height: 9)
                            .overlay(Circle().strokeBorder(DTheme.card, lineWidth: 1.5))
                            .offset(x: min(max(0, x(salary) - 4.5), width - 9))
                    }
                }
                .frame(height: 12)
            }
            .frame(height: 12)
            HStack {
                Text(Money.short(low, currency: currency))
                Spacer()
                Text("mid \(Money.short(mid, currency: currency))")
                Spacer()
                Text(Money.short(high, currency: currency))
            }
            .font(.system(size: 12.5, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(band["name"]?.stringValue ?? "Band"), \(Money.format(low, currency: currency)) to \(Money.format(high, currency: currency)), \(people.count) people")
    }
}

private struct PayrollReviewRow: View {
    let review: JSONValue
    let currency: String

    var body: some View {
        let status = review["status"]?.stringValue ?? "draft"
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(review["name"]?.stringValue ?? "Review")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text("Effective \(DubblDate.display(review["effectiveDate"]?.stringValue))")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 5) {
                if let budget = review["totalBudget"]?.intValue {
                    Text(Money.format(budget, currency: currency))
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                }
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// One review cycle: budget against proposed raises, each person's change,
/// and moving it through draft, in progress and completed.
/// `GET/PATCH payroll/compensation/reviews/{id}` -> `{ review }` with entries.
struct PayrollReviewView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var review: JSONValue?
    @State private var error: String?

    private var currency: String { env.session.currency }
    private var status: String { review?["status"]?.stringValue ?? "draft" }

    var body: some View {
        ScrollView {
            if let review {
                let entries = review["entries"]?.arrayValue ?? []
                let increase = entries.reduce(0) { $0 + (($1["proposedSalary"]?.intValue ?? 0) - ($1["currentSalary"]?.intValue ?? 0)) }
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                        Text(review["name"]?.stringValue ?? "Review")
                            .font(.system(size: 28, weight: .semibold))
                            .tracking(-0.6)
                            .foregroundStyle(DTheme.ink)
                        Text("Effective \(DubblDate.display(review["effectiveDate"]?.stringValue))")
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 14) {
                        TaxCompareBars(items: [
                            ("Proposed raises", increase, DTheme.ink),
                            ("Budget", review["totalBudget"]?.intValue ?? 0, DTheme.inkTertiary),
                        ], currency: currency)
                        if let budget = review["totalBudget"]?.intValue, budget > 0 {
                            let left = budget - increase
                            Text(left >= 0 ? "\(Money.format(left, currency: currency)) left in the budget" : "\(Money.format(-left, currency: currency)) over budget")
                                .font(.system(size: 13))
                                .foregroundStyle(left >= 0 ? DTheme.inkSecondary : DTheme.negative)
                        }
                    }
                    .dubblCard()

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("People · \(entries.count)")
                        if entries.isEmpty {
                            Text("Nobody in this review yet.")
                                .font(.system(size: 14))
                                .foregroundStyle(DTheme.inkSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .dubblCard()
                        } else {
                            CardStack(dividerInset: 62) {
                                ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                                    entryRow(entry)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Are the raises in \(review?["name"]?.stringValue ?? "this review") fair and within budget?", page: "payroll-compensation")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if ["draft", "in_progress"].contains(status) {
                        Button(role: .destructive) { Task { await setStatus("cancelled", done: "Review cancelled") } } label: { Label("Cancel review", systemImage: "xmark.circle") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if review != nil {
                PayrollActionTray(actions: status == "draft"
                    ? [PayrollTrayAction(title: "Start review", symbol: "play") { await setStatus("in_progress", done: "Review started") }]
                    : status == "in_progress"
                    ? [PayrollTrayAction(title: "Complete", symbol: "checkmark", confirm: "Complete this review?") { await setStatus("completed", done: "Review completed") }]
                    : [])
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func entryRow(_ entry: JSONValue) -> some View {
        let name = entry["employee.name"]?.stringValue ?? "Employee"
        let current = entry["currentSalary"]?.intValue ?? 0
        let proposed = entry["proposedSalary"]?.intValue ?? 0
        let change = current > 0 ? Double(proposed - current) / Double(current) * 100 : 0
        return HStack(spacing: 12) {
            Avatar(name: name, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Text([Money.short(current, currency: currency) + " → " + Money.short(proposed, currency: currency), entry["reason"]?.stringValue].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                Text((change >= 0 ? "+" : "") + change.formatted(.number.precision(.fractionLength(1))) + "%")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(change > 0 ? DTheme.positive : DTheme.ink)
                if let approved = entry["approved"]?.boolValue {
                    LedgerStatus(text: approved ? "Approved" : "Declined", tone: approved ? .positive : .negative)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/compensation/reviews/\(id)")
            withAnimation(.snappy) {
                review = response["review"] ?? response
                error = nil
            }
        } catch {
            if review == nil { self.error = error.localizedDescription }
        }
    }

    private func setStatus(_ value: String, done: String) async {
        let ok = await PayrollCall.run(env, done: done, spec: "payroll-comp-reviews") {
            let _: JSONValue = try await env.api.patch("payroll/compensation/reviews/\(id)", body: ["status": JSONValue.string(value)])
        }
        if ok { await load() }
    }
}

/// Start a compensation review: a name, when raises take effect and a budget.
struct PayrollReviewSheet: View {
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var effective = Date()
    @State private var budget = 0
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") { TextField("e.g. 2027 annual review", text: $name) }
                        DatePicker("Effective", selection: $effective, displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        FieldRow(label: "Budget") { AmountField(minor: $budget, currency: env.session.currency, placeholder: "Optional") }
                    }
                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .background(DTheme.shell)
            .navigationTitle("New review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Add") }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "effectiveDate": .string(DubblDate.string(effective)),
        ]
        if budget > 0 { body["totalBudget"] = .number(Double(budget)) }
        do {
            let _: JSONValue = try await env.api.post("payroll/compensation/reviews", body: body)
            env.toast.show("Review added")
            NotificationCenter.default.post(name: .recordsChanged, object: "payroll-comp-reviews")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
