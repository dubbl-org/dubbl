#if DEBUG
import SwiftUI
import UIKit

extension DemoData {
    /// Bills from Northwind's suppliers and the team's expense claims.
    static let purchasesFixtures: [String: String] = [
        "bills": #"{"data":[{"id":"demo-bill-151","contactId":"demo-contact-wework","billNumber":"BILL-0151","issueDate":"2026-10-01","dueDate":"2026-10-18","status":"partial","reference":"INV-US-88213","notes":null,"subtotal":440000,"taxTotal":45000,"total":485000,"amountPaid":200000,"amountDue":285000,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-01T09:12:00.000Z","contact":{"id":"demo-contact-wework","name":"WeWork","email":"billing@wework.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-150","contactId":"demo-contact-aws","billNumber":"BILL-0150","issueDate":"2026-10-03","dueDate":"2026-10-28","status":"pending_approval","reference":"EUINUS26-4471","notes":null,"subtotal":118920,"taxTotal":9517,"total":128437,"amountPaid":0,"amountDue":128437,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-03T09:12:00.000Z","contact":{"id":"demo-contact-aws","name":"Amazon Web Services","email":"aws-receivables@amazon.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-149","contactId":"demo-contact-figma","billNumber":"BILL-0149","issueDate":"2026-10-04","dueDate":"2026-11-03","status":"draft","reference":"FIG-2026-10","notes":null,"subtotal":90000,"taxTotal":0,"total":90000,"amountPaid":0,"amountDue":90000,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-04T09:12:00.000Z","contact":{"id":"demo-contact-figma","name":"Figma","email":"billing@figma.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-148","contactId":"demo-contact-delta","billNumber":"BILL-0148","issueDate":"2026-09-05","dueDate":"2026-10-05","status":"overdue","reference":"TKT 006 2318841","notes":null,"subtotal":104300,"taxTotal":8340,"total":112640,"amountPaid":0,"amountDue":112640,"currencyCode":"USD","paidAt":null,"createdAt":"2026-09-05T09:12:00.000Z","contact":{"id":"demo-contact-delta","name":"Delta Air Lines","email":"corporate@delta.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-147","contactId":"demo-contact-staples","billNumber":"BILL-0147","issueDate":"2026-09-30","dueDate":"2026-10-20","status":"received","reference":"SO-77120","notes":null,"subtotal":31680,"taxTotal":2538,"total":34218,"amountPaid":0,"amountDue":34218,"currencyCode":"USD","paidAt":null,"createdAt":"2026-09-30T09:12:00.000Z","contact":{"id":"demo-contact-staples","name":"Staples","email":"business@staples.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-146","contactId":"demo-contact-adobe","billNumber":"BILL-0146","issueDate":"2026-09-22","dueDate":"2026-10-02","status":"paid","reference":null,"notes":null,"subtotal":61100,"taxTotal":4888,"total":65988,"amountPaid":65988,"amountDue":0,"currencyCode":"USD","paidAt":"2026-10-02T14:03:00.000Z","createdAt":"2026-09-22T09:12:00.000Z","contact":{"id":"demo-contact-adobe","name":"Adobe","email":"billing@adobe.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-145","contactId":"demo-contact-comcast","billNumber":"BILL-0145","issueDate":"2026-09-01","dueDate":"2026-09-30","status":"overdue","reference":null,"notes":null,"subtotal":17590,"taxTotal":1409,"total":18999,"amountPaid":0,"amountDue":18999,"currencyCode":"USD","paidAt":null,"createdAt":"2026-09-01T09:12:00.000Z","contact":{"id":"demo-contact-comcast","name":"Comcast Business","email":"billing@comcastbusiness.net","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-144","contactId":"demo-contact-google","billNumber":"BILL-0144","issueDate":"2026-09-01","dueDate":"2026-09-15","status":"paid","reference":null,"notes":null,"subtotal":26667,"taxTotal":2133,"total":28800,"amountPaid":28800,"amountDue":0,"currencyCode":"USD","paidAt":"2026-09-14T10:20:00.000Z","createdAt":"2026-09-01T09:12:00.000Z","contact":{"id":"demo-contact-google","name":"Google Workspace","email":"payments-noreply@google.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-143","contactId":"demo-contact-gusto","billNumber":"BILL-0143","issueDate":"2026-08-28","dueDate":"2026-09-27","status":"void","reference":null,"notes":null,"subtotal":12000,"taxTotal":0,"total":12000,"amountPaid":0,"amountDue":0,"currencyCode":"USD","paidAt":null,"createdAt":"2026-08-28T09:12:00.000Z","contact":{"id":"demo-contact-gusto","name":"Gusto","email":"billing@gusto.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}},{"id":"demo-bill-142","contactId":"demo-contact-bluebottle","billNumber":"BILL-0142","issueDate":"2026-08-20","dueDate":"2026-09-19","status":"paid","reference":null,"notes":null,"subtotal":19861,"taxTotal":1589,"total":21450,"amountPaid":21450,"amountDue":0,"currencyCode":"USD","paidAt":"2026-09-18T16:45:00.000Z","createdAt":"2026-08-20T09:12:00.000Z","contact":{"id":"demo-contact-bluebottle","name":"Blue Bottle Coffee","email":"wholesale@bluebottlecoffee.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"}}],"pagination":{"page":1,"limit":30,"total":10,"totalPages":1}}"#,
        "bills/counts": #"{"counts":{"partial":{"count":1,"amount":285000},"pending_approval":{"count":1,"amount":128437},"draft":{"count":1,"amount":90000},"overdue":{"count":2,"amount":131639},"received":{"count":1,"amount":34218},"paid":{"count":3,"amount":0},"void":{"count":1,"amount":0}},"total":10}"#,
        "bills/*": #"{"bill":{"id":"demo-bill-151","contactId":"demo-contact-wework","billNumber":"BILL-0151","issueDate":"2026-10-01","dueDate":"2026-10-18","status":"partial","reference":"INV-US-88213","notes":"Prorated mail handling from 1 Oct. Remaining balance on the usual card.","subtotal":440000,"taxTotal":45000,"total":485000,"amountPaid":200000,"amountDue":285000,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-01T09:12:00.000Z","contact":{"id":"demo-contact-wework","name":"WeWork","email":"billing@wework.com","type":"supplier","paymentTermsDays":30,"currencyCode":"USD"},"lines":[{"id":"demo-line-1","description":"Dedicated desks, October (4 seats)","quantity":400,"unitPrice":95000,"discountPercent":0,"taxAmount":38000,"amount":380000,"sortOrder":0,"account":{"id":"demo-acc-rent","code":"6200","name":"Rent"},"taxRate":{"id":"demo-tax-10","name":"Sales tax 10%","rate":1000}},{"id":"demo-line-2","description":"Meeting room credits","quantity":1000,"unitPrice":4500,"discountPercent":0,"taxAmount":4500,"amount":45000,"sortOrder":1,"account":{"id":"demo-acc-office","code":"6210","name":"Office services"},"taxRate":{"id":"demo-tax-10","name":"Sales tax 10%","rate":1000}},{"id":"demo-line-3","description":"Mail and package handling","quantity":100,"unitPrice":15000,"discountPercent":0,"taxAmount":2500,"amount":15000,"sortOrder":2,"account":{"id":"demo-acc-office","code":"6210","name":"Office services"},"taxRate":null}]}}"#,
        "POST bills/*/pay": #"{"bill":{"id":"demo-bill-151","contactId":"demo-contact-wework","billNumber":"BILL-0151","issueDate":"2026-10-01","dueDate":"2026-10-18","status":"paid","reference":"INV-US-88213","notes":null,"subtotal":440000,"taxTotal":45000,"total":485000,"amountPaid":485000,"amountDue":0,"currencyCode":"USD","paidAt":"2026-10-12T09:30:00.000Z","createdAt":"2026-10-01T09:12:00.000Z"},"payment":{"id":"demo-pay-1","paymentNumber":"PAY-0088","date":"2026-10-12","amount":285000,"method":"bank_transfer"}}"#,
        "POST bills/*/receive": #"{"bill":{"id":"demo-bill-149","contactId":"demo-contact-figma","billNumber":"BILL-0149","issueDate":"2026-10-04","dueDate":"2026-11-03","status":"received","reference":"FIG-2026-10","notes":null,"subtotal":90000,"taxTotal":0,"total":90000,"amountPaid":0,"amountDue":90000,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-04T09:12:00.000Z"},"warnings":[]}"#,
        "POST bills/*/approve": #"{"bill":{"id":"demo-bill-150","contactId":"demo-contact-aws","billNumber":"BILL-0150","issueDate":"2026-10-03","dueDate":"2026-10-28","status":"received","reference":"EUINUS26-4471","notes":null,"subtotal":118920,"taxTotal":9517,"total":128437,"amountPaid":0,"amountDue":128437,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-03T09:12:00.000Z"},"warnings":[]}"#,
        "POST bills/*/reject": #"{"bill":{"id":"demo-bill-150","contactId":"demo-contact-aws","billNumber":"BILL-0150","issueDate":"2026-10-03","dueDate":"2026-10-28","status":"draft","reference":"EUINUS26-4471","notes":null,"subtotal":118920,"taxTotal":9517,"total":128437,"amountPaid":0,"amountDue":128437,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-03T09:12:00.000Z"}}"#,
        "POST bills/*/void": #"{"bill":{"id":"demo-bill-151","contactId":"demo-contact-wework","billNumber":"BILL-0151","issueDate":"2026-10-01","dueDate":"2026-10-18","status":"void","reference":"INV-US-88213","notes":null,"subtotal":440000,"taxTotal":45000,"total":485000,"amountPaid":200000,"amountDue":0,"currencyCode":"USD","paidAt":null,"createdAt":"2026-10-01T09:12:00.000Z"}}"#,
        "expenses": #"{"data":[{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"submitted","totalAmount":148620,"currencyCode":"USD","submittedAt":"2026-10-10T08:41:00.000Z","approvedAt":null,"paidAt":null,"rejectionReason":null,"createdAt":"2026-10-09T18:20:00.000Z","submittedByUser":{"id":"demo-user-priya","name":"Priya Shah","email":"priya@northwind.studio","image":null}},{"id":"demo-exp-6","title":"Config conference tickets","description":null,"status":"approved","totalAmount":79800,"currencyCode":"USD","submittedAt":"2026-10-06T11:05:00.000Z","approvedAt":"2026-10-07T09:15:00.000Z","paidAt":null,"rejectionReason":null,"createdAt":"2026-10-06T11:02:00.000Z","submittedByUser":{"id":"demo-user-jordan","name":"Jordan Lee","email":"jordan@northwind.studio","image":null}},{"id":"demo-exp-5","title":"Team lunch with Globex","description":null,"status":"draft","totalAmount":18640,"currencyCode":"USD","submittedAt":null,"approvedAt":null,"paidAt":null,"rejectionReason":null,"createdAt":"2026-10-11T13:40:00.000Z","submittedByUser":{"id":"demo-user","name":"Alex Morgan","email":"alex@northwind.studio","image":null}},{"id":"demo-exp-4","title":"Office supplies restock","description":null,"status":"paid","totalAmount":14275,"currencyCode":"USD","submittedAt":"2026-09-29T10:02:00.000Z","approvedAt":"2026-09-30T08:00:00.000Z","paidAt":"2026-10-03T15:00:00.000Z","rejectionReason":null,"createdAt":"2026-09-29T10:00:00.000Z","submittedByUser":{"id":"demo-user-sam","name":"Sam Rivera","email":"sam@northwind.studio","image":null}},{"id":"demo-exp-3","title":"Uber rides, September","description":null,"status":"rejected","totalAmount":9630,"currencyCode":"USD","submittedAt":"2026-10-01T17:31:00.000Z","approvedAt":null,"paidAt":null,"rejectionReason":"Please attach the receipts for the 14 Sep rides.","createdAt":"2026-10-01T17:30:00.000Z","submittedByUser":{"id":"demo-user-priya","name":"Priya Shah","email":"priya@northwind.studio","image":null}},{"id":"demo-exp-2","title":"Home office monitor","description":null,"status":"paid","totalAmount":34999,"currencyCode":"USD","submittedAt":"2026-09-18T09:12:00.000Z","approvedAt":"2026-09-19T12:00:00.000Z","paidAt":"2026-09-25T10:00:00.000Z","rejectionReason":null,"createdAt":"2026-09-18T09:10:00.000Z","submittedByUser":{"id":"demo-user-jordan","name":"Jordan Lee","email":"jordan@northwind.studio","image":null}},{"id":"demo-exp-1","title":"Coffee with Initech","description":null,"status":"approved","totalAmount":4260,"currencyCode":"USD","submittedAt":"2026-09-16T08:31:00.000Z","approvedAt":"2026-09-17T14:22:00.000Z","paidAt":null,"rejectionReason":null,"createdAt":"2026-09-16T08:30:00.000Z","submittedByUser":{"id":"demo-user","name":"Alex Morgan","email":"alex@northwind.studio","image":null}}],"pagination":{"page":1,"limit":30,"total":7,"totalPages":1}}"#,
        "expenses/counts": #"{"counts":{"submitted":{"count":1,"amount":148620},"approved":{"count":2,"amount":84060},"draft":{"count":1,"amount":18640},"paid":{"count":2,"amount":49274},"rejected":{"count":1,"amount":9630}},"total":7}"#,
        "expenses/*": #"{"expenseClaim":{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"submitted","totalAmount":148620,"currencyCode":"USD","submittedAt":"2026-10-10T08:41:00.000Z","approvedAt":null,"paidAt":null,"rejectionReason":null,"createdAt":"2026-10-09T18:20:00.000Z","submittedByUser":{"id":"demo-user-priya","name":"Priya Shah","email":"priya@northwind.studio","image":null},"items":[{"id":"demo-item-1","date":"2026-10-06","description":"Delta Air Lines, AUS round trip","amount":61240,"category":"Travel","receiptFileKey":"demo-org/demo-delta/receipt-delta.jpg","receiptFileName":"receipt-delta.jpg","isMileage":false,"account":{"id":"demo-acc-travel","code":"6400","name":"Travel"}},{"id":"demo-item-2","date":"2026-10-07","description":"Hotel Van Zandt, 2 nights","amount":58400,"category":"Travel","receiptFileKey":"demo-org/demo-hotel/receipt-hotel.jpg","receiptFileName":"receipt-hotel.jpg","isMileage":false,"account":{"id":"demo-acc-travel","code":"6400","name":"Travel"}},{"id":"demo-item-3","date":"2026-10-07","description":"Dinner with the Hooli team","amount":21480,"category":"Meals","receiptFileKey":"demo-org/demo-dinner/receipt-dinner.jpg","receiptFileName":"receipt-dinner.jpg","isMileage":false,"account":{"id":"demo-acc-meals","code":"6420","name":"Meals and entertainment"}},{"id":"demo-item-4","date":"2026-10-08","description":"Uber to the airport","amount":7500,"category":"Travel","receiptFileKey":null,"receiptFileName":null,"isMileage":false,"account":null}],"approvedByUser":null}}"#,
        "expenses/receipt-url": #"{"downloadUrl":"https://storage.example.com/demo/receipt.jpg"}"#,
        "POST expenses": #"{"expenseClaim":{"id":"demo-exp-8","title":"Delta Air Lines","description":null,"status":"draft","totalAmount":61240,"currencyCode":"USD","submittedAt":null,"approvedAt":null,"paidAt":null,"rejectionReason":null,"createdAt":"2026-10-12T09:30:00.000Z"}}"#,
        "POST expenses/*/submit": #"{"expenseClaim":{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"submitted","totalAmount":148620,"currencyCode":"USD","submittedAt":"2026-10-12T09:31:00.000Z","approvedAt":null,"paidAt":null,"rejectionReason":null,"createdAt":"2026-10-09T18:20:00.000Z"}}"#,
        "POST expenses/*/recall": #"{"expenseClaim":{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"draft","totalAmount":148620,"currencyCode":"USD","submittedAt":null,"approvedAt":null,"paidAt":null,"rejectionReason":null,"createdAt":"2026-10-09T18:20:00.000Z"}}"#,
        "POST expenses/*/approve": #"{"expenseClaim":{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"approved","totalAmount":148620,"currencyCode":"USD","submittedAt":"2026-10-10T08:41:00.000Z","approvedAt":"2026-10-12T09:32:00.000Z","paidAt":null,"rejectionReason":null,"createdAt":"2026-10-09T18:20:00.000Z"}}"#,
        "POST expenses/*/reject": #"{"expenseClaim":{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"rejected","totalAmount":148620,"currencyCode":"USD","submittedAt":"2026-10-10T08:41:00.000Z","approvedAt":null,"paidAt":null,"rejectionReason":"Please split the hotel and dinner into separate claims.","createdAt":"2026-10-09T18:20:00.000Z"}}"#,
        "POST expenses/*/pay": #"{"expenseClaim":{"id":"demo-exp-7","title":"Client workshop, Austin","description":"Two-day discovery workshop with Hooli's design team.","status":"paid","totalAmount":148620,"currencyCode":"USD","submittedAt":"2026-10-10T08:41:00.000Z","approvedAt":"2026-10-11T09:32:00.000Z","paidAt":"2026-10-12T09:33:00.000Z","rejectionReason":null,"createdAt":"2026-10-09T18:20:00.000Z"}}"#,
        "POST attachments/presign": #"{"uploadUrl":"https://storage.example.com/demo-upload","attachment":{"id":"demo-att-1","fileKey":"demo-org/demo-new/receipt.jpg","fileName":"receipt.jpg"}}"#,
    ]

