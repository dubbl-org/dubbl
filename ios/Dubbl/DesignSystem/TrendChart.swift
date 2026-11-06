import Charts
import SwiftUI

struct TrendPoint: Identifiable, Hashable, Sendable {
    var month: Date
    var revenue: Int
    var expenses: Int

    var id: Date { month }
    var net: Int { revenue - expenses }
}

/// Revenue against expenses by month: revenue in sky with a soft area under
/// it, expenses as a dashed orange line. Drag to scrub a month.
struct TrendChart: View {
    let points: [TrendPoint]
    let currency: String
    @State private var selected: Date?
    @State private var drawn: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var selectedPoint: TrendPoint? {
        guard let selected else { return nil }
        return points.min { abs($0.month.timeIntervalSince(selected)) < abs($1.month.timeIntervalSince(selected)) }
    }

    private var peak: Int {
        max(points.map { max($0.revenue, $0.expenses) }.max() ?? 0, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            readout
            chart
                .frame(height: 168)
                .mask(alignment: .leading) {
                    GeometryReader { proxy in
                        Rectangle().frame(width: proxy.size.width * drawn)
                    }
                }
                .onAppear {
                    if reduceMotion { drawn = 1 } else {
                        withAnimation(.easeOut(duration: 0.9)) { drawn = 1 }
                    }
                }
        }
    }

    private var readout: some View {
        let point = selectedPoint ?? points.last
        return HStack(alignment: .firstTextBaseline, spacing: 18) {
            legend("Revenue", value: point?.revenue ?? 0, color: DTheme.chartPrimary)
            legend("Expenses", value: point?.expenses ?? 0, color: DTheme.chartSecondary)
            Spacer()
            Text(point.map { $0.month.formatted(.dateTime.month(.abbreviated).year()) } ?? "")
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(DTheme.inkTertiary)
                .contentTransition(.numericText())
        }
        .animation(.snappy(duration: 0.2), value: selectedPoint)
    }

    private func legend(_ title: String, value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(title).font(.system(size: 12.5, weight: .medium)).foregroundStyle(DTheme.inkSecondary)
            }
            MoneyText(minor: value, currency: currency, size: 17, weight: .semibold, compact: true)
                .foregroundStyle(DTheme.ink)
        }
    }

    private var chart: some View {
        Chart {
            ForEach(points) { point in
                AreaMark(
                    x: .value("Month", point.month, unit: .month),
                    y: .value("Revenue", point.revenue),
                    series: .value("Series", "Revenue area")
                )
                .interpolationMethod(.monotone)
                .foregroundStyle(
                    LinearGradient(colors: [DTheme.chartPrimary.opacity(0.18), DTheme.chartPrimary.opacity(0)], startPoint: .top, endPoint: .bottom)
                )

                LineMark(
                    x: .value("Month", point.month, unit: .month),
                    y: .value("Revenue", point.revenue),
                    series: .value("Series", "Revenue")
                )
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                .foregroundStyle(DTheme.chartPrimary)

                LineMark(
                    x: .value("Month", point.month, unit: .month),
                    y: .value("Expenses", point.expenses),
                    series: .value("Series", "Expenses")
                )
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, dash: [4, 3]))
                .foregroundStyle(DTheme.chartSecondary)
            }

            if let point = selectedPoint {
                RuleMark(x: .value("Month", point.month, unit: .month))
                    .foregroundStyle(DTheme.hairline)
                PointMark(x: .value("Month", point.month, unit: .month), y: .value("Revenue", point.revenue))
                    .symbolSize(40)
                    .foregroundStyle(DTheme.chartPrimary)
            }
        }
        .chartYScale(domain: 0 ... Double(peak) * 1.15)
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(values: .stride(by: .month, count: points.count > 8 ? 3 : 1)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated), centered: true)
                    .font(.system(size: 11))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .chartXSelection(value: $selected)
        .sensoryFeedback(.selection, trigger: selectedPoint?.month)
        .accessibilityLabel("Revenue and expenses by month")
    }
}
