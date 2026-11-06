import SwiftUI

/// Currencies: the base currency, unrealized FX on open foreign documents, the
/// latest rate per currency pair and every rate on record.
/// `GET exchange-rates` (paginated, newest first), `GET reports/unrealized-gains-losses`.
struct TaxCurrenciesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var rates: [JSONValue] = []
    @State private var fx: JSONValue?
    @State private var loaded = false
    @State private var error: String?
    @State private var adding = false
    @State private var showAll = false

    private var currency: String { env.session.currency }

    /// The newest rate for each base/target pair.
    private var latest: [JSONValue] {
        var seen = Set<String>()
        return rates.filter { rate in
            let pair = "\(rate["baseCurrency"]?.stringValue ?? "")/\(rate["targetCurrency"]?.stringValue ?? "")"
            return seen.insert(pair).inserted
        }
    }

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    baseCard
                    unrealized
                    pairs
                    history
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Currencies")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New exchange rate", systemImage: "plus") { adding = true }
            }
        }
        .sheet(isPresented: $adding) {
            TaxExchangeRateSheet(base: currency) { Task { await load() } }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var baseCard: some View {
        HStack(spacing: 14) {
            Text(Money.symbol(currency))
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(DTheme.ink)
                .frame(width: 46, height: 46)
                .background(DTheme.tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Base currency")
                    .font(.system(size: 13.5))
                    .foregroundStyle(DTheme.inkSecondary)
                Text("\(currency) · \(Locale.current.localizedString(forCurrencyCode: currency) ?? currency)")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
            }
            Spacer()
        }
        .dubblCard()
    }

    @ViewBuilder
    private var unrealized: some View {
        let items = fx?["items"]?.arrayValue ?? []
        let net = fx?["summary.netUnrealizedGainLoss"]?.intValue ?? 0
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Unrealized gains and losses")
            VStack(alignment: .leading, spacing: 14) {
                LedgerTotals(items: [
                    .init(label: "Net", value: Money.format(net, currency: currency), tint: net >= 0 ? DTheme.positive : DTheme.negative),
                    .init(label: "Gains", value: Money.short(fx?["summary.totalUnrealizedGain"]?.intValue ?? 0, currency: currency), tint: DTheme.positive),
                    .init(label: "Losses", value: Money.short(abs(fx?["summary.totalUnrealizedLoss"]?.intValue ?? 0), currency: currency), tint: DTheme.negative),
                ])
                Text(items.isEmpty ? "No open invoices or bills in other currencies." : "On \(items.count) open \(items.count == 1 ? "document" : "documents") in other currencies, at today's rates.")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .dubblCard()
            if !items.isEmpty {
                CardStack {
                    ForEach(Array(items.prefix(8).enumerated()), id: \.offset) { _, item in
                        let change = item["unrealizedGainLoss"]?.intValue
                        TaxFigureRow(
                            label: "\(item["type"]?.stringValue == "bill" ? "Bill" : "Invoice") \(item["number"]?.stringValue ?? "")",
                            value: change.map { ($0 > 0 ? "+" : "") + Money.format($0, currency: currency) } ?? "No rate",
                            detail: "\(Money.format(item["amountDue"]?.intValue ?? 0, currency: item["currencyCode"]?.stringValue ?? currency)) due",
                            tone: change.map { $0 >= 0 ? .positive : .negative } ?? .neutral
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var pairs: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Latest rates")
            if latest.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("No exchange rates yet. Rates sync daily for currencies you use, or add your own.")
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                    Button("Add a rate") { adding = true }
                        .buttonStyle(SoftButtonStyle())
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .dubblCard()
            } else {
                CardStack {
                    ForEach(Array(latest.enumerated()), id: \.offset) { _, rate in
                        TaxRatePairRow(rate: rate)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var history: some View {
        if rates.count > latest.count {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("History · \(rates.count)", action: (showAll ? "Less" : "Show all", { withAnimation(.snappy) { showAll.toggle() } }))
                if showAll {
                    CardStack {
                        ForEach(Array(rates.enumerated()), id: \.offset) { _, rate in
                            TaxRatePairRow(rate: rate, showsSource: true)
                                .contextMenu {
                                    if let id = rate.recordID {
                                        Button(role: .destructive) { Task { await delete(id) } } label: { Label("Delete", systemImage: "trash") }
                                    }
                                }
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let api = env.api
            async let ratesResponse: JSONValue = api.get("exchange-rates", query: ["limit": "100"])
            async let fxResponse: JSONValue? = try? api.get("reports/unrealized-gains-losses")
            let (list, report) = try await (ratesResponse, fxResponse)
            withAnimation(.snappy) {
                rates = list["data"]?.arrayValue ?? []
                fx = report
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }

    private func delete(_ id: String) async {
        do {
            let _: JSONValue = try await env.api.delete("exchange-rates/\(id)")
            env.toast.show("Rate deleted")
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

private struct TaxRatePairRow: View {
    let rate: JSONValue
    var showsSource = false

    var body: some View {
        let base = rate["baseCurrency"]?.stringValue ?? ""
        let target = rate["targetCurrency"]?.stringValue ?? ""
        let source = rate["source"]?.stringValue == "api" ? "Synced" : "Manual"
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(base) → \(target)")
                    .font(.system(size: 15, weight: .semibold, design: .monospaced))
                    .foregroundStyle(DTheme.ink)
                Text([DubblDate.display(rate["date"]?.stringValue), showsSource ? nil : source].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(TaxFormat.rate(rate["rate"]?.intValue ?? 0))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                if showsSource {
                    Text(source)
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}

/// Add a manual exchange rate for a day. `POST exchange-rates { rates: [...] }`, rate ×1,000,000.
struct TaxExchangeRateSheet: View {
    let base: String
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var baseCode = ""
    @State private var target = ""
    @State private var rate = ""
    @State private var date = Date()
    @State private var saving = false
    @State private var error: String?

    private var stored: Int? {
        Double(rate.replacingOccurrences(of: ",", with: ".")).map { Int(($0 * 1_000_000).rounded()) }.flatMap { $0 > 0 ? $0 : nil }
    }

    private var canSave: Bool {
        baseCode.count == 3 && target.count == 3 && baseCode != target && stored != nil && !saving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "From") {
                            TextField("USD", text: $baseCode)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                                .font(.system(size: 16, design: .monospaced))
                        }
                        FieldRow(label: "To") {
                            TextField("EUR", text: $target)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                                .font(.system(size: 16, design: .monospaced))
                        }
                        FieldRow(label: "Rate") {
                            TextField("0.921450", text: $rate)
                                .keyboardType(.decimalPad)
                                .font(DFont.figure(16, weight: .regular))
                        }
                        DatePicker("Date", selection: $date, displayedComponents: .date)
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                    }
                    if baseCode.count == 3, target.count == 3, let stored {
                        Text("1 \(baseCode.uppercased()) = \(TaxFormat.rate(stored)) \(target.uppercased())")
                            .font(.system(size: 14, design: .monospaced))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.horizontal, 4)
                    }
                    Text("Manual rates win over the daily sync for that day.")
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkTertiary)
                        .padding(.horizontal, 4)
                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("New exchange rate")
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
                    .disabled(!canSave)
                }
            }
            .onAppear { if baseCode.isEmpty { baseCode = base } }
            .onChange(of: baseCode) { _, value in baseCode = String(value.uppercased().prefix(3)) }
            .onChange(of: target) { _, value in target = String(value.uppercased().prefix(3)) }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        guard let stored else { return }
        saving = true
        error = nil
        defer { saving = false }
        let entry: JSONValue = .object([
            "baseCurrency": .string(baseCode),
            "targetCurrency": .string(target),
            "rate": .number(Double(stored)),
            "date": .string(DubblDate.string(date)),
        ])
        do {
            let _: JSONValue = try await env.api.post("exchange-rates", body: ["rates": JSONValue.array([entry])])
            env.toast.show("Rate added")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