    /// A paper receipt drawn on device, so receipt thumbnails, the viewer and
    /// text recognition can all be tried without storage.
    @MainActor
    static func purchasesReceiptImage(for fileKey: String) -> UIImage {
        let receipt = PurchasesDemoReceipt.for(fileKey)
        let renderer = ImageRenderer(content: PurchasesDemoReceiptView(receipt: receipt))
        renderer.scale = 3
        return renderer.uiImage ?? UIImage()
    }
}

private struct PurchasesDemoReceipt {
    var merchant: String
    var address: [String]
    var date: String
    var lines: [(String, String)]
    var subtotal: String
    var tax: String
    var total: String
    var footer: String

    static func `for`(_ fileKey: String) -> PurchasesDemoReceipt {
        if fileKey.contains("hotel") {
            return PurchasesDemoReceipt(
                merchant: "HOTEL VAN ZANDT",
                address: ["605 Davis St", "Austin, TX 78701"],
                date: "10/07/2026",
                lines: [("Deluxe King, 2 nights", "478.00"), ("Parking", "40.00")],
                subtotal: "518.00", tax: "66.00", total: "584.00",
                footer: "Thank you for staying with us"
            )
        }
        if fileKey.contains("dinner") {
            return PurchasesDemoReceipt(
                merchant: "ODD DUCK",
                address: ["1203 S Lamar Blvd", "Austin, TX 78704"],
                date: "10/07/2026",
                lines: [("Shared plates x6", "126.00"), ("Drinks x5", "52.00"), ("Gratuity", "18.40")],
                subtotal: "196.40", tax: "18.40", total: "214.80",
                footer: "Server: Maya  Table 12"
            )
        }
        return PurchasesDemoReceipt(
            merchant: "DELTA AIR LINES",
            address: ["1030 Delta Blvd", "Atlanta, GA 30354"],
            date: "10/06/2026",
            lines: [("Fare AUS-SFO-AUS", "548.00"), ("Seat selection", "0.00")],
            subtotal: "548.00", tax: "64.40", total: "612.40",
            footer: "Ticket 006 2318841 · Main Cabin"
        )
    }
}

