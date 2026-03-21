import SwiftUI

struct ReportsView: View {
    @State private var selectedReport: ReportType?
    @State private var reportData: Report?
    @State private var isLoading = false
    @State private var error: String?

    private let service = AccountingService()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Report Cards Grid
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ], spacing: 12) {
                    ForEach(ReportType.allCases, id: \.rawValue) { reportType in
                        Button(action: { Task { await generateReport(reportType) } }) {
                            VStack(spacing: 10) {
                                Image(systemName: reportType.icon)
                                    .font(.system(size: 24))
                                    .foregroundColor(.dubblPrimary)
                                Text(reportType.displayName)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(.primary)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 20)
                            .background(
                                selectedReport == reportType
                                    ? Color.dubblPrimaryLight
                                    : Color.dubblCardBackground
                            )
                            .cornerRadius(10)
                            .shadow(color: .black.opacity(0.04), radius: 4, x: 0, y: 2)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(selectedReport == reportType ? Color.dubblPrimary : Color.clear, lineWidth: 2)
                            )
                        }
                    }
                }
                .padding(.horizontal)

                // Report Result
                if isLoading {
                    ProgressView()
                        .tint(.dubblPrimary)
                        .padding(.vertical, 40)
                }

                if let error = error {
                    Text(error)
                        .font(.subheadline).foregroundColor(.dubblDestructive)
                        .padding()
                }

                if let report = reportData, let data = report.data {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(report.title ?? selectedReport?.displayName ?? "Report")
                            .font(.headline)
                            .padding(.horizontal)

                        // Summary
                        if let summary = data.summary, !summary.isEmpty {
                            VStack(spacing: 8) {
                                ForEach(Array(summary.keys.sorted()), id: \.self) { key in
                                    DetailRow(
                                        label: key.replacingOccurrences(of: "_", with: " ").capitalized,
                                        value: summary[key]?.stringValue ?? "-"
                                    )
                                }
                            }
                            .dubblCard()
                            .padding(.horizontal)
                        }

                        // Data Rows
                        if let rows = data.rows, !rows.isEmpty {
                            let columns = data.columns ?? []
                            ForEach(0..<min(rows.count, 50), id: \.self) { index in
                                let row = rows[index]
                                VStack(alignment: .leading, spacing: 4) {
                                    if columns.isEmpty {
                                        ForEach(Array(row.keys.sorted()), id: \.self) { key in
                                            HStack {
                                                Text(key.replacingOccurrences(of: "_", with: " ").capitalized)
                                                    .font(.caption).foregroundColor(.dubblMuted)
                                                Spacer()
                                                Text(row[key]?.stringValue ?? "-")
                                                    .font(.caption)
                                            }
                                        }
                                    } else {
                                        ForEach(columns, id: \.key) { col in
                                            HStack {
                                                Text(col.label ?? col.key ?? "")
                                                    .font(.caption).foregroundColor(.dubblMuted)
                                                Spacer()
                                                Text(row[col.key ?? ""]?.stringValue ?? "-")
                                                    .font(.caption)
                                            }
                                        }
                                    }
                                }
                                .dubblCard()
                                .padding(.horizontal)
                            }

                            if rows.count > 50 {
                                Text("Showing first 50 of \(rows.count) rows")
                                    .font(.caption).foregroundColor(.dubblMuted)
                                    .padding()
                            }
                        }
                    }
                }

                Spacer(minLength: 80)
            }
            .padding(.vertical)
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Reports")
    }

    private func generateReport(_ type: ReportType) async {
        selectedReport = type
        isLoading = true
        error = nil
        reportData = nil

        do {
            reportData = try await service.generateReport(type: type.rawValue)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}
