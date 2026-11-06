import SwiftUI

/// Payroll (overview, people, pay runs, compliance, setup).
@MainActor
enum PayrollCatalog {
    static let specs: [RecordSpec] = [employees, contractors, runs, reviews, timesheets, leave, taxForms]

    static let screens: [RecordScreen] = [
        RecordScreen(key: "payroll-overview", webPath: "/payroll", title: "Payroll") { AnyView(PayrollOverviewView()) },
        RecordScreen(key: "payroll-runs-list", webPath: "/payroll/runs", title: "Pay runs") { AnyView(PayrollRunsView()) },
        RecordScreen(key: "payroll-compensation", webPath: "/payroll/compensation", title: "Compensation") { AnyView(PayrollCompensationView()) },
        RecordScreen(key: "payroll-time-leave", webPath: "/payroll/time-leave", title: "Time and leave") { AnyView(PayrollTimeLeaveView()) },
        RecordScreen(key: "payroll-tax-liabilities", webPath: "/payroll/tax-liabilities", title: "Tax liabilities") { AnyView(PayrollTaxLiabilitiesView()) },
        RecordScreen(key: "payroll-tax-forms-list", webPath: "/payroll/tax-forms", title: "Tax forms") { AnyView(PayrollTaxFormsView()) },
        RecordScreen(key: "payroll-analytics", webPath: "/payroll/analytics", title: "Reports and forecast") { AnyView(PayrollAnalyticsView()) },
        RecordScreen(key: "payroll-self-service", webPath: "/payroll/self-service", title: "Self-service") { AnyView(PayrollSelfServiceView()) },
        RecordScreen(key: "payroll-settings", webPath: "/payroll/settings", title: "Payroll settings") { AnyView(PayrollSettingsView()) },
    ]

    /// `GET payroll/employees` (paginated, `active=true|false`), salary annual in cents;
    /// `GET payroll/employees/{id}` -> `{ employee }`.
    static let employees = RecordSpec(
        key: "payroll-employees",
        webPath: "/payroll/employees",
        title: "Employees",
        singular: "Employee",
        symbol: "person.2",
        endpoint: "payroll/employees",
        detailKey: "employee",
        searchParam: nil,
        statuses: [RecordStatus("true", "Active"), RecordStatus("false", "Inactive")],
        statusParam: "active",
        row: RecordRow(title: ["name"], subtitle: ["position", "department"], number: "employeeNumber", amount: "salary", currency: "currency", status: nil, avatar: true),
        totals: [RecordTotal(label: "Annual salaries", field: "salary", tone: .positive)],
        create: { done in AnyView(PayrollEmployeeSheet(onSave: done)) },
        detail: { id in AnyView(PayrollEmployeeView(id: id)) },
        emptyMessage: "Add the people you pay through payroll.",
        tillyPrompt: "What does each person cost me a month, all in?"
    )

    /// `GET payroll/contractors` (paginated, `isActive=true|false`);
    /// `GET payroll/contractors/{id}` -> `{ contractor }` with payments.
    static let contractors = RecordSpec(
        key: "payroll-contractors",
        webPath: "/payroll/contractors",
        title: "Contractors",
        singular: "Contractor",
        symbol: "person.crop.square",
        endpoint: "payroll/contractors",
        detailKey: "contractor",
        searchParam: nil,
        statuses: [RecordStatus("true", "Active"), RecordStatus("false", "Inactive")],
        statusParam: "isActive",
        row: RecordRow(title: ["name"], subtitle: ["company", "email"], currency: nil, status: nil, avatar: true),
        create: { done in AnyView(PayrollContractorSheet(onSave: done)) },
        detail: { id in AnyView(PayrollContractorView(id: id)) },
        emptyMessage: "Freelancers you pay outside payroll, ready for 1099s.",
        tillyPrompt: "Which contractors am I paying the most this year?"
    )