private struct PurchasesDemoReceiptView: View {
    let receipt: PurchasesDemoReceipt
    private let paper = Color(hex: 0xFFFFFF)
    private let ink = Color(hex: 0x1A1A1A)

    var body: some View {
        VStack(spacing: 14) {
            VStack(spacing: 4) {
                Text(receipt.merchant)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                ForEach(receipt.address, id: \.self) { Text($0) }
            }
            .font(.system(size: 12, design: .monospaced))
            dashed
            HStack {
                Text("Date: \(receipt.date)")
                Spacer()
                Text("09:41")
            }
            dashed
            VStack(spacing: 6) {
                ForEach(receipt.lines, id: \.0) { line in
                    row(line.0, line.1)
                }
            }
            dashed
            VStack(spacing: 6) {
                row("Subtotal", receipt.subtotal)
                row("Tax", receipt.tax)
            }
            row("TOTAL", "$\(receipt.total)")
                .font(.system(size: 18, weight: .bold, design: .monospaced))
            dashed
            Text("VISA **** 4821  APPROVED")
            Text(receipt.footer)
        }
        .font(.system(size: 13, design: .monospaced))
        .foregroundStyle(ink)
        .padding(.horizontal, 24)
        .padding(.vertical, 28)
        .frame(width: 340)
        .background(paper)
    }

    private var dashed: some View {
        Text(String(repeating: "-", count: 34)).foregroundStyle(ink.opacity(0.5))
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
        }
    }
}
#endif
