import SwiftUI

/// Tax (returns, rates, currencies, periods).
@MainActor
enum TaxCatalog {
    static let specs: [RecordSpec] = [taxRates, taxPeriods]

    static let screens: [RecordScreen] = [
        RecordScreen(key: "tax-vat-return", webPath: "/tax/vat-return", title: "VAT return") { AnyView(TaxReturnView(kind: .vat)) },
        RecordScreen(key: "tax-bas", webPath: "/tax/bas", title: "BAS") { AnyView(TaxReturnView(kind: .bas)) },
        RecordScreen(key: "tax-sales-tax", webPath: "/tax/sales-tax", title: "Sales tax") { AnyView(TaxReturnView(kind: .salesTax)) },
        RecordScreen(key: "tax-schedule-c", webPath: "/tax/schedule-c", title: "Schedule C") { AnyView(TaxReturnView(kind: .scheduleC)) },
        RecordScreen(key: "tax-rates-list", webPath: "/tax", title: "Tax rates") { AnyView(TaxRatesView()) },
        RecordScreen(key: "tax-currencies", webPath: "/tax/currencies", title: "Currencies") { AnyView(TaxCurrenciesView()) },
    ]

    /// `GET tax-rates` -> `{ taxRates }` (not paged, rate in basis points);
    /// `GET/PATCH/DELETE tax-rates/{id}` -> `{ taxRate }` with components.
    /// The list is TaxRatesView; this spec carries the detail route.
    static let taxRates = RecordSpec(
        key: "tax-rates",
        webPath: "/tax",
        title: "Tax rates",
        singular: "Tax rate",
        symbol: "percent",
        endpoint: "tax-rates",
        listKey: "taxRates",
        paged: false,
        detailKey: "taxRate",
        searchParam: nil,
        row: RecordRow(title: ["name"], subtitle: ["type", "kind"], currency: nil, status: nil),
        create: { done in AnyView(TaxRateSheet(rate: nil, onSave: done)) },
        detail: { id in AnyView(TaxRateDetailView(id: id)) },
        emptyMessage: "Add the rates you charge and pay."
    )

    /// `GET tax-periods` -> `{ taxPeriods }` with frozen return lines (not paged);
    /// `POST tax-periods` creates; `POST tax-periods/{id}/file` locks one.
    static let taxPeriods = RecordSpec(
        key: "tax-periods",
        webPath: "/tax/periods",
        title: "Tax periods",
        singular: "Tax period",
        symbol: "calendar",
        endpoint: "tax-periods",
        listKey: "taxPeriods",
        paged: false,
        detailKey: "taxPeriod",
        searchParam: nil,
        statuses: [RecordStatus("open", "Open"), RecordStatus("filed", "Filed"), RecordStatus("amended", "Amended")],
        row: RecordRow(title: ["name"], subtitle: ["type", "filedReference"], currency: nil, date: "endDate"),
        tones: ["open": .info, "filed": .positive, "amended": .warning],
        create: { done in AnyView(TaxPeriodSheet(onSave: done)) },
        detail: { id in AnyView(TaxPeriodDetailView(id: id)) },
        emptyMessage: "Add a period for each return you file, then mark it filed to lock it.",
        tillyPrompt: "Which tax periods still need filing?"
    )

