import SwiftUI
import UIKit
import Vision
import VisionKit

/// The system document scanner: edge detection, perspective correction, and
/// several receipts in one go. Only on devices with a camera.
struct PurchasesDocumentScanner: UIViewControllerRepresentable {
    let onFinish: ([UIImage]) -> Void
    let onCancel: () -> Void

    static var isSupported: Bool { VNDocumentCameraViewController.isSupported }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish, onCancel: onCancel) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onFinish: ([UIImage]) -> Void
        let onCancel: () -> Void

        init(onFinish: @escaping ([UIImage]) -> Void, onCancel: @escaping () -> Void) {
            self.onFinish = onFinish
            self.onCancel = onCancel
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let pages = (0 ..< scan.pageCount).map { scan.imageOfPage(at: $0) }
            onFinish(pages)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            onCancel()
        }
    }
}

/// What a receipt seems to say. Every field is a guess and may be missing.
struct PurchasesReceiptGuess: Sendable {
    var merchant: String?
    var total: Decimal?
    var date: Date?
}

/// Best-effort reading of a receipt with on-device text recognition: the
/// merchant from the top lines, the total from a "total" line (or the largest
/// amount), and a date if one is printed. Never throws; a miss returns nothing.
enum PurchasesReceiptReader {
    static func read(_ image: UIImage) async -> PurchasesReceiptGuess {
        guard let cgImage = image.cgImage else { return PurchasesReceiptGuess() }
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        guard let observations = try? await request.perform(on: cgImage, orientation: image.cgOrientation) else {
            return PurchasesReceiptGuess()
        }
        // Top of the page first (Vision's origin is bottom-left).
        let lines = observations
            .sorted { $0.boundingBox.origin.y > $1.boundingBox.origin.y }
            .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return parse(lines)
    }

    static func parse(_ lines: [String]) -> PurchasesReceiptGuess {
        var guess = PurchasesReceiptGuess()
        guess.merchant = merchant(in: lines)
        guess.total = total(in: lines)
        guess.date = date(in: lines)
        return guess
    }

    private static let skipWords = ["receipt", "invoice", "tax", "www", "http", ".com", "tel", "phone", "order", "thank", "welcome", "date", "store #", "#"]

    private static func merchant(in lines: [String]) -> String? {
        for line in lines.prefix(6) {
            let lower = line.lowercased()
            let letters = line.filter(\.isLetter).count
            guard letters >= 3, Double(letters) / Double(max(line.count, 1)) > 0.5 else { continue }
            guard !skipWords.contains(where: { lower.contains($0) }) else { continue }
            let cleaned = line.trimmingCharacters(in: .punctuationCharacters.union(.whitespaces))
            guard cleaned.count <= 40 else { continue }
            // "DELTA AIR LINES" reads better as "Delta Air Lines".
            return cleaned == cleaned.uppercased() ? cleaned.capitalized : cleaned
        }
        return nil
    }

    private static func amounts(in line: String) -> [Decimal] {
        let amountPattern = /(\d{1,3}(?:[,. ]\d{3})*|\d+)[.,](\d{2})(?!\d)/
        return line.matches(of: amountPattern).compactMap { match in
            let whole = String(match.output.1).filter(\.isNumber)
            return Decimal(string: "\(whole).\(match.output.2)")
        }
    }

    private static func total(in lines: [String]) -> Decimal? {
        let lowered = lines.map { $0.lowercased() }
        // The last "total" line wins ("Total", "Amount due", "Grand total"), skipping subtotals and tax.
        let keys = ["grand total", "total", "amount due", "balance due", "amount paid", "to pay"]
        for index in lowered.indices.reversed() {
            let line = lowered[index]
            guard keys.contains(where: { line.contains($0) }), !line.contains("subtotal"), !line.contains("sub total"), !line.contains("tax") else { continue }
            if let value = amounts(in: lines[index]).last { return value }
            // The figure is often its own observation, just after the label.
            if index + 1 < lines.count, let value = amounts(in: lines[index + 1]).first { return value }
        }
        return lines.flatMap(amounts(in:)).filter { $0 < 100_000 }.max()
    }

    private static func date(in lines: [String]) -> Date? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue) else { return nil }
        for line in lines {
            let range = NSRange(line.startIndex..., in: line)
            if let match = detector.firstMatch(in: line, options: [], range: range), let date = match.date,
               date <= .now, date > Calendar.current.date(byAdding: .year, value: -2, to: .now) ?? .distantPast {
                return date
            }
        }
        return nil
    }

    /// A sensible category from the merchant's name.
    static func category(for merchant: String?) -> String? {
        guard let name = merchant?.lowercased() else { return nil }
        let map: [(String, [String])] = [
            ("Travel", ["air", "delta", "united", "uber", "lyft", "hotel", "marriott", "hilton", "airbnb", "taxi", "rail", "amtrak"]),
            ("Meals", ["cafe", "café", "coffee", "starbucks", "restaurant", "bistro", "grill", "pizza", "kitchen", "bar", "diner"]),
            ("Software", ["figma", "adobe", "github", "aws", "amazon web", "notion", "slack", "google", "apple.com", "openai"]),
            ("Office", ["staples", "office", "depot", "wework", "ikea"]),
        ]
        return map.first { $0.1.contains(where: name.contains) }?.0
    }
}

extension UIImage {
    fileprivate var cgOrientation: CGImagePropertyOrientation {
        switch imageOrientation {
        case .up: .up
        case .down: .down
        case .left: .left
        case .right: .right
        case .upMirrored: .upMirrored
        case .downMirrored: .downMirrored
        case .leftMirrored: .leftMirrored
        case .rightMirrored: .rightMirrored
        @unknown default: .up
        }
    }
}

enum PurchasesImageEncoder {
    /// JPEG at ~0.7 quality, longest side at most 2000px, orientation baked in.
    static func jpeg(_ image: UIImage, maxDimension: CGFloat = 2000, quality: CGFloat = 0.7) -> Data? {
        let size = image.size
        let longest = max(size.width, size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return rendered.jpegData(compressionQuality: quality)
    }
}
