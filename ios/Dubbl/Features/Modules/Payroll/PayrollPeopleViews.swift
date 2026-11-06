import SwiftUI

/// One employee: pay up top, leave balances, recent payslips and their
/// details. `GET payroll/employees/{id}` -> `{ employee }`,
/// `GET payroll/employees/{id}/leave-balances` and `/payslips` -> `{ data }`.
struct PayrollEmployeeView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var employee: JSONValue?
    @State private var balances: [JSONValue] = []
    @State private var payslips: [JSONValue] = []
    @State private var error: String?
    @State private var confirmingRemove = false

    private var currency: String { employee?["currency"]?.stringValue ?? env.session.currency }
    private var active: Bool { employee?["isActive"]?.boolValue ?? true }

    var body: some View {
        ScrollView {
            if let employee {
                VStack(alignment: .leading, spacing: 24) {
                    hero(employee)
                    pay(employee)
                    leave
                    slips
                    details(employee)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Employee")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Summarise pay, leave and tax for \(employee?["name"]?.stringValue ?? "this employee").", page: "payroll-employees")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    Button(role: .destructive) { confirmingRemove = true } label: { Label("Remove", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if employee != nil {
                PayrollActionTray(actions: [
                    active
                        ? PayrollTrayAction(title: "Deactivate", symbol: "pause.circle", destructive: true, confirm: "Leave them out of future pay runs?") { await setActive(false) }
                        : PayrollTrayAction(title: "Reactivate", symbol: "play.circle") { await setActive(true) },
                ])
            }
        }
        .confirmationDialog("Remove this employee?", isPresented: $confirmingRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { Task { await remove() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Past pay runs and payslips are kept.")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func hero(_ employee: JSONValue) -> some View {
        let name = employee["name"]?.stringValue ?? "Employee"
        return HStack(spacing: 14) {
            Avatar(name: name, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 24, weight: .semibold))
                    .tracking(-0.5)
                    .foregroundStyle(DTheme.ink)
                HStack(spacing: 8) {
                    if let number = employee["employeeNumber"]?.stringValue {
                        Text(number)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    LedgerStatus(text: active ? "Active" : "Inactive", tone: active ? .positive : .neutral)
                }
                if let position = employee["position"]?.stringValue {
                    Text([position, employee["department"]?.stringValue].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func pay(_ employee: JSONValue) -> some View {
        let salary = employee["salary"]?.intValue ?? 0
        let frequency = employee["payFrequency"]?.stringValue
        let hourly = employee["compensationType"]?.stringValue == "hourly"
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            if hourly, let rate = employee["hourlyRate"]?.intValue {
                PayrollStat(label: "Hourly rate", value: Money.format(rate, currency: currency), detail: "Paid \(PayrollFormat.frequency(frequency).lowercased())")
            } else {
                PayrollStat(label: "Salary", value: Money.short(salary, currency: currency), detail: "a year")
            }
            PayrollStat(label: "Each pay", value: Money.short(salary / PayrollFormat.periods(frequency), currency: currency), detail: PayrollFormat.frequency(frequency))
            PayrollStat(label: "Tax rate", value: TaxFormat.percent(employee["taxRate"]?.intValue ?? 0), detail: "Flat withholding")
            PayrollStat(label: "Time off", value: PayrollFormat.hours(employee["ptoBalanceHours"]), detail: "Balance")
        }
    }

    @ViewBuilder
    private var leave: some View {
        if !balances.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Leave balances")
                CardStack {
                    ForEach(Array(balances.enumerated()), id: \.offset) { _, balance in
                        TaxFigureRow(
                            label: balance["policy.name"]?.stringValue ?? "Leave",
                            value: PayrollFormat.hours(balance["balance"]),
                            detail: "\(PayrollFormat.hours(balance["usedHours"])) used in \(balance["year"]?.stringValue ?? "")"
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var slips: some View {
        if !payslips.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Payslips")
                CardStack {
                    ForEach(Array(payslips.prefix(6).enumerated()), id: \.offset) { _, slip in
                        let row = TaxFigureRow(
                            label: PayrollFormat.period(slip["payrollRun.payPeriodStart"]?.stringValue, slip["payrollRun.payPeriodEnd"]?.stringValue),
                            value: Money.format(slip["netAmount"]?.intValue ?? 0, currency: currency),
                            detail: "\(Money.format(slip["grossAmount"]?.intValue ?? 0, currency: currency)) gross · \(RecordFormat.statusLabel(slip["status"]?.stringValue ?? "generated"))"
                        )
                        if let runID = slip["payrollRunId"]?.stringValue {
                            NavigationLink(value: RecordRoute(spec: "payroll-runs", id: runID)) { row }
                                .buttonStyle(RowPressStyle())
                        } else {
                            row
                        }
                    }
                }
            }
        }
    }

    private func details(_ employee: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                if let email = employee["email"]?.stringValue { DetailRow("Email", email) }
                DetailRow("Pay type", (employee["compensationType"]?.stringValue ?? "salary").humanized)
                DetailRow("Paid", PayrollFormat.frequency(employee["payFrequency"]?.stringValue))
                DetailRow("Started", DubblDate.display(employee["startDate"]?.stringValue))
                if let end = employee["endDate"]?.stringValue ?? employee["terminationDate"]?.stringValue {
                    DetailRow("Ends", DubblDate.display(end))
                }
                if let bank = employee["bankAccountNumber"]?.stringValue, bank.count > 4 {
                    DetailRow(label: "Bank account") {
                        Text("•••• " + bank.suffix(4)).font(.system(size: 15, design: .monospaced))
                    }
                }
                DetailRow("Currency", employee["currency"]?.stringValue ?? currency)
            }
        }
    }

    private func load() async {
        do {
            let api = env.api
            async let detail: JSONValue = api.get("payroll/employees/\(id)")
            async let leave: JSONValue? = try? api.get("payroll/employees/\(id)/leave-balances")
            async let slips: JSONValue? = try? api.get("payroll/employees/\(id)/payslips")
            let (response, leaveResponse, slipsResponse) = try await (detail, leave, slips)
            withAnimation(.snappy) {
                employee = response["employee"] ?? response
                balances = leaveResponse?["data"]?.arrayValue ?? []
                payslips = slipsResponse?["data"]?.arrayValue ?? []
                error = nil
            }
        } catch {
            if employee == nil { self.error = error.localizedDescription }
        }
    }

    private func setActive(_ value: Bool) async {
        let ok = await PayrollCall.run(env, done: value ? "Reactivated" : "Deactivated", spec: "payroll-employees") {
            let _: JSONValue = try await env.api.patch("payroll/employees/\(id)", body: ["isActive": JSONValue.bool(value)])
        }
        if ok { await load() }
    }

    private func remove() async {
        let ok = await PayrollCall.run(env, done: "Employee removed", spec: "payroll-employees") {
            let _: JSONValue = try await env.api.delete("payroll/employees/\(id)")
        }
        if ok { dismiss() }
    }
}

/// Add an employee: who, their number and role, and how they're paid.
/// `POST payroll/employees` (salary annual, cents; tax rate in basis points).
struct PayrollEmployeeSheet: View {
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var number = ""
    @State private var position = ""
    @State private var payType = "salary"
    @State private var salary = 0
    @State private var hourly = 0
    @State private var frequency = "monthly"
    @State private var start = Date()
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !number.trimmingCharacters(in: .whitespaces).isEmpty && !saving
            && (payType == "salary" ? salary > 0 : hourly > 0)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("Full name", text: $name).textContentType(.name)
                        }
                        FieldRow(label: "Email") {
                            TextField("Optional", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        FieldRow(label: "Employee number") {
                            TextField("EMP-005", text: $number)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                                .font(.system(size: 16, design: .monospaced))
                        }
                        FieldRow(label: "Position") {
                            TextField("Optional", text: $position)
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Pay")
                        TaxSegment(options: [("salary", "Salary"), ("hourly", "Hourly")], selection: $payType)
                        CardStack {
                            if payType == "salary" {
                                FieldRow(label: "Annual salary") { AmountField(minor: $salary, currency: env.session.currency) }
                            } else {
                                FieldRow(label: "Hourly rate") { AmountField(minor: $hourly, currency: env.session.currency) }
                            }
                            HStack {
                                Text("Paid")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Picker("Paid", selection: $frequency) {
                                    Text("Weekly").tag("weekly")
                                    Text("Every two weeks").tag("biweekly")
                                    Text("Monthly").tag("monthly")
                                }
                                .labelsHidden()
                                .tint(DTheme.inkSecondary)
                            }
                            .padding(.leading, 16)
                            .padding(.trailing, 6)
                            .frame(minHeight: 50)
                            DatePicker("Start date", selection: $start, displayedComponents: .date)
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
            .navigationTitle("New employee")
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
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        func clean(_ value: String) -> JSONValue? {
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            return trimmed.isEmpty ? nil : .string(trimmed)
        }
        var body: [String: JSONValue] = [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "employeeNumber": .string(number.trimmingCharacters(in: .whitespaces)),
            "compensationType": .string(payType),
            // Hourly staff still need an annual figure; 2,080 hours is a full-time year.
            "salary": .number(Double(payType == "salary" ? salary : hourly * 2080)),
            "payFrequency": .string(frequency),
            "startDate": .string(DubblDate.string(start)),
            "currency": .string(env.session.currency),
        ]
        if payType == "hourly" { body["hourlyRate"] = .number(Double(hourly)) }
        if let email = clean(email) { body["email"] = email }
        if let position = clean(position) { body["position"] = position }
        do {
            let _: JSONValue = try await env.api.post("payroll/employees", body: body)
            env.toast.show("Employee added")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One contractor: their rate, payments (pay the pending ones) and details.
/// `GET payroll/contractors/{id}` -> `{ contractor }` with payments.
struct PayrollContractorView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var contractor: JSONValue?
    @State private var error: String?
    @State private var addingPayment = false
    @State private var paying: String?

    private var currency: String { contractor?["currency"]?.stringValue ?? env.session.currency }

    var body: some View {
        ScrollView {
            if let contractor {
                let payments = contractor["payments"]?.arrayValue ?? []
                let paid = payments.filter { $0["status"]?.stringValue == "paid" }.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }
                let pending = payments.filter { $0["status"]?.stringValue == "pending" }.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }
                VStack(alignment: .leading, spacing: 24) {
                    hero(contractor)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        PayrollStat(label: "Paid", value: Money.short(paid, currency: currency), detail: "All time")
                        PayrollStat(label: "Pending", value: Money.short(pending, currency: currency), detail: pending > 0 ? "Ready to pay" : "Nothing due")
                    }
                    paymentsSection(payments)
                    details(contractor)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Contractor")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("What have I paid \(contractor?["name"]?.stringValue ?? "this contractor") this year, and do they need a 1099?", page: "payroll-contractors")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if contractor?["isActive"]?.boolValue == false {
                        Button { Task { await setActive(true) } } label: { Label("Reactivate", systemImage: "play.circle") }
                    } else {
                        Button { Task { await setActive(false) } } label: { Label("Deactivate", systemImage: "pause.circle") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if contractor != nil {
                PayrollActionTray(actions: [PayrollTrayAction(title: "New payment", symbol: "plus") { addingPayment = true }])
            }
        }
        .sheet(isPresented: $addingPayment) {
            PayrollContractorPaymentSheet(contractorID: id, currency: currency) { Task { await load() } }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func hero(_ contractor: JSONValue) -> some View {
        let name = contractor["name"]?.stringValue ?? "Contractor"
        let active = contractor["isActive"]?.boolValue ?? true
        return HStack(spacing: 14) {
            Avatar(name: name, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 24, weight: .semibold))
                    .tracking(-0.5)
                    .foregroundStyle(DTheme.ink)
                HStack(spacing: 8) {
                    if let company = contractor["company"]?.stringValue {
                        Text(company)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    LedgerStatus(text: active ? "Active" : "Inactive", tone: active ? .positive : .neutral)
                }
                if let rate = contractor["hourlyRate"]?.intValue {
                    Text("\(Money.format(rate, currency: currency)) an hour")
                        .font(.system(size: 14, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func paymentsSection(_ payments: [JSONValue]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Payments · \(payments.count)")
            if payments.isEmpty {
                Text("No payments yet.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(Array(payments.enumerated()), id: \.offset) { _, payment in
                        paymentRow(payment)
                    }
                }
            }
        }
    }

    private func paymentRow(_ payment: JSONValue) -> some View {
        let status = payment["status"]?.stringValue ?? "pending"
        let paymentID = payment.recordID
        let facts = [
            payment["invoiceNumber"]?.stringValue,
            payment["periodStart"]?.stringValue.map { PayrollFormat.period($0, payment["periodEnd"]?.stringValue) },
            (payment["paidAt"]?.stringValue ?? payment["createdAt"]?.stringValue).map(DubblDate.short),
        ].compactMap { $0 }
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(payment["description"]?.stringValue ?? "Payment")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text(facts.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 5) {
                Text(Money.format(payment["amount"]?.intValue ?? 0, currency: payment["currency"]?.stringValue ?? currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                if status == "pending", let paymentID {
                    Button {
                        Task { await pay(paymentID) }
                    } label: {
                        if paying == paymentID { ProgressView().controlSize(.mini) } else { Text("Pay") }
                    }
                    .buttonStyle(SoftButtonStyle(size: .small))
                    .disabled(paying != nil)
                } else {
                    LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func details(_ contractor: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                if let email = contractor["email"]?.stringValue { DetailRow("Email", email) }
                if let taxID = contractor["taxId"]?.stringValue {
                    DetailRow(label: "Tax ID") { Text(taxID).font(.system(size: 15, design: .monospaced)) }
                }
                DetailRow("Currency", currency)
                DetailRow("Added", DubblDate.display(contractor["createdAt"]?.stringValue))
            }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/contractors/\(id)")
            withAnimation(.snappy) {
                contractor = response["contractor"] ?? response
                error = nil
            }
        } catch {
            if contractor == nil { self.error = error.localizedDescription }
        }
    }

    private func pay(_ paymentID: String) async {
        paying = paymentID
        defer { paying = nil }
        let ok = await PayrollCall.run(env, done: "Payment made", spec: "payroll-contractors") {
            let _: JSONValue = try await env.api.post("payroll/contractors/\(id)/payments/\(paymentID)/process", body: [String: JSONValue]())
        }
        if ok { await load() }
    }

    private func setActive(_ value: Bool) async {
        let ok = await PayrollCall.run(env, done: value ? "Reactivated" : "Deactivated", spec: "payroll-contractors") {
            let _: JSONValue = try await env.api.patch("payroll/contractors/\(id)", body: ["isActive": JSONValue.bool(value)])
        }
        if ok { await load() }
    }
}

/// Add a contractor. `POST payroll/contractors` (hourly rate in cents).
struct PayrollContractorSheet: View {
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var company = ""
    @State private var taxID = ""
    @State private var rate = 0
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") { TextField("Full name", text: $name).textContentType(.name) }
                        FieldRow(label: "Company") { TextField("Optional", text: $company) }
                        FieldRow(label: "Email") {
                            TextField("Optional", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        FieldRow(label: "Tax ID") {
                            TextField("For 1099s", text: $taxID)
                                .autocorrectionDisabled()
                                .font(.system(size: 16, design: .monospaced))
                        }
                        FieldRow(label: "Hourly rate") { AmountField(minor: $rate, currency: env.session.currency, placeholder: "Optional") }
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
            .navigationTitle("New contractor")
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
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = ["name": .string(name.trimmingCharacters(in: .whitespaces)), "currency": .string(env.session.currency)]
        for (key, value) in [("email", email), ("company", company), ("taxId", taxID)] {
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { body[key] = .string(trimmed) }
        }
        if rate > 0 { body["hourlyRate"] = .number(Double(rate)) }
        do {
            let _: JSONValue = try await env.api.post("payroll/contractors", body: body)
            env.toast.show("Contractor added")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Log a payment owed to a contractor; pay it from their page.
/// `POST payroll/contractors/{id}/payments`.
struct PayrollContractorPaymentSheet: View {
    let contractorID: String
    let currency: String
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var amount = 0
    @State private var description = ""
    @State private var invoice = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Amount") { AmountField(minor: $amount, currency: currency) }
                        FieldRow(label: "What for") { TextField("e.g. October design work", text: $description) }
                        FieldRow(label: "Their invoice number") {
                            TextField("Optional", text: $invoice)
                                .autocorrectionDisabled()
                                .font(.system(size: 16, design: .monospaced))
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
            .background(DTheme.shell)
            .navigationTitle("New payment")
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
                    .disabled(amount <= 0 || saving)
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
        var body: [String: JSONValue] = ["amount": .number(Double(amount)), "currency": .string(currency)]
        let what = description.trimmingCharacters(in: .whitespaces)
        if !what.isEmpty { body["description"] = .string(what) }
        let number = invoice.trimmingCharacters(in: .whitespaces)
        if !number.isEmpty { body["invoiceNumber"] = .string(number) }
        do {
            let _: JSONValue = try await env.api.post("payroll/contractors/\(contractorID)/payments", body: body)
            env.toast.show("Payment added")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
