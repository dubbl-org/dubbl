import Charts
import SwiftUI

/// CRM at a glance: pipeline value, won revenue, win rate and average won
/// deal, the deal counts, and where the money sits by stage.
struct CRMAnalyticsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var pipelines: [JSONValue] = []

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { data in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    tiles(data)
                    counts(data)
                    stages(data)
                }
                .padding(16)
                .padding(.bottom, 20)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Analytics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    env.router.askTilly("How is my sales pipeline doing, and where are deals getting stuck?", page: "crm")
                } label: {
                    Image(systemName: "sparkle")
                }
                .accessibilityLabel("Ask Tilly")
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        async let pipelinesResponse: JSONValue? = try? env.api.get("crm/pipelines")
        await loader.load(env.api, "crm/analytics")
        pipelines = await pipelinesResponse?.opsArray("pipelines") ?? []
    }

    private var currency: String { env.session.currency }

    private func tiles(_ data: JSONValue) -> some View {
        let items: [(String, String, String, Tone)] = [
            ("Pipeline value", Money.short(data["totalPipelineValue"]?.intValue ?? 0, currency: currency), "\(data["openDeals"]?.intValue ?? 0) open deals", .info),
            ("Won revenue", Money.short(data["wonValue"]?.intValue ?? 0, currency: currency), "\(data["wonDeals"]?.intValue ?? 0) won", .positive),
            ("Win rate", "\(data["conversionRate"]?.intValue ?? 0)%", "Won of all closed", .special),
            ("Average won deal", Money.short(data["avgDealValue"]?.intValue ?? 0, currency: currency), "Across won deals", .orange),
        ]
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(items, id: \.0) { item in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Circle().fill(item.3.color).frame(width: 6, height: 6)
                        Text(item.0).font(.system(size: 13, weight: .medium)).foregroundStyle(DTheme.inkSecondary).lineLimit(1)
                    }
                    Text(item.1)
                        .font(.system(size: 26, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(item.2).font(.system(size: 12.5)).foregroundStyle(DTheme.inkTertiary).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .dubblCard(padding: 14, radius: 18)
            }
        }
    }

    private func counts(_ data: JSONValue) -> some View {
        let total = max(data["totalDeals"]?.intValue ?? 0, 1)
        let parts: [(String, Int, Tone)] = [
            ("Open", data["openDeals"]?.intValue ?? 0, .info),
            ("Won", data["wonDeals"]?.intValue ?? 0, .positive),
            ("Lost", data["lostDeals"]?.intValue ?? 0, .negative),
        ]
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("\(data["totalDeals"]?.intValue ?? 0) deals")
            VStack(alignment: .leading, spacing: 14) {
                GeometryReader { proxy in
                    HStack(spacing: 3) {
                        ForEach(parts, id: \.0) { part in
                            if part.1 > 0 {
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(part.2.color)
                                    .frame(width: max(6, (proxy.size.width - 6) * CGFloat(part.1) / CGFloat(total)))
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                .frame(height: 10)
                HStack(spacing: 18) {
                    ForEach(parts, id: \.0) { part in
                        HStack(spacing: 6) {
                            Circle().fill(part.2.color).frame(width: 7, height: 7)
                            Text(part.0).font(.system(size: 13.5)).foregroundStyle(DTheme.inkSecondary)
                            Text("\(part.1)").font(DFont.figure(13.5, weight: .semibold)).foregroundStyle(DTheme.ink)
                        }
                    }
                }
            }
            .dubblCard()
        }
    }

    private func stages(_ data: JSONValue) -> some View {
        let distribution = data["stageDistribution"]?.objectValue ?? [:]
        // Order stages the way the default pipeline lists them; others after.
        let order = CRM.stages(CRM.defaultPipeline(pipelines)).map(\.id)
        let rows = distribution.map { key, value in
            (id: key, name: stageName(key), count: value["count"]?.intValue ?? 0, value: value["value"]?.intValue ?? 0)
        }
        .sorted { (order.firstIndex(of: $0.id) ?? 99, $0.name) < (order.firstIndex(of: $1.id) ?? 99, $1.name) }
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("By stage")
            if rows.isEmpty {
                Text("Add deals to see where your pipeline's value sits.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    Chart(rows, id: \.id) { row in
                        BarMark(x: .value("Value", Double(row.value) / 100), y: .value("Stage", row.name))
                            .foregroundStyle(CRM.tone(row.id, index: order.firstIndex(of: row.id) ?? 0).color.gradient)
                            .cornerRadius(5)
                    }
                    .chartXAxis {
                        AxisMarks(values: .automatic(desiredCount: 3)) { value in
                            AxisGridLine().foregroundStyle(DTheme.hairline)
                            AxisValueLabel {
                                if let amount = value.as(Double.self) {
                                    Text(Money.short(Int(amount * 100), currency: currency)).font(.system(size: 11))
                                }
                            }
                        }
                    }
                    .chartYAxis {
                        AxisMarks { _ in
                            AxisValueLabel().font(.system(size: 12.5)).foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .frame(height: CGFloat(rows.count) * 38 + 24)
                }
                .dubblCard()
                CardStack {
                    ForEach(rows, id: \.id) { row in
                        OperationsCardRow(title: row.name, subtitle: "\(row.count) \(row.count == 1 ? "deal" : "deals")") {
                            OperationsMoney(minor: row.value, currency: currency)
                        }
                    }
                }
            }
        }
    }

    private func stageName(_ id: String) -> String {
        for pipeline in pipelines {
            if let stage = CRM.stages(pipeline).first(where: { $0.id == id }) { return stage.name }
        }
        return CRM.stageName(id, in: nil)
    }
}
