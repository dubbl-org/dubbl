import SwiftUI

/// Your own payroll, for whoever's signed in: profile, time off, payslips and
/// timesheets, plus requesting leave and updating pay details.
/// `GET payroll/self-service/profile | leave-balance | payslips | timesheets`.
struct PayrollSelfServiceView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var profile: JSONValue?
    @State private var balances: [JSONValue] = []
    @State private var payslips: [JSONValue] = []
    @State private var timesheets: [JSONValue] = []
    @State private var loaded = false
    @State private var notEmployee = false
    @State private var error: String?
    @State private var requestingLeave = false
    @State private var editing = false
    @State private var slip: JSONValue?

    private var currency: String { profile?["currency"]?.stringValue ?? env.session.currency }

    var body: some View {
        ScrollView {
            if notEmployee {
                EmptyStateView(symbol: "person.badge.key", title: "You're not on payroll here", message: "Once an admin links you to an employee record, your payslips, time off and timesheets show up here.")
                    .padding(.top, 80)
            } else {
                TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                    if let profile {
                        VStack(alignment: .leading, spacing: 24) {
                            header(profile)
                            leave
                            slips
                            sheets
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Self-service")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if profile != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { requestingLeave = true } label: { Label("Request time off", systemImage: "airplane") }
                        Button { editing = true } label: { Label("Update my details", systemImage: "pencil") }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New")
                }
            }
        }
        .sheet(isPresented: $requestingLeave) {
            PayrollLeaveRequestSheet(policies: balances.compactMap { $0["policy"] }) { Task { await load() } }
        }
        .sheet(isPresented: $editing) {
            PayrollMyDetailsSheet(profile: profile ?? .null) { Task { await load() } }
        }
        .sheet(item: Binding(get: { slip.map(PayrollMySlip.init) }, set: { slip = $0?.slip })) { item in
            PayrollPayslipSheet(item: item.asItem(profile: profile), run: item.slip["payrollRun"] ?? .null)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func header(_ profile: JSONValue) -> some View {
        let name = profile["name"]?.stringValue ?? "You"
        let salary = profile["salary"]?.intValue ?? 0
        return VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                Avatar(name: name, size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                    Text([profile["position"]?.stringValue, profile["employeeNumber"]?.stringValue].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                PayrollStat(label: "Each pay", value: Money.short(salary / PayrollFormat.periods(profile["payFrequency"]?.stringValue), currency: currency), detail: PayrollFormat.frequency(profile["payFrequency"]?.stringValue))
                PayrollStat(label: "Last take-home", value: payslips.first.map { Money.short($0["netAmount"]?.intValue ?? 0, currency: currency) } ?? "–", detail: payslips.first.map { DubblDate.short($0["payrollRun.payPeriodEnd"]?.stringValue) } ?? "No payslips yet")
            }
        }
    }

    @ViewBuilder
    private var leave: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Time off", action: ("Request", { requestingLeave = true }))
            if balances.isEmpty {
                Text("No leave policies yet.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(Array(balances.enumerated()), id: \.offset) { _, balance in
                        TaxFigureRow(label: balance["policy.name"]?.stringValue ?? "Leave", value: PayrollFormat.hours(balance["balance"]), detail: "\(PayrollFormat.hours(balance["usedHours"])) used")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var slips: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Payslips")
            if payslips.isEmpty {
                Text("Your payslips show up here after each pay run.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(Array(payslips.prefix(12).enumerated()), id: \.offset) { _, payslip in
                        Button { slip = payslip } label: {
                            TaxFigureRow(
                                label: PayrollFormat.period(payslip["payrollRun.payPeriodStart"]?.stringValue, payslip["payrollRun.payPeriodEnd"]?.stringValue),
                                value: Money.format(payslip["netAmount"]?.intValue ?? 0, currency: currency),
                                detail: "\(Money.format(payslip["grossAmount"]?.intValue ?? 0, currency: currency)) gross · \(Money.format(payslip["taxAmount"]?.intValue ?? 0, currency: currency)) tax"
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var sheets: some View {
        if !timesheets.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Timesheets")
                CardStack {
                    ForEach(Array(timesheets.prefix(8).enumerated()), id: \.offset) { _, sheet in
                        let status = sheet["status"]?.stringValue ?? "draft"
                        HStack {
                            TaxFigureRow(label: PayrollFormat.period(sheet["periodStart"]?.stringValue, sheet["periodEnd"]?.stringValue), value: PayrollFormat.hours(sheet["totalHours"]))
                            LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                                .padding(.trailing, 16)
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let api = env.api
            let me: JSONValue = try await api.get("payroll/self-service/profile")
            async let leave: JSONValue? = try? api.get("payroll/self-service/leave-balance")
            async let pay: JSONValue? = try? api.get("payroll/self-service/payslips")
            async let time: JSONValue? = try? api.get("payroll/self-service/timesheets")
            let (l, p, t) = await (leave, pay, time)
            withAnimation(.snappy) {
                profile = me["employee"] ?? me
                balances = l?["data"]?.arrayValue ?? []
                payslips = p?["data"]?.arrayValue ?? []
                timesheets = t?["data"]?.arrayValue ?? []
                loaded = true
                notEmployee = false
                error = nil
            }
        } catch let APIError.server(status, _) where status == 404 {
            notEmployee = true
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

/// A self-service payslip, shaped like a run's payroll item for the payslip sheet.
private struct PayrollMySlip: Identifiable {
    let slip: JSONValue
    var id: String { slip.recordID ?? "slip" }

    func asItem(profile: JSONValue?) -> JSONValue {
        guard case var .object(object) = slip else { return slip }
        object["employee"] = profile ?? .null
        object["deductions"] = .number(Double(max(0, (slip["grossAmount"]?.intValue ?? 0) - (slip["taxAmount"]?.intValue ?? 0) - (slip["netAmount"]?.intValue ?? 0))))
        return .object(object)
    }
}

/// Ask for time off against one of your leave policies.
/// `POST payroll/self-service/leave-requests { policyId, startDate, endDate, hours }`.
private struct PayrollLeaveRequestSheet: View {
    let policies: [JSONValue]
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var policyID = ""
    @State private var start = Date()
    @State private var end = Date()
    @State private var hours = 8.0
    @State private var reason = ""
    @State private var saving = false
    @State private var error: String?

    /// Working days in the range at eight hours each.
    private var suggestedHours: Double {
        let calendar = Calendar(identifier: .gregorian)
        var day = calendar.startOfDay(for: start)
        var count = 0
        while day <= calendar.startOfDay(for: end) {
            if !calendar.isDateInWeekend(day) { count += 1 }
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return Double(max(count, 1) * 8)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        HStack {
                            Text("Type")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Type", selection: $policyID) {
                                ForEach(Array(policies.enumerated()), id: \.offset) { _, policy in
                                    Text(policy["name"]?.stringValue ?? "Leave").tag(policy.recordID ?? "")
                                }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                        DatePicker("From", selection: $start, displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        DatePicker("To", selection: $end, in: start..., displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        Stepper(value: $hours, in: 1 ... 400, step: 1) {
                            Text("Hours · \(hours.formatted(.number.precision(.fractionLength(0))))")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                        FieldRow(label: "Note") { TextField("Optional", text: $reason, axis: .vertical) }
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
            .navigationTitle("Request time off")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Send") }
                    }
                    .disabled(policyID.isEmpty || saving)
                }
            }
            .onAppear { if policyID.isEmpty { policyID = policies.first?.recordID ?? "" } }
            .onChange(of: start) { _, _ in hours = suggestedHours }
            .onChange(of: end) { _, _ in hours = suggestedHours }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [
            "policyId": .string(policyID),
            "startDate": .string(DubblDate.string(start)),
            "endDate": .string(DubblDate.string(end)),
            "hours": .number(hours),
        ]
        let note = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty { body["reason"] = .string(note) }
        do {
            let _: JSONValue = try await env.api.post("payroll/self-service/leave-requests", body: body)
            env.toast.show("Request sent")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Change the email and bank account your pay goes to. `PATCH payroll/self-service/profile`.
private struct PayrollMyDetailsSheet: View {
    let profile: JSONValue
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var bank = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Email") {
                            TextField("you@example.com", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        FieldRow(label: "Bank account number") {
                            TextField("Leave blank to keep the current one", text: $bank)
                                .keyboardType(.numberPad)
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
            .navigationTitle("My details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(saving)
                }
            }
            .onAppear { email = profile["email"]?.stringValue ?? "" }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [:]
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        if !trimmedEmail.isEmpty { body["email"] = .string(trimmedEmail) }
        let trimmedBank = bank.trimmingCharacters(in: .whitespaces)
        if !trimmedBank.isEmpty { body["bankAccountNumber"] = .string(trimmedBank) }
        do {
            let _: JSONValue = try await env.api.patch("payroll/self-service/profile", body: body)
            env.toast.show("Details saved")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
