import Charts
import SwiftUI

/// Runs one call for a detail screen and reports how it went.
@MainActor
enum AccountingRun {
    static func run(_ env: AppEnvironment, _ done: String, key: String, _ call: () async throws -> Void) async -> Bool {
        do {
            try await call()
            env.toast.show(done)
            AccountingPost.changed(key)
            return true
        } catch {
            env.toast.error(error)
            return false
        }
    }
}

// MARK: - Fixed asset

/// One fixed asset: what it cost, what's left to depreciate, the booked
/// depreciation and (for straight-line assets) what's still to come.
struct AccountingAssetDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var working = false
    @State private var disposing = false
    @State private var confirmingDelete = false
    @State private var showAll = false

    private var asset: JSONValue? { remote.value?["asset"] }
    private var currency: String { env.session.currency }
    private var status: String { asset?["status"]?.stringValue ?? "active" }

    var body: some View {
        AccountingLoadState(value: asset, error: remote.error, retry: load) { asset in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let cost = asset["purchasePrice"]?.intValue ?? 0
                    let residual = asset["residualValue"]?.intValue ?? 0
                    let depreciated = asset["accumulatedDepreciation"]?.intValue ?? 0
                    AccountingHero(
                        number: asset["assetNumber"]?.stringValue,
                        status: (RecordFormat.statusLabel(status), Self.tone(status)),
                        title: asset["name"]?.stringValue ?? "Asset",
                        amount: asset["netBookValue"]?.intValue ?? cost,
                        currency: currency,
                        caption: ["Book value", asset["category.name"]?.stringValue].compactMap { $0 }.joined(separator: " · ")
                    )
                    VStack(alignment: .leading, spacing: 12) {
                        AccountingFigures(items: [
                            .init(label: "Cost", value: Money.short(cost, currency: currency)),
                            .init(label: "Written off", value: Money.short(depreciated, currency: currency), tint: DTheme.orange),
                            .init(label: "Residual", value: Money.short(residual, currency: currency)),
                        ])
                        progress(depreciated: depreciated, depreciable: max(cost - residual, 1))
                    }
                    chart(asset)
                    schedule(asset)
                    AccountingFacts(rows: [
                        ("Purchased", asset["purchaseDate"]?.stringValue.map(DubblDate.display)),
                        ("In service", asset["inServiceDate"]?.stringValue.map(DubblDate.display)),
                        ("Method", AccountingWords.method(asset["depreciationMethod"]?.stringValue)),
                        ("Convention", AccountingWords.convention(asset["convention"]?.stringValue)),
                        ("Useful life", AccountingWords.months(asset["usefulLifeMonths"]?.intValue)),
                        ("Category", asset["category.name"]?.stringValue),
                        ("Asset account", asset["assetAccount"].flatMap(Self.account)),
                        ("Expense account", asset["depreciationAccount"].flatMap(Self.account)),
                        ("Accumulated account", asset["accumulatedDepAccount"].flatMap(Self.account)),
                        ("Disposed", asset["disposalDate"]?.stringValue.map(DubblDate.display)),
                        ("Sold for", asset["disposalAmount"]?.intValue.map { Money.format($0, currency: currency) }),
                        ("Description", asset["description"]?.stringValue),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, status == "active" ? 110 : 28)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Fixed asset")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("How is \(asset?["name"]?.stringValue ?? "this asset") depreciating, and when will it be fully written off?", page: "fixed-assets")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if status != "disposed" {
                        Button("Dispose or sell", systemImage: "arrow.up.bin") { disposing = true }
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if asset != nil, status == "active" {
                AccountingActionBar {
                    Button { disposing = true } label: {
                        Label("Dispose", systemImage: "arrow.up.bin")
                    }
                    .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                    Button {
                        Task { await depreciate() }
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "chart.line.downtrend.xyaxis") }
                            Text("Depreciate")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                }
                .disabled(working)
            }
        }
        .confirmationDialog("Delete this asset?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Posted depreciation stays in your books.")
        }
        .sheet(isPresented: $disposing) {
            AccountingDisposeSheet(id: id, name: asset?["name"]?.stringValue ?? "Asset", bookValue: asset?["netBookValue"]?.intValue ?? 0) {
                Task { await load() }
            }
        }
        .task { await load() }
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "active": .positive
        case "fully_depreciated": .info
        case "disposed": .neutral
        case "in_progress": .warning
        default: .neutral
        }
    }

    static func account(_ json: JSONValue) -> String? {
        guard let name = json["name"]?.stringValue else { return nil }
        return [json["code"]?.stringValue, name].compactMap { $0 }.joined(separator: " · ")
    }

    private func progress(depreciated: Int, depreciable: Int) -> some View {
        let share = min(max(Double(depreciated) / Double(depreciable), 0), 1)
        return VStack(alignment: .leading, spacing: 6) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(DTheme.tint)
                    Capsule().fill(DTheme.orange).frame(width: max(proxy.size.width * share, share > 0 ? 6 : 0))
                }
            }
            .frame(height: 6)
            Text("\(Int((share * 100).rounded()))% written off")
                .font(.system(size: 12.5))
                .monospacedDigit()
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
    }

    private struct BookPoint: Identifiable {
        let date: Date
        let value: Int
        var id: Date { date }
    }

    /// Book value after each booked charge, from cost down.
    @ViewBuilder
    private func chart(_ asset: JSONValue) -> some View {
        let entries = asset["depreciationEntries"]?.arrayValue ?? []
        if entries.count >= 2, let start = DubblDate.parseDay(asset["inServiceDate"]?.stringValue ?? asset["purchaseDate"]?.stringValue) {
            let cost = asset["purchasePrice"]?.intValue ?? 0
            let points: [BookPoint] = {
                var running = cost
                var result = [BookPoint(date: start, value: cost)]
                for entry in entries {
                    running -= entry["amount"]?.intValue ?? 0
                    if let date = DubblDate.parseDay(entry["date"]?.stringValue) { result.append(BookPoint(date: date, value: running)) }
                }
                return result
            }()
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Book value")
                Chart(points) { point in
                    AreaMark(x: .value("Date", point.date), y: .value("Value", Double(point.value) / 100))
                        .foregroundStyle(LinearGradient(colors: [DTheme.orange.opacity(0.22), DTheme.orange.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("Date", point.date), y: .value("Value", Double(point.value) / 100))
                        .foregroundStyle(DTheme.orange)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                        .interpolationMethod(.monotone)
                }
                .chartYAxis {
                    AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine().foregroundStyle(DTheme.hairline)
                        AxisValueLabel {
                            if let amount = value.as(Double.self) {
                                Text(Money.short(Int(amount * 100), currency: currency))
                                    .font(.system(size: 10.5))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits))
                            .font(.system(size: 10.5))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                .frame(height: 150)
                .padding(16)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
            }
        }
    }

    /// Booked charges, newest first, then the projected straight-line ones.
    @ViewBuilder
    private func schedule(_ asset: JSONValue) -> some View {
        let entries = asset["depreciationEntries"]?.arrayValue ?? []
        let projected = projection(asset, booked: entries.count)
        if !entries.isEmpty || !projected.isEmpty {
            let booked = Array(entries.reversed())
            let shownBooked = showAll ? booked : Array(booked.prefix(4))
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Depreciation · \(entries.count) booked", action: booked.count > 4 ? (showAll ? "Show less" : "Show all", { withAnimation(.snappy) { showAll.toggle() } }) : nil)
                CardStack(dividerInset: 52) {
                    ForEach(Array(projected.enumerated()), id: \.offset) { index, row in
                        AccountingScheduleRow(title: row.date.formatted(.dateTime.month(.wide).year()), detail: "Projected", amount: row.amount, currency: currency, trailing: "Leaves \(Money.short(row.after, currency: currency))", done: false, isNext: index == projected.count - 1)
                    }
                    ForEach(Array(shownBooked.enumerated()), id: \.offset) { _, entry in
                        AccountingScheduleRow(
                            title: DubblDate.parseDay(entry["periodEnd"]?.stringValue ?? entry["date"]?.stringValue)?.formatted(.dateTime.month(.wide).year()) ?? DubblDate.display(entry["date"]?.stringValue),
                            detail: entry["journalEntry.entryNumber"]?.stringValue.map { "Posted · #\($0)" } ?? "Posted",
                            amount: entry["amount"]?.intValue ?? 0,
                            currency: currency,
                            done: true
                        )
                    }
                }
            }
        }
    }

    /// The next few straight-line charges (cost less residual over the useful life).
    private func projection(_ asset: JSONValue, booked: Int) -> [(date: Date, amount: Int, after: Int)] {
        guard asset["status"]?.stringValue == "active", asset["depreciationMethod"]?.stringValue == "straight_line",
              let life = asset["usefulLifeMonths"]?.intValue, life > 0 else { return [] }
        let cost = asset["purchasePrice"]?.intValue ?? 0
        let residual = asset["residualValue"]?.intValue ?? 0
        var book = asset["netBookValue"]?.intValue ?? cost
        let monthly = (cost - residual) / life
        guard monthly > 0 else { return [] }
        let lastBooked = (asset["depreciationEntries"]?.arrayValue?.last).flatMap { DubblDate.parseDay($0["date"]?.stringValue) }
        let start = lastBooked ?? DubblDate.parseDay(asset["inServiceDate"]?.stringValue ?? asset["purchaseDate"]?.stringValue) ?? .now
        var rows: [(Date, Int, Int)] = []
        for step in 1 ... 3 {
            let amount = min(monthly, book - residual)
            guard amount > 0, booked + step <= life, let date = Calendar.current.date(byAdding: .month, value: step, to: start) else { break }
            book -= amount
            rows.append((date, amount, book))
        }
        return rows.reversed()
    }

    private func load() async {
        await remote.load(env.api, "fixed-assets/\(id)")
    }

    private func depreciate() async {
        working = true
        defer { working = false }
        if await AccountingRun.run(env, "Depreciation posted", key: AccountingCatalog.assetsKey, {
            let _: JSONValue = try await env.api.post("fixed-assets/\(id)/depreciate", body: [String: JSONValue]())
        }) { await load() }
    }

    private func delete() async {
        if await AccountingRun.run(env, "Asset deleted", key: AccountingCatalog.assetsKey, {
            let _: JSONValue = try await env.api.delete("fixed-assets/\(id)")
        }) { dismiss() }
    }
}