    #if DEBUG
    nonisolated static let fixtures: [String: String] = [
        "tax-rates": #"{"taxRates":[{"id":"demo-tr-nyc","name":"NYC sales tax","rate":888,"type":"sales","kind":"sales_tax_us","recoverablePercent":10000,"isDefault":true,"isActive":true,"createdAt":"2025-01-04T10:00:00.000Z","components":[{"id":"demo-tc-1","name":"New York State","rate":400},{"id":"demo-tc-2","name":"New York City","rate":450},{"id":"demo-tc-3","name":"MCTD","rate":38}]},{"id":"demo-tr-ny","name":"NY State sales tax","rate":400,"type":"sales","kind":"sales_tax_us","recoverablePercent":10000,"isDefault":false,"isActive":true,"createdAt":"2025-01-04T10:00:00.000Z","components":[]},{"id":"demo-tr-uk","name":"UK VAT (reverse charge)","rate":2000,"type":"purchase","kind":"reverse_charge","recoverablePercent":10000,"isDefault":false,"isActive":true,"createdAt":"2025-03-11T10:00:00.000Z","components":[]},{"id":"demo-tr-meals","name":"Meals (50% recoverable)","rate":888,"type":"purchase","kind":"partial_block","recoverablePercent":5000,"isDefault":false,"isActive":true,"createdAt":"2025-05-20T10:00:00.000Z","components":[]},{"id":"demo-tr-exempt","name":"Exempt","rate":0,"type":"both","kind":"exempt","recoverablePercent":10000,"isDefault":false,"isActive":true,"createdAt":"2025-01-04T10:00:00.000Z","components":[]},{"id":"demo-tr-old","name":"CA sales tax","rate":725,"type":"sales","kind":"sales_tax_us","recoverablePercent":10000,"isDefault":false,"isActive":false,"createdAt":"2024-08-02T10:00:00.000Z","components":[]}]}"#,
        "tax-rates/*": #"{"taxRate":{"id":"demo-tr-nyc","name":"NYC sales tax","rate":888,"type":"sales","kind":"sales_tax_us","recoverablePercent":10000,"isDefault":true,"isActive":true,"createdAt":"2025-01-04T10:00:00.000Z","components":[{"id":"demo-tc-1","name":"New York State","rate":400},{"id":"demo-tc-2","name":"New York City","rate":450},{"id":"demo-tc-3","name":"MCTD","rate":38}]}}"#,
        "POST tax-rates": #"{"taxRate":{"id":"demo-tr-new"}}"#,
        "PATCH tax-rates/*": #"{"taxRate":{"id":"demo-tr-nyc"}}"#,
        "DELETE tax-rates/*": #"{"success":true}"#,

        "tax-periods": #"{"taxPeriods":[{"id":"demo-tp-2026q4","name":"Q4 2026","startDate":"2026-10-01","endDate":"2026-12-31","type":"quarterly","status":"open","filedAt":null,"filedReference":null,"notes":null,"lines":[]},{"id":"demo-tp-2026q3","name":"Q3 2026","startDate":"2026-07-01","endDate":"2026-09-30","type":"quarterly","status":"open","filedAt":null,"filedReference":null,"notes":"Due 31 October.","lines":[]},{"id":"demo-tp-2026q2","name":"Q2 2026","startDate":"2026-04-01","endDate":"2026-06-30","type":"quarterly","status":"filed","filedAt":"2026-07-28T14:12:00.000Z","filedReference":"ST-809-2026Q2-41187","notes":null,"lines":[{"id":"demo-trl-1","boxNumber":"1","label":"VAT due on sales","amount":1864200,"sortOrder":1},{"id":"demo-trl-2","boxNumber":"2","label":"VAT due on EU acquisitions","amount":0,"sortOrder":2},{"id":"demo-trl-3","boxNumber":"3","label":"Total VAT due (Box 1 + 2)","amount":1864200,"sortOrder":3},{"id":"demo-trl-4","boxNumber":"4","label":"VAT reclaimed on purchases","amount":412650,"sortOrder":4},{"id":"demo-trl-5","boxNumber":"5","label":"Net VAT to pay/reclaim (Box 3 - 4)","amount":1451550,"sortOrder":5},{"id":"demo-trl-8","boxNumber":"8","label":"Total supplies to EU ex-VAT","amount":0,"sortOrder":8},{"id":"demo-trl-9","boxNumber":"9","label":"Total acquisitions from EU ex-VAT","amount":0,"sortOrder":9}]},{"id":"demo-tp-2026q1","name":"Q1 2026","startDate":"2026-01-01","endDate":"2026-03-31","type":"quarterly","status":"filed","filedAt":"2026-04-24T09:30:00.000Z","filedReference":"ST-809-2026Q1-38802","notes":null,"lines":[]},{"id":"demo-tp-2025","name":"FY 2025","startDate":"2025-01-01","endDate":"2025-12-31","type":"annual","status":"amended","filedAt":"2026-02-11T09:30:00.000Z","filedReference":"ST-809-2025-A","notes":null,"lines":[]}]}"#,
        "tax-periods/*": #"{"taxPeriod":{"id":"demo-tp-2026q3","name":"Q3 2026","startDate":"2026-07-01","endDate":"2026-09-30","type":"quarterly","status":"open","filedAt":null,"filedReference":null,"notes":"Due 31 October.","lines":[]}}"#,
        "tax-periods/demo-tp-2026q2": #"{"taxPeriod":{"id":"demo-tp-2026q2","name":"Q2 2026","startDate":"2026-04-01","endDate":"2026-06-30","type":"quarterly","status":"filed","filedAt":"2026-07-28T14:12:00.000Z","filedReference":"ST-809-2026Q2-41187","notes":null,"lines":[{"id":"demo-trl-1","boxNumber":"1","label":"VAT due on sales","amount":1864200,"sortOrder":1},{"id":"demo-trl-2","boxNumber":"2","label":"VAT due on EU acquisitions","amount":0,"sortOrder":2},{"id":"demo-trl-3","boxNumber":"3","label":"Total VAT due (Box 1 + 2)","amount":1864200,"sortOrder":3},{"id":"demo-trl-4","boxNumber":"4","label":"VAT reclaimed on purchases","amount":412650,"sortOrder":4},{"id":"demo-trl-5","boxNumber":"5","label":"Net VAT to pay/reclaim (Box 3 - 4)","amount":1451550,"sortOrder":5},{"id":"demo-trl-8","boxNumber":"8","label":"Total supplies to EU ex-VAT","amount":0,"sortOrder":8},{"id":"demo-trl-9","boxNumber":"9","label":"Total acquisitions from EU ex-VAT","amount":0,"sortOrder":9}]}}"#,
        "POST tax-periods": #"{"taxPeriod":{"id":"demo-tp-new"}}"#,
        "POST tax-periods/*/file": #"{"taxPeriod":{"id":"demo-tp-2026q3","status":"filed"},"net":1529810,"filedLines":[]}"#,
        "DELETE tax-periods/*": #"{"success":true}"#,

        "reports/vat-return": #"{"boxes":[{"box":"1","label":"VAT due on sales","amount":1987460},{"box":"2","label":"VAT due on EU acquisitions","amount":0},{"box":"3","label":"Total VAT due (Box 1 + 2)","amount":1987460},{"box":"4","label":"VAT reclaimed on purchases","amount":457650},{"box":"5","label":"Net VAT to pay/reclaim (Box 3 - 4)","amount":1529810},{"box":"6","label":"Total sales ex-VAT","amount":22380000},{"box":"7","label":"Total purchases ex-VAT","amount":5153600},{"box":"8","label":"Total supplies to EU ex-VAT","amount":1240000},{"box":"9","label":"Total acquisitions from EU ex-VAT","amount":0}],"period":{"startDate":"2026-07-01","endDate":"2026-09-30"},"basis":"accrual","vatScheme":"accrual","flatRate":{"applied":false}}"#,
        "reports/vat-return/transactions": #"{"box":"1","period":{"startDate":"2026-07-01","endDate":"2026-09-30"},"basis":"accrual","total":1987460,"count":6,"transactions":[{"journalLineId":"demo-jl-1","journalEntryId":"demo-je-1","entryNumber":"JE-0418","date":"2026-09-28","description":"INV-0044 · Wayne Enterprises","reference":"INV-0044","sourceType":"invoice","accountCode":"2200","accountName":"Sales tax payable","amount":532800},{"journalLineId":"demo-jl-2","journalEntryId":"demo-je-2","entryNumber":"JE-0411","date":"2026-09-19","description":"INV-0043 · Acme Corp","reference":"INV-0043","sourceType":"invoice","accountCode":"2200","accountName":"Sales tax payable","amount":426240},{"journalLineId":"demo-jl-3","journalEntryId":"demo-je-3","entryNumber":"JE-0398","date":"2026-09-02","description":"INV-0041 · Stark Industries","reference":"INV-0041","sourceType":"invoice","accountCode":"2200","accountName":"Sales tax payable","amount":355200},{"journalLineId":"demo-jl-4","journalEntryId":"demo-je-4","entryNumber":"JE-0376","date":"2026-08-14","description":"INV-0039 · Globex","reference":"INV-0039","sourceType":"invoice","accountCode":"2200","accountName":"Sales tax payable","amount":284160},{"journalLineId":"demo-jl-5","journalEntryId":"demo-je-5","entryNumber":"JE-0352","date":"2026-07-30","description":"INV-0037 · Hooli","reference":"INV-0037","sourceType":"invoice","accountCode":"2200","accountName":"Sales tax payable","amount":266400},{"journalLineId":"demo-jl-6","journalEntryId":"demo-je-6","entryNumber":"JE-0331","date":"2026-07-09","description":"INV-0035 · Initech","reference":"INV-0035","sourceType":"invoice","accountCode":"2200","accountName":"Sales tax payable","amount":122660}]}"#,
        "reports/bas": #"{"fields":[{"field":"G1","label":"Total sales (including GST)","amount":24367460},{"field":"G2","label":"Export sales","amount":1240000},{"field":"G3","label":"Other GST-free sales","amount":0},{"field":"G10","label":"Capital purchases","amount":0},{"field":"G11","label":"Non-capital purchases","amount":5611250},{"field":"1A","label":"GST on sales","amount":1987460},{"field":"1B","label":"GST on purchases","amount":457650},{"field":"NET","label":"Net GST (1A - 1B)","amount":1529810}],"period":{"startDate":"2026-07-01","endDate":"2026-09-30"},"basis":"accrual","vatScheme":"accrual"}"#,
        "reports/sales-tax": #"{"breakdown":[{"taxRateName":"NYC sales tax","taxRatePercent":888,"taxableAmount":18940000,"taxCollected":1681870,"invoiceCount":14},{"taxRateName":"NY State sales tax","taxRatePercent":400,"taxableAmount":3440000,"taxCollected":137600,"invoiceCount":3}],"exemptAmount":1240000,"period":{"startDate":"2026-07-01","endDate":"2026-09-30"}}"#,
        "reports/schedule-c": #"{"lines":[{"line":"1","label":"Gross receipts or sales","amount":22380000},{"line":"2","label":"Returns and allowances","amount":-120000},{"line":"8","label":"Advertising","amount":184000},{"line":"10","label":"Commissions and fees","amount":96500},{"line":"13","label":"Depreciation","amount":142000},{"line":"15","label":"Insurance (other than health)","amount":61800},{"line":"17","label":"Legal and professional services","amount":325000},{"line":"18","label":"Office expense","amount":118600},{"line":"20b","label":"Rent/lease - other business property","amount":1350000},{"line":"22","label":"Supplies","amount":84200},{"line":"24a","label":"Travel","amount":231400},{"line":"24b","label":"Deductible meals","amount":42300},{"line":"25","label":"Utilities","amount":96800},{"line":"26","label":"Wages","amount":8640000},{"line":"27","label":"Other expenses","amount":412600}],"totalIncome":22260000,"totalExpenses":11785200,"netProfit":10474800,"period":{"startDate":"2026-07-01","endDate":"2026-09-30"}}"#,

        "exchange-rates": #"{"data":[{"id":"demo-fx-1","baseCurrency":"USD","targetCurrency":"EUR","rate":921450,"date":"2026-10-12","source":"api"},{"id":"demo-fx-2","baseCurrency":"USD","targetCurrency":"GBP","rate":786120,"date":"2026-10-12","source":"api"},{"id":"demo-fx-3","baseCurrency":"USD","targetCurrency":"CAD","rate":1371800,"date":"2026-10-12","source":"api"},{"id":"demo-fx-4","baseCurrency":"USD","targetCurrency":"JPY","rate":148920000,"date":"2026-10-11","source":"manual"},{"id":"demo-fx-5","baseCurrency":"USD","targetCurrency":"EUR","rate":919870,"date":"2026-10-11","source":"api"},{"id":"demo-fx-6","baseCurrency":"USD","targetCurrency":"GBP","rate":787400,"date":"2026-10-11","source":"api"},{"id":"demo-fx-7","baseCurrency":"USD","targetCurrency":"EUR","rate":918200,"date":"2026-10-10","source":"api"},{"id":"demo-fx-8","baseCurrency":"USD","targetCurrency":"GBP","rate":785950,"date":"2026-10-10","source":"api"}],"pagination":{"page":1,"limit":100,"total":8,"totalPages":1}}"#,
        "reports/unrealized-gains-losses": #"{"defaultCurrency":"USD","items":[{"type":"invoice","id":"demo-inv-uk1","number":"INV-0042","currencyCode":"GBP","amountDue":960000,"unrealizedGainLoss":18420},{"type":"invoice","id":"demo-inv-eu1","number":"INV-0040","currencyCode":"EUR","amountDue":1240000,"unrealizedGainLoss":-9310},{"type":"bill","id":"demo-bill-uk2","number":"BILL-0118","currencyCode":"GBP","amountDue":185000,"unrealizedGainLoss":-3570}],"summary":{"totalItems":3,"totalUnrealizedGain":18420,"totalUnrealizedLoss":-12880,"netUnrealizedGainLoss":5540}}"#,
        "POST exchange-rates": #"{"exchangeRates":[{"id":"demo-fx-new"}]}"#,
        "DELETE exchange-rates/*": #"{"success":true}"#,
    ]
    #endif
}
