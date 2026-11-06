import QuickLook
import SwiftUI

/// A downloaded file to preview, with the name it should show.
struct DocumentsPreviewFile: Identifiable {
    let url: URL
    var id: URL { url }
}

/// The system file preview (PDFs, images, office files) in a sheet.
struct DocumentsQuickLook: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UINavigationController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return UINavigationController(rootViewController: controller)
    }

    func updateUIViewController(_ controller: UINavigationController, context: Context) {
        context.coordinator.url = url
        (controller.viewControllers.first as? QLPreviewController)?.reloadData()
    }

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var url: URL

        init(url: URL) { self.url = url }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}

/// Downloads a short-lived storage link into a temporary file named after the
/// document, so QuickLook knows its type.
enum DocumentsDownloader {
    static func fetch(_ remote: URL, fileName: String) async throws -> URL {
        let (data, response) = try await URLSession.shared.data(from: remote)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw APIError.server(status: (response as? HTTPURLResponse)?.statusCode ?? 0, payload: nil)
        }
        return try save(data, fileName: fileName)
    }

    static func save(_ data: Data, fileName: String) throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appending(path: "dubbl-documents", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let safe = fileName.replacingOccurrences(of: "/", with: "-")
        let url = folder.appending(path: safe.isEmpty ? "file" : safe)
        try? FileManager.default.removeItem(at: url)
        try data.write(to: url, options: .atomic)
        return url
    }
}
