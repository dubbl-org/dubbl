import SwiftUI

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Greeting
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Welcome back")
                                .font(.subheadline)
                                .foregroundColor(.dubblMuted)
                            Text(authManager.currentUser?.name ?? "User")
                                .font(.title2)
                                .fontWeight(.bold)
                        }
                        Spacer()
                        if let org = authManager.currentOrganization {
                            Text(org.name)
                                .font(.caption)
                                .foregroundColor(.dubblPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color.dubblPrimaryLight)
                                .cornerRadius(12)
                        }
                    }
                    .padding(.horizontal)

                    // Stats Grid
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 12),
                        GridItem(.flexible(), spacing: 12)
                    ], spacing: 12) {
                        StatCard(
                            title: "Bank Balance",
                            value: viewModel.summary.bankBalance.asCurrency(),
                            icon: "building.columns",
                            color: .dubblPrimary
                        )
                        StatCard(
                            title: "Revenue",
                            value: viewModel.summary.totalRevenue.asCurrency(),
                            icon: "arrow.down.circle",
                            color: .dubblPrimary
                        )
                        StatCard(
                            title: "Outstanding",
                            value: viewModel.summary.totalOutstanding.asCurrency(),
                            icon: "clock",
                            color: .dubblWarning
                        )
                        StatCard(
                            title: "Overdue",
                            value: viewModel.summary.totalOverdue.asCurrency(),
                            icon: "exclamationmark.triangle",
                            color: .dubblDestructive
                        )
                    }
                    .padding(.horizontal)

                    // Overdue Invoices
                    if !viewModel.summary.overdueInvoices.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Overdue Invoices")
                                .padding(.horizontal)

                            ForEach(viewModel.summary.overdueInvoices) { invoice in
                                InvoiceRow(invoice: invoice)
                                    .padding(.horizontal)
                            }
                        }
                    }

                    // Recent Invoices
                    if !viewModel.summary.recentInvoices.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Recent Invoices")
                                .padding(.horizontal)

                            ForEach(viewModel.summary.recentInvoices.prefix(5)) { invoice in
                                InvoiceRow(invoice: invoice)
                                    .padding(.horizontal)
                            }
                        }
                    }

                    // Recent Bills
                    if !viewModel.summary.recentBills.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "Recent Bills")
                                .padding(.horizontal)

                            ForEach(viewModel.summary.recentBills.prefix(5)) { bill in
                                BillRow(bill: bill)
                                    .padding(.horizontal)
                            }
                        }
                    }

                    Spacer(minLength: 80)
                }
                .padding(.vertical)
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .dubblNavigationTitle("Dashboard")
            .refreshable { await viewModel.load() }
            .task { await viewModel.load() }
            .overlay {
                if viewModel.isLoading && viewModel.summary.recentInvoices.isEmpty {
                    LoadingView()
                }
                if let error = viewModel.error, viewModel.summary.recentInvoices.isEmpty {
                    ErrorView(message: error) { Task { await viewModel.load() } }
                }
            }
        }
    }
}

// MARK: - Invoice Row

struct InvoiceRow: View {
    let invoice: Invoice

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(invoice.contact?.name ?? invoice.invoiceNumber ?? "Invoice")
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(invoice.invoiceNumber ?? "")
                    .font(.caption)
                    .foregroundColor(.dubblMuted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                CurrencyText(invoice.total, currency: invoice.currencyCode, style: .subheadline, weight: .semibold)
                if let status = invoice.status {
                    StatusBadge(invoiceStatus: status)
                }
            }
        }
        .dubblCard()
    }
}

// MARK: - Bill Row

struct BillRow: View {
    let bill: Bill

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(bill.contact?.name ?? bill.billNumber ?? "Bill")
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(bill.billNumber ?? "")
                    .font(.caption)
                    .foregroundColor(.dubblMuted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                CurrencyText(bill.total, currency: bill.currencyCode, style: .subheadline, weight: .semibold)
                if let status = bill.status {
                    StatusBadge(billStatus: status)
                }
            }
        }
        .dubblCard()
    }
}
