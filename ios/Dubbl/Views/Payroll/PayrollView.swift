import SwiftUI

struct PayrollView: View {
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $selectedTab) {
                Text("Employees").tag(0)
                Text("Pay Runs").tag(1)
                Text("Leave").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            if selectedTab == 0 {
                EmployeeListSection()
            } else if selectedTab == 1 {
                PayRunListSection()
            } else {
                LeaveRequestSection()
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Payroll")
    }
}

// MARK: - Employees

struct EmployeeListSection: View {
    @StateObject private var viewModel: ListViewModel<PayrollEmployee>

    init() {
        let service = PayrollService()
        _viewModel = StateObject(wrappedValue: ListViewModel<PayrollEmployee> { page, limit, _, _ in
            try await service.listEmployees(page: page, limit: limit)
        })
    }

    var body: some View {
        if viewModel.items.isEmpty && !viewModel.isLoading {
            EmptyStateView(icon: "person.3", title: "No Employees", message: "Add employees to start managing payroll.")
        } else {
            List {
                ForEach(viewModel.items) { employee in
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(Color.dubblPrimary.opacity(0.15)).frame(width: 40, height: 40)
                            Text(String(employee.name.prefix(1)).uppercased())
                                .font(.headline).foregroundColor(.dubblPrimary)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(employee.name).font(.subheadline).fontWeight(.medium)
                            Text(employee.position ?? employee.department ?? "")
                                .font(.caption).foregroundColor(.dubblMuted)
                        }
                        Spacer()
                        if let type = employee.compensationType {
                            StatusBadge(type.capitalized, color: .dubblPrimary)
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}

// MARK: - Pay Runs

struct PayRunListSection: View {
    @StateObject private var viewModel: ListViewModel<PayRun>

    init() {
        let service = PayrollService()
        _viewModel = StateObject(wrappedValue: ListViewModel<PayRun> { page, limit, _, _ in
            try await service.listPayRuns(page: page, limit: limit)
        })
    }

    var body: some View {
        if viewModel.items.isEmpty && !viewModel.isLoading {
            EmptyStateView(icon: "dollarsign.circle", title: "No Pay Runs", message: "Process pay runs to generate payroll.")
        } else {
            List {
                ForEach(viewModel.items) { payRun in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(payRun.payRunNumber ?? "Pay Run")
                                .font(.subheadline).fontWeight(.medium)
                            Text("\(payRun.startDate ?? "") - \(payRun.endDate ?? "")")
                                .font(.caption).foregroundColor(.dubblMuted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text((payRun.totalNetPay ?? 0).asCurrency())
                                .font(.subheadline).fontWeight(.semibold)
                            if let status = payRun.status {
                                StatusBadge(status.displayName, color:
                                    status == .completed ? .dubblPrimary : .dubblMuted)
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}

// MARK: - Leave Requests

struct LeaveRequestSection: View {
    @StateObject private var viewModel: ListViewModel<LeaveRequest>

    init() {
        let service = PayrollService()
        _viewModel = StateObject(wrappedValue: ListViewModel<LeaveRequest> { page, _, _, _ in
            try await service.listLeaveRequests(page: page)
        })
    }

    var body: some View {
        if viewModel.items.isEmpty && !viewModel.isLoading {
            EmptyStateView(icon: "calendar.badge.clock", title: "No Leave Requests", message: "Leave requests will appear here.")
        } else {
            List {
                ForEach(viewModel.items) { leave in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(leave.leaveType?.capitalized ?? "Leave")
                                .font(.subheadline).fontWeight(.medium)
                            Text("\(leave.startDate ?? "") - \(leave.endDate ?? "")")
                                .font(.caption).foregroundColor(.dubblMuted)
                        }
                        Spacer()
                        StatusBadge(leave.status?.capitalized ?? "Pending",
                                   color: leave.status == "approved" ? .dubblPrimary : .dubblMuted)
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}
