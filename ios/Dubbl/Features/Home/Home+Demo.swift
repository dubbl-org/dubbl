#if DEBUG
extension DemoData {
    static let homeFixtures: [String: String] = [
        "bank-accounts": #"""
        {"bankAccounts":[
          {"id":"demo-bank-1","organizationId":"demo-org","accountName":"Operating checking","accountNumber":"000123454821","bankName":"Chase","currencyCode":"USD","countryCode":"US","accountType":"checking","color":"#0f766e","chartAccountId":"demo-coa-1000","balance":4821034,"lowBalanceThreshold":2500000,"isActive":true,"createdAt":"2025-03-02T10:14:00.000Z","deletedAt":null,"chartAccount":{"id":"demo-coa-1000","code":"1000","name":"Operating checking","type":"asset"}},
          {"id":"demo-bank-2","organizationId":"demo-org","accountName":"Savings","accountNumber":"000987651190","bankName":"Chase","currencyCode":"USD","countryCode":"US","accountType":"savings","color":"#4f46e5","chartAccountId":"demo-coa-1010","balance":6250000,"lowBalanceThreshold":null,"isActive":true,"createdAt":"2025-03-02T10:16:00.000Z","deletedAt":null,"chartAccount":{"id":"demo-coa-1010","code":"1010","name":"Savings","type":"asset"}},
          {"id":"demo-bank-3","organizationId":"demo-org","accountName":"Company card","accountNumber":"371449635398431","bankName":"American Express","currencyCode":"USD","countryCode":"US","accountType":"credit_card","color":"#b45309","chartAccountId":"demo-coa-2100","balance":-312455,"lowBalanceThreshold":null,"isActive":true,"createdAt":"2025-04-11T08:40:00.000Z","deletedAt":null,"chartAccount":{"id":"demo-coa-2100","code":"2100","name":"Company card","type":"liability"}}
        ]}
        """#,

        "bank-accounts/*": #"""
        {"bankAccount":{"id":"demo-bank-1","organizationId":"demo-org","accountName":"Operating checking","accountNumber":"000123454821","bankName":"Chase","currencyCode":"USD","countryCode":"US","accountType":"checking","color":"#0f766e","chartAccountId":"demo-coa-1000","balance":4821034,"lowBalanceThreshold":2500000,"isActive":true,"createdAt":"2025-03-02T10:14:00.000Z","deletedAt":null,"chartAccount":{"id":"demo-coa-1000","code":"1000","name":"Operating checking","type":"asset"}}}
        """#,

        "bank-accounts/*/transactions": #"""
        {"data":[
          {"id":"demo-btx-01","bankAccountId":"demo-bank-1","date":"2026-10-12","description":"STRIPE TRANSFER ST-4Q8K2","reference":"ST-4Q8K2","amount":412850,"balance":4821034,"status":"unreconciled","payee":"Stripe payout","pending":true,"accountId":null,"accountCode":null,"accountName":null,"attachmentCount":0},
          {"id":"demo-btx-02","bankAccountId":"demo-bank-1","date":"2026-10-11","description":"FIGMA INC SAN FRANCISCO","reference":null,"amount":-7500,"balance":4408184,"status":"unreconciled","payee":"Figma","pending":false,"accountId":"demo-coa-6420","accountCode":"6420","accountName":"Software subscriptions","attachmentCount":1},
          {"id":"demo-btx-03","bankAccountId":"demo-bank-1","date":"2026-10-10","description":"ACH CREDIT ACME CORP INV-0041","reference":"INV-0041","amount":640000,"balance":4415684,"status":"reconciled","payee":"Acme Corp","pending":false,"accountId":"demo-coa-1200","accountCode":"1200","accountName":"Accounts receivable","attachmentCount":0},
          {"id":"demo-btx-04","bankAccountId":"demo-bank-1","date":"2026-10-09","description":"WEWORK MEMBERSHIP OCT","reference":null,"amount":-185000,"balance":3775684,"status":"reconciled","payee":"WeWork","pending":false,"accountId":"demo-coa-6100","accountCode":"6100","accountName":"Rent","attachmentCount":1},
          {"id":"demo-btx-05","bankAccountId":"demo-bank-1","date":"2026-10-08","description":"ADOBE *CREATIVE CLD","reference":null,"amount":-8999,"balance":3960684,"status":"unreconciled","payee":"Adobe Creative Cloud","pending":false,"accountId":null,"accountCode":null,"accountName":null,"attachmentCount":0},
          {"id":"demo-btx-06","bankAccountId":"demo-bank-1","date":"2026-10-07","description":"WIRE IN GLOBEX CORPORATION","reference":"INV-0036","amount":215000,"balance":3969683,"status":"reconciled","payee":"Globex","pending":false,"accountId":"demo-coa-1200","accountCode":"1200","accountName":"Accounts receivable","attachmentCount":0},
          {"id":"demo-btx-07","bankAccountId":"demo-bank-1","date":"2026-10-06","description":"GUSTO PAYROLL 100626","reference":null,"amount":-1420000,"balance":3754683,"status":"reconciled","payee":"Gusto payroll","pending":false,"accountId":"demo-coa-6000","accountCode":"6000","accountName":"Wages and salaries","attachmentCount":0},
          {"id":"demo-btx-08","bankAccountId":"demo-bank-1","date":"2026-10-06","description":"DELTA AIR 0067412","reference":null,"amount":-48620,"balance":5174683,"status":"unreconciled","payee":"Delta Air Lines","pending":false,"accountId":null,"accountCode":null,"accountName":null,"attachmentCount":0},
          {"id":"demo-btx-09","bankAccountId":"demo-bank-1","date":"2026-10-05","description":"BLUE BOTTLE COFFEE","reference":null,"amount":-2340,"balance":5223303,"status":"unreconciled","payee":"Blue Bottle Coffee","pending":false,"accountId":"demo-coa-6510","accountCode":"6510","accountName":"Meals and entertainment","attachmentCount":0},
          {"id":"demo-btx-10","bankAccountId":"demo-bank-1","date":"2026-10-02","description":"ACH CREDIT INITECH LLC","reference":"INV-0039","amount":380000,"balance":5225643,"status":"reconciled","payee":"Initech","pending":false,"accountId":"demo-coa-1200","accountCode":"1200","accountName":"Accounts receivable","attachmentCount":0},
          {"id":"demo-btx-11","bankAccountId":"demo-bank-1","date":"2026-10-01","description":"AWS EMEA","reference":null,"amount":-21388,"balance":4845643,"status":"reconciled","payee":"Amazon Web Services","pending":false,"accountId":"demo-coa-6430","accountCode":"6430","accountName":"Hosting","attachmentCount":0},
          {"id":"demo-btx-12","bankAccountId":"demo-bank-1","date":"2026-09-30","description":"INTEREST PAYMENT","reference":null,"amount":1204,"balance":4867031,"status":"reconciled","payee":"Interest","pending":false,"accountId":"demo-coa-4900","accountCode":"4900","accountName":"Interest income","attachmentCount":0},
          {"id":"demo-btx-13","bankAccountId":"demo-bank-1","date":"2026-09-29","description":"ACH CREDIT HOOLI INC","reference":"INV-0035","amount":275000,"balance":4865827,"status":"reconciled","payee":"Hooli","pending":false,"accountId":"demo-coa-1200","accountCode":"1200","accountName":"Accounts receivable","attachmentCount":0},
          {"id":"demo-btx-14","bankAccountId":"demo-bank-1","date":"2026-09-28","description":"GOOGLE *WORKSPACE","reference":null,"amount":-8400,"balance":4590827,"status":"reconciled","payee":"Google Workspace","pending":false,"accountId":"demo-coa-6420","accountCode":"6420","accountName":"Software subscriptions","attachmentCount":0},
          {"id":"demo-btx-15","bankAccountId":"demo-bank-1","date":"2026-09-26","description":"WIRE IN UMBRELLA HEALTH","reference":"INV-0033","amount":560000,"balance":4599227,"status":"reconciled","payee":"Umbrella Health","pending":false,"accountId":"demo-coa-1200","accountCode":"1200","accountName":"Accounts receivable","attachmentCount":0}
        ],"pagination":{"page":1,"limit":30,"total":15,"totalPages":1}}
        """#,

        "reports/aged-receivables": #"""
        {"asAt":"2026-10-12","buckets":[
          {"label":"Current","total":1842000,"count":5,"invoices":[
            {"id":"demo-inv-42","invoiceNumber":"INV-0042","contactName":"Stark Industries","dueDate":"2026-11-02","amountDue":720000,"daysOverdue":0},
            {"id":"demo-inv-43","invoiceNumber":"INV-0043","contactName":"Wayne Enterprises","dueDate":"2026-11-05","amountDue":480000,"daysOverdue":0},
            {"id":"demo-inv-40","invoiceNumber":"INV-0040","contactName":"Hooli","dueDate":"2026-10-20","amountDue":312000,"daysOverdue":0},
            {"id":"demo-inv-44","invoiceNumber":"INV-0044","contactName":"Acme Corp","dueDate":"2026-11-09","amountDue":210000,"daysOverdue":0},
            {"id":"demo-inv-45","invoiceNumber":"INV-0045","contactName":"Umbrella Health","dueDate":"2026-10-28","amountDue":120000,"daysOverdue":0}]},
          {"label":"1-30 days","total":640000,"count":2,"invoices":[
            {"id":"demo-inv-38","invoiceNumber":"INV-0038","contactName":"Initech","dueDate":"2026-09-28","amountDue":215000,"daysOverdue":14},
            {"id":"demo-inv-37","invoiceNumber":"INV-0037","contactName":"Globex","dueDate":"2026-09-20","amountDue":425000,"daysOverdue":22}]},
          {"label":"31-60 days","total":215000,"count":1,"invoices":[
            {"id":"demo-inv-31","invoiceNumber":"INV-0031","contactName":"Umbrella Health","dueDate":"2026-08-30","amountDue":215000,"daysOverdue":43}]},
          {"label":"61-90 days","total":0,"count":0,"invoices":[]},
          {"label":"90+ days","total":0,"count":0,"invoices":[]}
        ],"grandTotal":2697000}
        """#,

        "reports/aged-payables": #"""
        {"asAt":"2026-10-12","buckets":[
          {"label":"Current","total":486000,"count":4,"bills":[
            {"id":"demo-bill-114","billNumber":"BILL-0114","contactName":"WeWork","dueDate":"2026-11-01","amountDue":185000,"daysOverdue":0},
            {"id":"demo-bill-115","billNumber":"BILL-0115","contactName":"Gusto","dueDate":"2026-10-20","amountDue":142000,"daysOverdue":0},
            {"id":"demo-bill-113","billNumber":"BILL-0113","contactName":"Amazon Web Services","dueDate":"2026-10-25","amountDue":89000,"daysOverdue":0},
            {"id":"demo-bill-116","billNumber":"BILL-0116","contactName":"Adobe","dueDate":"2026-10-30","amountDue":70000,"daysOverdue":0}]},
          {"label":"1-30 days","total":120000,"count":1,"bills":[
            {"id":"demo-bill-112","billNumber":"BILL-0112","contactName":"Umbrella Health","dueDate":"2026-10-03","amountDue":120000,"daysOverdue":9}]},
          {"label":"31-60 days","total":0,"count":0,"bills":[]},
          {"label":"61-90 days","total":0,"count":0,"bills":[]},
          {"label":"90+ days","total":0,"count":0,"bills":[]}
        ],"grandTotal":606000}
        """#,

        "reports/profit-and-loss": #"""
        {"startDate":"2026-01-01","endDate":"2026-10-12","basis":"accrual",
         "revenue":[
          {"accountId":"demo-coa-4000","accountName":"Design services","accountCode":"4000","balance":21460000},
          {"accountId":"demo-coa-4010","accountName":"Retainers","accountCode":"4010","balance":6820000},
          {"accountId":"demo-coa-4900","accountName":"Interest income","accountCode":"4900","balance":362000}],
         "totalRevenue":28642000,
         "expenses":[
          {"accountId":"demo-coa-6000","accountName":"Wages and salaries","accountCode":"6000","balance":14200000},
          {"accountId":"demo-coa-6100","accountName":"Rent","accountCode":"6100","balance":1850000},
          {"accountId":"demo-coa-6420","accountName":"Software subscriptions","accountCode":"6420","balance":1184500},
          {"accountId":"demo-coa-6430","accountName":"Hosting","accountCode":"6430","balance":412000},
          {"accountId":"demo-coa-6500","accountName":"Travel","accountCode":"6500","balance":1386000},
          {"accountId":"demo-coa-6510","accountName":"Meals and entertainment","accountCode":"6510","balance":839000}],
         "totalExpenses":19871500,
         "netIncome":8770500}
        """#,

        "reports/monthly-trends": #"""
        {"months":[
          {"month":"2026-05","revenue":2910000,"expenses":2150000,"netIncome":760000},
          {"month":"2026-06","revenue":3240000,"expenses":2230000,"netIncome":1010000},
          {"month":"2026-07","revenue":2780000,"expenses":2410000,"netIncome":370000},
          {"month":"2026-08","revenue":3560000,"expenses":2280000,"netIncome":1280000},
          {"month":"2026-09","revenue":3390000,"expenses":2360000,"netIncome":1030000},
          {"month":"2026-10","revenue":3120000,"expenses":2040000,"netIncome":1080000}],
         "revenueSparkline":[2910000,3240000,2780000,3560000,3390000,3120000],
         "expenseSparkline":[2150000,2230000,2410000,2280000,2360000,2040000],
         "netIncomeSparkline":[760000,1010000,370000,1280000,1030000,1080000]}
        """#,

        "dashboard/alerts": #"""
        {"overdueInvoices":{"count":3,"total":855000},
         "overdueBills":{"count":1,"total":120000},
         "uncategorizedTransactions":7,
         "accountsNeedingReconciliation":[{"bankAccountId":"demo-bank-3","bankAccountName":"Company card","lastReconDate":"2026-08-31"}],
         "activeReminderRules":2}
        """#,

        "reports/cash-flow-forecast": #"""
        {"forecastPeriod":{"start":"2026-10-12","end":"2026-11-09","weeks":4},
         "totalInflows":1842000,"totalOutflows":1126000,"netForecast":716000,
         "weeks":[
          {"weekOf":"2026-10-11","inflows":0,"outflows":0,"net":0,"entryCount":0,"cumulativeNet":0},
          {"weekOf":"2026-10-18","inflows":312000,"outflows":142000,"net":170000,"entryCount":2,"cumulativeNet":170000},
          {"weekOf":"2026-10-25","inflows":330000,"outflows":799000,"net":-469000,"entryCount":5,"cumulativeNet":-299000},
          {"weekOf":"2026-11-01","inflows":1200000,"outflows":185000,"net":1015000,"entryCount":3,"cumulativeNet":716000}],
         "entries":[
          {"date":"2026-10-20","type":"receivable","description":"Hooli - INV-0040","amount":312000},
          {"date":"2026-10-20","type":"payable","description":"Gusto - BILL-0115","amount":-142000},
          {"date":"2026-10-25","type":"payable","description":"Amazon Web Services - BILL-0113","amount":-89000},
          {"date":"2026-10-28","type":"receivable","description":"Umbrella Health - INV-0045","amount":120000},
          {"date":"2026-10-30","type":"payable","description":"Adobe - BILL-0116","amount":-70000},
          {"date":"2026-10-31","type":"recurring_bill","description":"Payroll - Gusto","amount":-640000},
          {"date":"2026-10-31","type":"recurring_invoice","description":"Monthly retainer - Acme Corp","amount":210000},
          {"date":"2026-11-01","type":"payable","description":"WeWork - BILL-0114","amount":-185000},
          {"date":"2026-11-02","type":"receivable","description":"Stark Industries - INV-0042","amount":720000},
          {"date":"2026-11-05","type":"receivable","description":"Wayne Enterprises - INV-0043","amount":480000}]}
        """#,
    ]
}
#endif
