import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import VisionKit

/// A file ready to upload.
struct DocumentsPendingFile: Sendable {
    var data: Data
    var fileName: String
    var mimeType: String
}

/// `POST documents` -> `{ document, uploadUrl }`, then the bytes go straight
/// to storage with the same content type. If storage refuses them, the
/// half-made document is trashed and purged so it doesn't linger.
enum DocumentsUploader {
    private struct CreateBody: Encodable, Sendable {
        var fileName: String
        var fileSize: Int
        var mimeType: String
        var folderId: String?
    }

    private struct BulkBody: Encodable, Sendable {
        var action: String
        var ids: [String]
    }

    static func upload(_ file: DocumentsPendingFile, folderId: String?, api: APIClient) async throws {
        let body = CreateBody(fileName: file.fileName, fileSize: max(1, file.data.count), mimeType: file.mimeType, folderId: folderId)
        let response: JSONValue = try await api.post("documents", body: body)
        if OperationsFormat.isDemo { return }
        guard let link = response["uploadUrl"]?.stringValue, let url = URL(string: link) else {
            throw URLError(.badServerResponse)
        }
        do {
            try await api.upload(file.data, to: url, contentType: file.mimeType)
        } catch {
            if let id = response["document.id"]?.stringValue {
                let _: JSONValue? = try? await api.post("documents/bulk", body: BulkBody(action: "trash", ids: [id]))
                let _: JSONValue? = try? await api.post("documents/bulk", body: BulkBody(action: "purge", ids: [id]))
            }
            throw error
        }
    }

    /// One bulk action on files: star, unstar, trash, restore, purge.
    static func bulk(_ action: String, ids: [String], api: APIClient) async throws {
        let _: JSONValue = try await api.post("documents/bulk", body: BulkBody(action: action, ids: ids))
    }

    // MARK: Reading picked files

    /// "2026-10-12 14.03.22" for file names.
    static func stamp() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH.mm.ss"
        return formatter.string(from: .now)
    }

    /// Photos become JPEGs so they open everywhere.
    static func photo(_ item: PhotosPickerItem, index: Int) async -> DocumentsPendingFile? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        let jpeg = await Task.detached { UIImage(data: data)?.jpegData(compressionQuality: 0.85) }.value
        let suffix = index > 0 ? " \(index + 1)" : ""
        if let jpeg {
            return DocumentsPendingFile(data: jpeg, fileName: "Photo \(stamp())\(suffix).jpg", mimeType: "image/jpeg")
        }
        let type = item.supportedContentTypes.first
        return DocumentsPendingFile(
            data: data,
            fileName: "Photo \(stamp())\(suffix).\(type?.preferredFilenameExtension ?? "bin")",
            mimeType: type?.preferredMIMEType ?? "application/octet-stream"
        )
    }

    /// A file from the Files app, read inside its security scope.
    static func file(_ url: URL) -> DocumentsPendingFile? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let type = UTType(filenameExtension: url.pathExtension)
        return DocumentsPendingFile(data: data, fileName: url.lastPathComponent, mimeType: type?.preferredMIMEType ?? "application/octet-stream")
    }

    /// Scanned pages as one PDF.
    static func pdf(_ pages: [UIImage]) -> DocumentsPendingFile? {
        guard let first = pages.first else { return nil }
        let bounds = CGRect(origin: .zero, size: first.size)
        let data = UIGraphicsPDFRenderer(bounds: bounds).pdfData { context in
            for page in pages {
                context.beginPage(withBounds: CGRect(origin: .zero, size: page.size), pageInfo: [:])
                page.draw(in: CGRect(origin: .zero, size: page.size))
            }
        }
        return DocumentsPendingFile(data: data, fileName: "Scan \(stamp()).pdf", mimeType: "application/pdf")
    }

    /// A stand-in file for demo mode, so the preview has something to show.
    static func demoFile(named name: String) -> Data {
        let bounds = CGRect(x: 0, y: 0, width: 612, height: 792)
        return UIGraphicsPDFRenderer(bounds: bounds).pdfData { context in
            context.beginPage()
            let title = NSAttributedString(string: name, attributes: [.font: UIFont.systemFont(ofSize: 24, weight: .semibold)])
            title.draw(at: CGPoint(x: 56, y: 64))
            let body = NSAttributedString(
                string: "Northwind Studio\n\nA demo copy of this document. Real files open here from storage.",
                attributes: [.font: UIFont.systemFont(ofSize: 14), .foregroundColor: UIColor.darkGray]
            )
            body.draw(in: CGRect(x: 56, y: 110, width: 500, height: 200))
        }
    }
}

/// The system document scanner: edges found and straightened, several pages at once.
struct DocumentsScanner: UIViewControllerRepresentable {
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
            onFinish((0 ..< scan.pageCount).map { scan.imageOfPage(at: $0) })
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            onCancel()
        }
    }
}
