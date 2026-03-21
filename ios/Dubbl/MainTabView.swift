import SwiftUI

struct MainTabView: View {
    @State private var selectedTab = 0
    @State private var showMoreMenu = false

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "house")
                }
                .tag(0)

            NavigationView { InvoiceListView() }
                .tabItem {
                    Label("Invoices", systemImage: "doc.text")
                }
                .tag(1)

            NavigationView { BillListView() }
                .tabItem {
                    Label("Bills", systemImage: "doc.plaintext")
                }
                .tag(2)

            NavigationView { ContactListView() }
                .tabItem {
                    Label("Contacts", systemImage: "person.2")
                }
                .tag(3)

            NavigationView { MoreView() }
                .tabItem {
                    Label("More", systemImage: "ellipsis.circle")
                }
                .tag(4)
        }
        .tint(.dubblPrimary)
        .dubblGlassBar()
    }
}

// MARK: - More Menu (access to all features)

struct MoreView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        List {
            Section("Finance") {
                NavigationLink(destination: BankingView()) {
                    Label("Banking", systemImage: "building.columns")
                        .foregroundColor(.primary)
                }
                NavigationLink(destination: AccountingView()) {
                    Label("Accounting", systemImage: "book")
                        .foregroundColor(.primary)
                }
                NavigationLink(destination: ReportsView()) {
                    Label("Reports", systemImage: "chart.bar")
                        .foregroundColor(.primary)
                }
            }

            Section("Operations") {
                NavigationLink(destination: InventoryView()) {
                    Label("Inventory", systemImage: "cube.box")
                        .foregroundColor(.primary)
                }
                NavigationLink(destination: ProjectListView()) {
                    Label("Projects", systemImage: "folder")
                        .foregroundColor(.primary)
                }
                NavigationLink(destination: ExpenseListView()) {
                    Label("Expenses", systemImage: "receipt")
                        .foregroundColor(.primary)
                }
            }

            Section("Team") {
                NavigationLink(destination: PayrollView()) {
                    Label("Payroll", systemImage: "dollarsign.circle")
                        .foregroundColor(.primary)
                }
                NavigationLink(destination: CRMView()) {
                    Label("Sales & CRM", systemImage: "chart.bar.xaxis")
                        .foregroundColor(.primary)
                }
            }

            Section("Settings") {
                NavigationLink(destination: SettingsView().environmentObject(authManager)) {
                    Label("Settings", systemImage: "gear")
                        .foregroundColor(.primary)
                }
            }
        }
        .dubblNavigationTitle("More")
    }
}