/// Sell or scrap an asset: the date and what it fetched. The gain or loss
/// against book value is posted for you.
struct AccountingDisposeSheet: View {
    let id: String
    let name: String
    let bookValue: Int
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var proceeds = 0
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        AccountingDateRow(label: "Disposal date", date: $date)
                        FieldRow(label: "Sale proceeds") {
                            AmountField(minor: $proceeds, currency: env.session.currency, placeholder: "0.00 if scrapped")
                        }
                    }
                    let result = proceeds - bookValue
                    HStack {
                        Text(result >= 0 ? "Gain on disposal" : "Loss on disposal")
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.inkSecondary)
                        Spacer()
                        Text(Money.format(abs(result), currency: env.session.currency))
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(result >= 0 ? DTheme.positive : DTheme.negative)
                            .contentTransition(.numericText(value: Double(result)))
                    }
                    .padding(.horizontal, 4)
                    Text("Book value is \(Money.format(bookValue, currency: env.session.currency)). Proceeds land in Undeposited funds unless you change it on the web.")
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .padding(.horizontal, 4)
                    AccountingFormError(message: error)
                }
                .padding(20)
            }
            .accountingFormChrome(title: "Dispose of \(name)", saveTitle: "Dispose", canSave: true, saving: saving, save: save)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("fixed-assets/\(id)/dispose", body: [
                "disposalAmount": JSONValue.number(Double(proceeds)),
                "date": .string(AccountingDay.string(date)),
            ])
            env.toast.show("Asset disposed")
            AccountingPost.changed(AccountingCatalog.assetsKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Register an asset: name, number, category, when it was bought, what it cost
/// and how long it lasts. Category defaults fill in the rest.
struct AccountingNewAssetSheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var categories = AccountingRemote()
    @State private var name = ""
    @State private var number = ""
    @State private var categoryID = ""
    @State private var purchased = Date.now
    @State private var cost = 0
    @State private var residual = 0
    @State private var lifeYears = 3
    @State private var saving = false
    @State private var error: String?

    private var categoryRows: [JSONValue] {
        (categories.value?["data"]?.arrayValue ?? []).filter { $0["isActive"]?.boolValue != false }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !number.trimmingCharacters(in: .whitespaces).isEmpty && cost > 0
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. MacBook Pro 16", text: $name)
                        }
                        FieldRow(label: "Asset number") {
                            TextField("e.g. FA-0012", text: $number)
                                .font(.system(size: 16, design: .monospaced))
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                        }
                        HStack {
                            Text("Category")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Category", selection: $categoryID) {
                                Text("None").tag("")
                                ForEach(categoryRows, id: \.self) { row in
                                    Text(row["name"]?.stringValue ?? "Category").tag(row.recordID ?? "")
                                }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Cost and life")
                        CardStack {
                            AccountingDateRow(label: "Purchased", date: $purchased)
                            FieldRow(label: "Cost") {
                                AmountField(minor: $cost, currency: env.session.currency)
                            }
                            FieldRow(label: "Residual value") {
                                AmountField(minor: $residual, currency: env.session.currency, placeholder: "0.00")
                            }
                            Stepper(value: $lifeYears, in: 1 ... 50) {
                                HStack {
                                    Text("Useful life")
                                        .font(.system(size: 15))
                                        .foregroundStyle(DTheme.ink)
                                    Spacer()
                                    Text(lifeYears == 1 ? "1 year" : "\(lifeYears) years")
                                        .font(.system(size: 15))
                                        .monospacedDigit()
                                        .foregroundStyle(DTheme.inkSecondary)
                                }
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        }
                    }
                    if cost > residual {
                        Text("Straight line: about \(Money.format((cost - residual) / (lifeYears * 12), currency: env.session.currency)) a month.")
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.horizontal, 4)
                    }
                    AccountingFormError(message: error)
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .accountingFormChrome(title: "New fixed asset", saveTitle: "Add", canSave: canSave, saving: saving, save: save)
            .task { await categories.load(env.api, "asset-categories", query: ["limit": "100"]) }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "assetNumber": .string(number.trimmingCharacters(in: .whitespaces)),
            "purchaseDate": .string(AccountingDay.string(purchased)),
            "purchasePrice": .number(Double(cost)),
            "residualValue": .number(Double(residual)),
            "usefulLifeMonths": .number(Double(lifeYears * 12)),
        ]
        if !categoryID.isEmpty { body["categoryId"] = .string(categoryID) }
        do {
            let _: JSONValue = try await env.api.post("fixed-assets", body: body)
            env.toast.show("Asset added")
            AccountingPost.changed(AccountingCatalog.assetsKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Asset category

/// A category's defaults in plain words, with archive and delete.
struct AccountingCategoryDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var confirmingDelete = false

    private var category: JSONValue? { remote.value?["category"] }

    var body: some View {
        AccountingLoadState(value: category, error: remote.error, retry: load) { category in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let active = category["isActive"]?.boolValue != false
                    AccountingHero(
                        status: active ? ("Active", .positive) : ("Archived", .neutral),
                        title: category["name"]?.stringValue ?? "Category",
                        caption: [AccountingWords.method(category["defaultDepreciationMethod"]?.stringValue), AccountingWords.months(category["defaultUsefulLifeMonths"]?.intValue)].compactMap { $0 }.joined(separator: " over ")
                    )
                    AccountingFacts(title: "Defaults for new assets", rows: [
                        ("Method", AccountingWords.method(category["defaultDepreciationMethod"]?.stringValue)),
                        ("Convention", AccountingWords.convention(category["defaultConvention"]?.stringValue)),
                        ("Useful life", AccountingWords.months(category["defaultUsefulLifeMonths"]?.intValue)),
                        ("Rate", category["defaultDepreciationRateBp"]?.intValue.map(RecordFormat.percent)),
                        ("Residual value", category["defaultResidualValue"]?.intValue.map { Money.format($0, currency: env.session.currency) }),
                    ])
                    AccountingFacts(title: "Accounts", rows: [
                        ("Asset", category["assetAccount"].flatMap(AccountingAssetDetailView.account)),
                        ("Depreciation expense", category["depreciationAccount"].flatMap(AccountingAssetDetailView.account)),
                        ("Accumulated depreciation", category["accumulatedDepAccount"].flatMap(AccountingAssetDetailView.account)),
                        ("Work in progress", category["cwipAccount"].flatMap(AccountingAssetDetailView.account)),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Asset category")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if let active = category?["isActive"]?.boolValue {
                        Button(active ? "Archive" : "Restore", systemImage: active ? "archivebox" : "arrow.uturn.backward") {
                            Task {
                                if await AccountingRun.run(env, active ? "Category archived" : "Category restored", key: AccountingCatalog.categoriesKey, {
                                    let _: JSONValue = try await env.api.patch("asset-categories/\(id)", body: ["isActive": JSONValue.bool(!active)])
                                }) { await load() }
                            }
                        }
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .confirmationDialog("Delete this category?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    if await AccountingRun.run(env, "Category deleted", key: AccountingCatalog.categoriesKey, {
                        let _: JSONValue = try await env.api.delete("asset-categories/\(id)")
                    }) { dismiss() }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Assets already in it keep their settings.")
        }
        .task { await load() }
    }

    private func load() async {
        await remote.load(env.api, "asset-categories/\(id)")
    }
}

/// A category: name, method and how long its assets usually last.
struct AccountingNewCategorySheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var method = "straight_line"
    @State private var lifeYears = 3
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. Computer equipment", text: $name)
                        }
                        HStack {
                            Text("Method")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Method", selection: $method) {
                                ForEach(["straight_line", "declining_balance", "sum_of_years_digits"], id: \.self) { value in
                                    Text(AccountingWords.method(value) ?? value).tag(value)
                                }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                        Stepper(value: $lifeYears, in: 1 ... 50) {
                            HStack {
                                Text("Useful life")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Text(lifeYears == 1 ? "1 year" : "\(lifeYears) years")
                                    .font(.system(size: 15))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                    }
                    Text("Accounts for the category can be set on the web; new assets fall back to your defaults.")
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .padding(.horizontal, 4)
                    AccountingFormError(message: error)
                }
                .padding(20)
            }
            .accountingFormChrome(title: "New category", saveTitle: "Add", canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty, saving: saving, save: save)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("asset-categories", body: [
                "name": JSONValue.string(name.trimmingCharacters(in: .whitespaces)),
                "defaultDepreciationMethod": .string(method),
                "defaultUsefulLifeMonths": .number(Double(lifeYears * 12)),
            ])
            env.toast.show("Category added")
            AccountingPost.changed(AccountingCatalog.categoriesKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Categories list

/// Asset categories with their default method and life, archived ones last.
struct AccountingCategoriesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remote = AccountingRemote()
    @State private var creating = false

    private var rows: [JSONValue] {
        (remote.value?["data"]?.arrayValue ?? []).sorted { a, b in
            let activeA = a["isActive"]?.boolValue != false
            let activeB = b["isActive"]?.boolValue != false
            if activeA != activeB { return activeA }
            return (a["name"]?.stringValue ?? "") < (b["name"]?.stringValue ?? "")
        }
    }

    var body: some View {
        AccountingLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            List {
                ForEach(rows, id: \.self) { row in
                    NavigationLink(value: RecordRoute(spec: AccountingCatalog.categoriesKey, id: row.recordID ?? "")) {
                        categoryRow(row)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                }
                LedgerEndMarker(text: "\(rows.count) \(rows.count == 1 ? "category" : "categories")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
            .overlay {
                if rows.isEmpty {
                    EmptyStateView(symbol: "folder", title: "No categories yet", message: "Categories set the depreciation defaults for new assets.", actionTitle: "New category") { creating = true }
                }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Asset categories")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New category", systemImage: "plus") { creating = true }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == AccountingCatalog.categoriesKey { Task { await load() } }
        }
        .sheet(isPresented: $creating) {
            AccountingNewCategorySheet { Task { await load() } }
        }
        .task { await load() }
    }

    private func categoryRow(_ row: JSONValue) -> some View {
        let active = row["isActive"]?.boolValue != false
        let detail = [AccountingWords.method(row["defaultDepreciationMethod"]?.stringValue), AccountingWords.months(row["defaultUsefulLifeMonths"]?.intValue)].compactMap { $0 }
        return HStack(spacing: 12) {
            IconTile(symbol: "folder", size: 34)
            VStack(alignment: .leading, spacing: 4) {
                Text(row["name"]?.stringValue ?? "Category")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(active ? DTheme.ink : DTheme.inkSecondary)
                if !detail.isEmpty {
                    Text(detail.joined(separator: " over "))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            Spacer()
            if !active {
                LedgerStatus(text: "Archived", tone: .neutral)
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func load() async {
        await remote.load(env.api, "asset-categories", query: ["limit": "100"])
    }
}
