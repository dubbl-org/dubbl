import Charts
import SwiftUI

/// Payroll reports and forecast: totals, gross by month, cost by department,
/// the next twelve months and a what-if. `GET payroll/reports/summary`,
/// `/yoy`, `/labor-cost`, `GET payroll/forecasting/projection`,
/// `POST payroll/forecasting/what-if`.
struct PayrollAnalyticsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var summary: JSONValue?
    @State private var months: [JSONValue] = []
    @State private var departments: [JSONValue] = []
    @State private var projection: JSONValue?
    @State private var loaded = false
    @State private var error: String?
    @State private var showingWhatIf = false

    private var currency: String { env.session.currency }

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    totals
                    history
                    forecast
                    labor
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Reports and forecast")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showingWhatIf = true } label: { Label("What if…", systemImage: "slider.horizontal.3") }
                    Button {
                        env.router.askTilly("How will payroll costs change over the next year?", page: "payroll-analytics")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More")
            }
        }
        .sheet(isPresented: $showingWhatIf) {
            PayrollWhatIfSheet()
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var totals: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            PayrollStat(label: "Gross paid", value: Money.short(summary?["summary.totalGross"]?.intValue ?? 0, currency: currency), detail: "\(summary?["summary.totalRuns"]?.intValue ?? 0) runs")
            PayrollStat(label: "Net paid", value: Money.short(summary?["summary.totalNet"]?.intValue ?? 0, currency: currency), detail: "Take-home")
            PayrollStat(label: "Tax and deductions", value: Money.short(summary?["summary.totalDeductions"]?.intValue ?? 0, currency: currency), detail: "Withheld")
            PayrollStat(label: "Average run", value: Money.short(summary?["summary.avgCostPerRun"]?.intValue ?? 0, currency: currency), detail: "\(summary?["summary.activeEmployees"]?.intValue ?? 0) active people")
        }
    }

    @ViewBuilder
    private var history: some View {
        if !months.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Paid by month")
                Chart {
                    ForEach(Array(months.enumerated()), id: \.offset) { _, month in
                        if let date = Self.month(month["month"]?.stringValue) {
                            ForEach(["Gross", "Net"], id: \.self) { series in
                                BarMark(x: .value("Month", date, unit: .month), y: .value("Amount", Double(month[series == "Gross" ? "totalGross" : "totalNet"]?.intValue ?? 0) / 100))
                                    .foregroundStyle(by: .value("Series", series))
                                    .position(by: .value("Series", series))
                                    .cornerRadius(3)
                            }
                        }
                    }
                }
                .chartForegroundStyleScale(["Gross": DTheme.inkTertiary.opacity(0.45), "Net": DTheme.ink])
                .chartLegend(.hidden)
                .chartYAxis {
                    AxisMarks(position: .trailing) { value in
                        AxisGridLine().foregroundStyle(DTheme.hairline)
                        AxisValueLabel {
                            if let amount = value.as(Double.self) {
                                Text(Money.short(Int(amount * 100), currency: currency)).font(.system(size: 11)).foregroundStyle(DTheme.inkTertiary)
                            }
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month, count: 2)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated)).font(.system(size: 11)).foregroundStyle(DTheme.inkTertiary)
                    }
                }
                .frame(height: 180)
                .dubblCard()
                HStack(spacing: 16) {
                    key("Gross", DTheme.inkTertiary.opacity(0.45))
                    key("Net", DTheme.ink)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    @ViewBuilder
    private var forecast: some View {
        let points = projection?["data"]?.arrayValue ?? []
        if !points.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Next 12 months")
                VStack(alignment: .leading, spacing: 14) {
                    LedgerTotals(items: [
                        .init(label: "Gross", value: Money.short(projection?["totals.gross"]?.intValue ?? 0, currency: currency)),
                        .init(label: "Tax", value: Money.short(projection?["totals.tax"]?.intValue ?? 0, currency: currency), tint: DTheme.orange),
                        .init(label: "Net", value: Money.short(projection?["totals.net"]?.intValue ?? 0, currency: currency), tint: DTheme.ink),
                    ])
                    Chart {
                        ForEach(Array(points.enumerated()), id: \.offset) { _, point in
                            if let date = Self.month(point["month"]?.stringValue) {
                                AreaMark(x: .value("Month", date, unit: .month), y: .value("Gross", Double(point["gross"]?.intValue ?? 0) / 100))
                                    .foregroundStyle(DTheme.tint)
                                LineMark(x: .value("Month", date, unit: .month), y: .value("Net", Double(point["net"]?.intValue ?? 0) / 100))
                                    .foregroundStyle(DTheme.ink)
                                    .lineStyle(StrokeStyle(lineWidth: 2))
                            }
                        }
                    }
                    .chartYScale(domain: 0 ... max(1, Double(points.compactMap { $0["gross"]?.intValue }.max() ?? 0) / 100 * 1.15))
                    .chartYAxis(.hidden)
                    .chartXAxis {
                        AxisMarks(values: .stride(by: .month, count: 3)) { _ in
                            AxisValueLabel(format: .dateTime.month(.abbreviated)).font(.system(size: 11)).foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                    .frame(height: 120)
                    Button { showingWhatIf = true } label: { Label("Try a what-if", systemImage: "slider.horizontal.3") }
                        .buttonStyle(SoftButtonStyle(fullWidth: true))
                }
                .dubblCard()
            }
        }
    }

    @ViewBuilder
    private var labor: some View {
        if !departments.isEmpty {
            let total = max(departments.reduce(0) { $0 + ($1["totalGross"]?.intValue ?? 0) }, 1)
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Cost by department")
                CardStack {
                    ForEach(Array(departments.enumerated()), id: \.offset) { _, row in
                        let gross = row["totalGross"]?.intValue ?? 0
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(row["department"]?.stringValue ?? "Unassigned")
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(DTheme.ink)
                                Text("\(row["employeeCount"]?.intValue ?? 0) people")
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkTertiary)
                                Spacer()
                                Text(Money.format(gross, currency: currency))
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.ink)
                            }
                            GeometryReader { proxy in
                                Capsule().fill(DTheme.tint)
                                    .overlay(alignment: .leading) {
                                        Capsule().fill(DTheme.ink).frame(width: max(4, proxy.size.width * CGFloat(gross) / CGFloat(total)))
                                    }
                            }
                            .frame(height: 5)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
        }
    }

    private func key(_ label: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(label)
                .font(.system(size: 12.5))
                .foregroundStyle(DTheme.inkSecondary)
        }
    }

    /// "2026-10" -> the first of that month.
    static func month(_ value: String?) -> Date? {
        guard let value, value.count >= 7 else { return nil }
        return DubblDate.parseDay(String(value.prefix(7)) + "-01")
    }

    private func load() async {
        do {
            let api = env.api
            async let summaryResponse: JSONValue = api.get("payroll/reports/summary")
            async let yoy: JSONValue? = try? api.get("payroll/reports/yoy")
            async let labor: JSONValue? = try? api.get("payroll/reports/labor-cost")
            async let forecast: JSONValue? = try? api.get("payroll/forecasting/projection", query: ["months": "12"])
            let (s, y, l, f) = try await (summaryResponse, yoy, labor, forecast)
            withAnimation(.snappy) {
                summary = s
                months = Array((y?["data"]?.arrayValue ?? []).suffix(12))
                departments = (l?["data"]?.arrayValue ?? []).sorted { ($0["totalGross"]?.intValue ?? 0) > ($1["totalGross"]?.intValue ?? 0) }
                projection = f
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

/// Raises, hires and leavers against the current monthly gross.
/// `POST payroll/forecasting/what-if` -> current, projected and the difference.
private struct PayrollWhatIfSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var raise = 3.0
    @State private var hires = 0
    @State private var salary = 0
    @State private var leavers = 0
    @State private var result: JSONValue?
    @State private var running = false

    private var currency: String { env.session.currency }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Raise for everyone")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Text(raise.formatted(.number.precision(.fractionLength(1))) + "%")
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.ink)
                            }
                            Slider(value: $raise, in: -10 ... 20, step: 0.5)
                                .tint(DTheme.ink)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        Stepper(value: $hires, in: 0 ... 50) {
                            Text("New hires · \(hires)").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                        if hires > 0 {
                            FieldRow(label: "Average new hire salary") { AmountField(minor: $salary, currency: currency) }
                        }
                        Stepper(value: $leavers, in: 0 ... 50) {
                            Text("Leavers · \(leavers)").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                    }

                    if let result {
                        let change = result["difference.monthlyGross"]?.intValue ?? 0
                        VStack(alignment: .leading, spacing: 14) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Monthly gross")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(DTheme.inkSecondary)
                                Text(Money.format(result["projected.monthlyGross"]?.intValue ?? 0, currency: currency))
                                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.ink)
                                Text("\(change >= 0 ? "+" : "−")\(Money.format(abs(change), currency: currency)) a month")
                                    .font(.system(size: 14, weight: .medium, design: .rounded))
                                    .foregroundStyle(change > 0 ? DTheme.negative : DTheme.positive)
                            }
                            CardStack {
                                TaxFigureRow(label: "Now", value: Money.format(result["current.monthlyGross"]?.intValue ?? 0, currency: currency), detail: "\(result["current.headcount"]?.intValue ?? 0) people")
                                TaxFigureRow(label: "With changes", value: Money.format(result["projected.monthlyGross"]?.intValue ?? 0, currency: currency), detail: "\(result["projected.headcount"]?.intValue ?? 0) people")
                                TaxFigureRow(label: "Over 12 months", value: "\((result["difference.projectedTotal"]?.intValue ?? 0) >= 0 ? "+" : "")\(Money.format(result["difference.projectedTotal"]?.intValue ?? 0, currency: currency))", strong: true)
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .padding(20)
                .animation(.snappy, value: result)
            }
            .background(DTheme.shell)
            .navigationTitle("What if")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task(id: "\(raise)|\(hires)|\(salary)|\(leavers)") {
                try? await Task.sleep(for: .milliseconds(250))
                if Task.isCancelled { return }
                await run()
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func run() async {
        running = true
        defer { running = false }
        let body: [String: JSONValue] = [
            "salaryAdjustmentPercent": .number(raise),
            "newHires": .number(Double(hires)),
            "avgNewHireSalary": .number(Double(salary)),
            "terminations": .number(Double(leavers)),
            "months": .number(12),
        ]
        do {
            result = try await env.api.post("payroll/forecasting/what-if", body: body)
        } catch {
            env.toast.error(error)
        }
    }
}