    /// `GET payroll/runs` (paginated, `status=`), `GET payroll/runs/{id}` -> `{ run }`
    /// with items. The list is PayrollRunsView; this spec carries the detail route.
    static let runs = RecordSpec(
        key: "payroll-runs",
        webPath: "/payroll/runs",
        title: "Pay runs",
        singular: "Pay run",
        symbol: "play.circle",
        endpoint: "payroll/runs",
        detailKey: "run",
        searchParam: nil,
        statuses: [RecordStatus("draft", "Draft"), RecordStatus("pending_approval", "Awaiting approval"), RecordStatus("completed", "Paid"), RecordStatus("void", "Void")],
        row: RecordRow(title: ["payPeriodEnd"], subtitle: ["runType"], amount: "totalNet", currency: nil, date: "payPeriodStart"),
        tones: PayrollFormat.runTones,
        create: { done in AnyView(PayrollNewRunSheet(onSave: done)) },
        detail: { id in AnyView(PayrollRunView(id: id)) }
    )

    /// `GET payroll/compensation/reviews` -> `{ data }` (not paged),
    /// `GET/PATCH payroll/compensation/reviews/{id}` -> `{ review }` with entries.
    static let reviews = RecordSpec(
        key: "payroll-comp-reviews",
        webPath: "/payroll/compensation",
        title: "Compensation reviews",
        singular: "Review",
        symbol: "dollarsign.circle",
        endpoint: "payroll/compensation/reviews",
        paged: false,
        detailKey: "review",
        searchParam: nil,
        row: RecordRow(title: ["name"], amount: "totalBudget", currency: nil, date: "effectiveDate"),
        create: { done in AnyView(PayrollReviewSheet(onSave: done)) },
        detail: { id in AnyView(PayrollReviewView(id: id)) }
    )

    /// `GET payroll/timesheets` (paginated, `status=`), `GET payroll/timesheets/{id}`
    /// -> `{ timesheet }` with entries; submit/approve/reject are POSTs.
    static let timesheets = RecordSpec(
        key: "payroll-timesheets",
        webPath: "/payroll/timesheets",
        title: "Timesheets",
        singular: "Timesheet",
        symbol: "clock",
        endpoint: "payroll/timesheets",
        detailKey: "timesheet",
        searchParam: nil,
        statuses: [RecordStatus("draft", "Draft"), RecordStatus("submitted", "Submitted"), RecordStatus("approved", "Approved"), RecordStatus("rejected", "Rejected")],
        row: RecordRow(title: ["employee.name"], subtitle: ["totalHours"], currency: nil, date: "periodStart", avatar: true),
        tones: ["submitted": .warning],
        detail: { id in AnyView(PayrollTimesheetView(id: id)) }
    )

    /// `GET payroll/leave/requests` (paginated, `status=`), `GET payroll/leave/requests/{id}`
    /// -> `{ request }`; approve/reject are POSTs on pending requests.
    static let leave = RecordSpec(
        key: "payroll-leave",
        webPath: "/payroll/leave",
        title: "Leave requests",
        singular: "Leave request",
        symbol: "airplane",
        endpoint: "payroll/leave/requests",
        detailKey: "request",
        searchParam: nil,
        statuses: [RecordStatus("pending", "Pending"), RecordStatus("approved", "Approved"), RecordStatus("rejected", "Rejected"), RecordStatus("cancelled", "Cancelled")],
        row: RecordRow(title: ["employee.name"], subtitle: ["policy.name"], currency: nil, date: "startDate", avatar: true),
        tones: ["pending": .warning],
        hiddenFields: ["approvedBy"],
        actions: [
            RecordAction(title: "Decline", symbol: "xmark", path: "reject", statuses: ["pending"], destructive: true, confirm: "Decline this time off?", primary: true),
            RecordAction(title: "Approve", symbol: "checkmark", path: "approve", statuses: ["pending"], primary: true),
        ],
        tillyPrompt: "Who's off in the next month?"
    )

    /// `GET payroll/tax-forms/{id}` returns the form itself (not wrapped).
    static let taxForms = RecordSpec(
        key: "payroll-tax-forms",
        webPath: "/payroll/tax-forms",
        title: "Tax forms",
        singular: "Tax form",
        symbol: "doc.text",
        endpoint: "payroll/tax-forms",
        searchParam: nil,
        row: RecordRow(title: ["formType", "taxYear"], currency: nil),
        detail: { id in AnyView(PayrollTaxFormView(id: id)) }
    )

    #if DEBUG
    nonisolated static let fixtures: [String: String] = PayrollFixtures.all
    #endif
}
