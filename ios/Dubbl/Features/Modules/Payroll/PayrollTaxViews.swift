import SwiftUI

/// The three liability buckets the remittance API clears, in plain words.
private struct PayrollAgency: Identifiable {
    let bucket: String
    let agency: String
    let what: String
    let taxKind: String
    let symbol: String
    var id: String { bucket }

    static let all = [
        PayrollAgency(bucket: "income_tax", agency: "Income tax", what: "Withheld from employee pay", taxKind: "income_tax", symbol: "building.columns"),
        PayrollAgency(bucket: "fica", agency: "Payroll taxes", what: "Social Security, Medicare and unemployment", taxKind: "941", symbol: "percent"),
        PayrollAgency(bucket: "pension", agency: "Pension and benefits", what: "Retirement and benefit withholdings", taxKind: "benefits", symbol: "heart.text.square"),
    ]
}

/// What payroll tax you owe: withheld so far, paid, still due, who you pay,
/// and payments recorded. `GET payroll/reports/tax-liability` -> `{ data, totalTax }`,
/// `GET payroll/tax-payments` -> `{ payments }`.
struct PayrollTaxLiabilitiesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var accrued = 0
    @State private var byEmployee: [JSONValue] = []
    @State private var payments: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var recording: String?

    private var currency: String { env.session.currency }
    private var paid: Int { payments.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) } }

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Still to pay")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                            Text(Money.format(max(0, accrued - paid), currency: currency))
                                .font(.system(size: 38, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .tracking(-1.1)
                                .foregroundStyle(DTheme.ink)
                        }
                        LedgerTotals(items: [
                            .init(label: "Withheld", value: Money.short(accrued, currency: currency), detail: "From pay runs"),
                            .init(label: "Paid", value: Money.short(paid, currency: currency), detail: "\(payments.count) \(payments.count == 1 ? "payment" : "payments")", tint: DTheme.positive),
                        ])
                    }
                    .dubblCard()

                    agencies
                    paymentsSection
                    employeesSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Tax liabilities")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Record payment", systemImage: "plus") { recording = PayrollAgency.all[0].bucket }
            }
        }
        .sheet(item: Binding(get: { recording.map(PayrollBucket.init) }, set: { recording = $0?.id })) { bucket in
            PayrollTaxPaymentSheet(bucket: bucket.id) { Task { await load() } }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var agencies: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Who you pay")
            CardStack {
                ForEach(PayrollAgency.all) { agency in
                    let total = payments.filter { $0["taxKind"]?.stringValue == agency.taxKind }.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }
                    Button { recording = agency.bucket } label: {
                        HStack(spacing: 12) {
                            IconTile(symbol: agency.symbol, size: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(agency.agency)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(DTheme.ink)
                                Text(agency.what)
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkSecondary)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(Money.format(total, currency: currency))
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.ink)
                                Text("paid")
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                }
            }
        }
    }

    private var paymentsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Payments recorded")
            if payments.isEmpty {
                Text("No payments yet. Record one when you pay the tax authority.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(Array(payments.enumerated()), id: \.offset) { _, payment in
                        TaxFigureRow(
                            label: PayrollFormat.taxKind(payment["taxKind"]?.stringValue),
                            value: Money.format(payment["amount"]?.intValue ?? 0, currency: payment["currency"]?.stringValue ?? currency),
                            detail: [
                                PayrollFormat.period(payment["periodStart"]?.stringValue, payment["periodEnd"]?.stringValue),
                                payment["reference"]?.stringValue,
                            ].compactMap { $0 }.joined(separator: " · ")
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var employeesSection: some View {
        if !byEmployee.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Withheld by person")
                CardStack {
                    ForEach(Array(byEmployee.enumerated()), id: \.offset) { _, row in
                        TaxFigureRow(
                            label: row["employeeName"]?.stringValue ?? "Employee",
                            value: Money.format(row["totalTax"]?.intValue ?? 0, currency: currency),
                            detail: "on \(Money.format(row["totalGross"]?.intValue ?? 0, currency: currency)) gross"
                        )
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let api = env.api
            async let liability: JSONValue = api.get("payroll/reports/tax-liability")
            async let recorded: JSONValue = api.get("payroll/tax-payments")
            let (l, p) = try await (liability, recorded)
            withAnimation(.snappy) {
                accrued = l["totalTax"]?.intValue ?? 0
                byEmployee = l["data"]?.arrayValue ?? []
                payments = p["payments"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

private struct PayrollBucket: Identifiable {
    let id: String
}

/// Record a payment to a tax authority; posts the journal that clears the liability.
/// `POST payroll/tax-payments { periodStart, periodEnd, allocations: [{ bucket, amount }] }`.
private struct PayrollTaxPaymentSheet: View {
    @State var bucket: String
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var amount = 0
    @State private var level = "federal"
    @State private var start = Date()
    @State private var end = Date()
    @State private var paidOn = Date()
    @State private var reference = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        HStack {
                            Text("Covers")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Covers", selection: $bucket) {
                                ForEach(PayrollAgency.all) { Text($0.agency).tag($0.bucket) }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                        FieldRow(label: "Amount paid") { AmountField(minor: $amount, currency: env.session.currency) }
                        FieldRow(label: "Confirmation number") {
                            TextField("Optional", text: $reference)
                                .autocorrectionDisabled()
                                .font(.system(size: 16, design: .monospaced))
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Period it covers")
                        TaxSegment(options: [("federal", "Federal"), ("state", "State"), ("local", "Local")], selection: $level)
                        CardStack {
                            DatePicker("From", selection: $start, displayedComponents: .date)
                                .font(.system(size: 15))
                                .padding(.horizontal, 16)
                                .frame(minHeight: 50)
                            DatePicker("To", selection: $end, in: start..., displayedComponents: .date)
                                .font(.system(size: 15))
                                .padding(.horizontal, 16)
                                .frame(minHeight: 50)
                            DatePicker("Paid on", selection: $paidOn, displayedComponents: .date)
                                .font(.system(size: 15))
                                .padding(.horizontal, 16)
                                .frame(minHeight: 50)
                        }
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
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("Record payment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Record") }
                    }
                    .disabled(amount <= 0 || saving)
                }
            }
            .onAppear {
                let calendar = Calendar(identifier: .gregorian)
                if let month = calendar.dateInterval(of: .month, for: .now) { start = month.start }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let agency = PayrollAgency.all.first { $0.bucket == bucket }
        var body: [String: JSONValue] = [
            "periodStart": .string(DubblDate.string(start)),
            "periodEnd": .string(DubblDate.string(end)),
            "jurisdictionLevel": .string(level),
            "taxKind": agency.map { .string($0.taxKind) } ?? .null,
            "allocations": .array([.object(["bucket": .string(bucket), "amount": .number(Double(amount))])]),
            "paymentDate": .string(DubblDate.string(paidOn)),
        ]
        let ref = reference.trimmingCharacters(in: .whitespaces)
        if !ref.isEmpty { body["reference"] = .string(ref) }
        do {
            let _: JSONValue = try await env.api.post("payroll/tax-payments", body: body)
            env.toast.show("Payment recorded")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Year-end forms: each batch of W-2s or 1099s with its recipients, and
/// generating a new batch. `GET payroll/tax-forms` (paginated) -> generations with forms.
struct PayrollTaxFormsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var batches: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var generating = false

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    if batches.isEmpty {
                        EmptyStateView(symbol: "doc.text", title: "No tax forms yet", message: "Generate W-2s for employees and 1099s for contractors at year end.", actionTitle: "Generate forms") { generating = true }
                            .padding(.top, 40)
                    }
                    ForEach(Array(batches.enumerated()), id: \.offset) { _, batch in
                        batchSection(batch)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Tax forms")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Generate forms", systemImage: "plus") { generating = true }
            }
        }
        .sheet(isPresented: $generating) {
            PayrollGenerateFormsSheet { Task { await load() } }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func batchSection(_ batch: JSONValue) -> some View {
        let forms = batch["forms"]?.arrayValue ?? []
        let status = batch["status"]?.stringValue ?? "draft"
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(PayrollFormat.formType(batch["formType"]?.stringValue)) · \(batch["taxYear"]?.stringValue ?? "")")
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                Spacer()
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
            }
            .padding(.horizontal, 4)
            CardStack(dividerInset: 62) {
                if forms.isEmpty {
                    Text("No recipients had payments that year.")
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                ForEach(Array(forms.enumerated()), id: \.offset) { _, form in
                    if let id = form.recordID {
                        NavigationLink(value: RecordRoute(spec: "payroll-tax-forms", id: id)) {
                            PayrollFormRow(form: form, currency: env.session.currency)
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/tax-forms", query: ["limit": "50"])
            withAnimation(.snappy) {
                batches = response["data"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

private struct PayrollFormRow: View {
    let form: JSONValue
    let currency: String

    /// The headline box: wages for a W-2, compensation for a 1099.
    private var amount: Int? {
        let data = form["formData"]
        return data?["box1_wages"]?.intValue ?? data?["box1_nonemployee_compensation"]?.intValue ?? data?["box1_rents"]?.intValue
    }

    var body: some View {
        let name = form["recipientName"]?.stringValue ?? "Recipient"
        HStack(spacing: 12) {
            Avatar(name: name, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([form["recipientType"]?.stringValue?.humanized, RecordFormat.statusLabel(form["status"]?.stringValue ?? "draft")].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            if let amount {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

/// One W-2 or 1099 box by box. `GET payroll/tax-forms/{id}` returns the form itself.
struct PayrollTaxFormView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var form: JSONValue?
    @State private var error: String?

    private var currency: String { env.session.currency }

    var body: some View {
        ScrollView {
            if let form {
                let boxes: [(key: String, value: JSONValue)] = (form["formData"]?.objectValue ?? [:])
                    .sorted { Self.order($0.key) < Self.order($1.key) }
                    .filter { !$0.value.isNull }
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Text("\(PayrollFormat.formType(form["formType"]?.stringValue)) · \(form["taxYear"]?.stringValue ?? "")")
                                .font(.system(size: 13, weight: .medium, design: .monospaced))
                                .foregroundStyle(DTheme.inkTertiary)
                            let status = form["status"]?.stringValue ?? "draft"
                            LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                        }
                        Text(form["recipientName"]?.stringValue ?? "Recipient")
                            .font(.system(size: 28, weight: .semibold))
                            .tracking(-0.6)
                            .foregroundStyle(DTheme.ink)
                        if let taxID = form["recipientTaxId"]?.stringValue {
                            Text(taxID)
                                .font(.system(size: 14, design: .monospaced))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Boxes")
                        CardStack {
                            ForEach(boxes, id: \.key) { box in
                                if let amount = box.value.intValue, box.key.hasPrefix("box") {
                                    TaxFigureRow(label: PayrollFormat.formBox(box.key), value: Money.format(amount, currency: currency))
                                } else if let text = box.value.stringValue {
                                    DetailRow(PayrollFormat.formBox(box.key), text)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Tax form")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    /// Boxes in number order ("box2" before "box12"), other fields after.
    private static func order(_ key: String) -> (Int, String) {
        guard key.hasPrefix("box") else { return (999, key) }
        let digits = key.dropFirst(3).prefix { $0.isNumber }
        return (Int(digits) ?? 998, key)
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/tax-forms/\(id)")
            withAnimation(.snappy) {
                form = response["form"] ?? response
                error = nil
            }
        } catch {
            if form == nil { self.error = error.localizedDescription }
        }
    }
}

/// Generate a batch of forms for a tax year. `POST payroll/tax-forms/generate`.
private struct PayrollGenerateFormsSheet: View {
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var formType = "w2"
    @State private var year = Calendar.current.component(.year, from: .now) - 1
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    TaxSegment(options: [("w2", "W-2"), ("1099_nec", "1099-NEC")], selection: $formType)
                    CardStack {
                        HStack {
                            Text("Tax year")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Tax year", selection: $year) {
                                let current = Calendar.current.component(.year, from: .now)
                                ForEach((current - 4 ... current).reversed(), id: \.self) { Text(String($0)).tag($0) }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                    }
                    Text(formType == "w2"
                        ? "One W-2 per employee paid in \(String(year)), from completed pay runs."
                        : "One 1099-NEC per contractor with paid payments in \(String(year)).")
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
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
            .background(DTheme.shell)
            .navigationTitle("Generate forms")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Generate") }
                    }
                    .disabled(saving)
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let response: JSONValue = try await env.api.post("payroll/tax-forms/generate", body: ["taxYear": JSONValue.number(Double(year)), "formType": .string(formType)])
            let count = response["formsGenerated"]?.intValue ?? 0
            env.toast.show("\(count) \(count == 1 ? "form" : "forms") generated")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
