import SwiftUI
import UIKit

/// Receipt images for expense items: `GET expenses/receipt-url?fileKey=` gives
/// a short-lived link, which is downloaded once and kept for the session.
@MainActor
final class PurchasesReceiptCache {
    enum Receipt {
        case image(UIImage)
        /// Not an image (a PDF uploaded on the web, say): open it in the browser.
        case file(URL)
    }

    static let shared = PurchasesReceiptCache()
    private var receipts: [String: Receipt] = [:]
    private var inflight: [String: Task<Receipt, Error>] = [:]

    func cached(_ fileKey: String) -> Receipt? { receipts[fileKey] }

    func load(_ fileKey: String, api: APIClient) async throws -> Receipt {
        if let receipt = receipts[fileKey] { return receipt }
        if let task = inflight[fileKey] { return try await task.value }
        let task = Task<Receipt, Error> { @MainActor in
            #if DEBUG
            if DemoData.isEnabled {
                try? await Task.sleep(for: .milliseconds(200))
                return .image(DemoData.purchasesReceiptImage(for: fileKey))
            }
            #endif
            let link: PurchasesReceiptURLResponse = try await api.get("expenses/receipt-url", query: ["fileKey": fileKey])
            guard let url = URL(string: link.downloadUrl) else { throw URLError(.badURL) }
            let data = try await Self.download(url)
            if let image = await UIImage(data: data)?.byPreparingForDisplay() {
                return .image(image)
            }
            return .file(url)
        }
        inflight[fileKey] = task
        defer { inflight[fileKey] = nil }
        let receipt = try await task.value
        receipts[fileKey] = receipt
        return receipt
    }

    private nonisolated static func download(_ url: URL) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw APIError.server(status: (response as? HTTPURLResponse)?.statusCode ?? 0, payload: nil)
        }
        return data
    }
}

/// A small receipt preview. Tapping opens the full-screen viewer.
struct PurchasesReceiptThumbnail: View {
    let fileKey: String
    var title: String = "Receipt"
    var width: CGFloat = 44
    var height: CGFloat = 56

    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var receipt: PurchasesReceiptCache.Receipt?
    @State private var failed = false
    @State private var viewing: PurchasesViewedReceipt?

    var body: some View {
        Button {
            switch receipt {
            case let .image(image): viewing = PurchasesViewedReceipt(image: image, title: title)
            case let .file(url): openURL(url)
            case nil: break
            }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(DTheme.field)
                switch receipt {
                case let .image(image):
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: width, height: height)
                        .clipped()
                        .transition(.opacity)
                case .file:
                    Image(systemName: "doc.text").font(.system(size: 16)).foregroundStyle(DTheme.inkSecondary)
                case nil:
                    if failed {
                        Image(systemName: "photo.badge.exclamationmark").font(.system(size: 14)).foregroundStyle(DTheme.inkTertiary)
                    } else {
                        ProgressView().controlSize(.mini)
                    }
                }
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(DTheme.hairline, lineWidth: 0.5))
        }
        .buttonStyle(TapScaleStyle())
        .disabled(receipt == nil)
        .accessibilityLabel("View receipt")
        .task(id: fileKey) {
            if let cached = PurchasesReceiptCache.shared.cached(fileKey) {
                receipt = cached
                return
            }
            do {
                let loaded = try await PurchasesReceiptCache.shared.load(fileKey, api: env.api)
                withAnimation(.easeOut(duration: 0.2)) { receipt = loaded }
            } catch {
                failed = true
            }
        }
        .fullScreenCover(item: $viewing) { item in
            PurchasesReceiptViewer(image: item.image, title: item.title)
        }
    }
}

struct PurchasesViewedReceipt: Identifiable {
    let id = UUID()
    let image: UIImage
    let title: String
}

/// Full-screen receipt: pinch or double-tap to zoom, share, close.
struct PurchasesReceiptViewer: View {
    let image: UIImage
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            DTheme.shell.ignoresSafeArea()
            PurchasesZoomableImage(image: image)
                .ignoresSafeArea()
            HStack {
                GlassCircleButton(symbol: "xmark", label: "Close") { dismiss() }
                Spacer()
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .glassEffect(.regular, in: Capsule())
                Spacer()
                ShareLink(item: Image(uiImage: image), preview: SharePreview(title, image: Image(uiImage: image))) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: Circle())
                .accessibilityLabel("Share")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .statusBarHidden()
    }
}

/// UIScrollView zooming, which feels right for documents.
struct PurchasesZoomableImage: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> ZoomView {
        let view = ZoomView(image: image)
        return view
    }

    func updateUIView(_ view: ZoomView, context: Context) {
        if view.imageView.image !== image {
            view.imageView.image = image
            view.setNeedsLayout()
        }
    }

    final class ZoomView: UIScrollView, UIScrollViewDelegate {
        let imageView = UIImageView()
        private var lastSize: CGSize = .zero

        init(image: UIImage) {
            super.init(frame: .zero)
            imageView.image = image
            imageView.contentMode = .scaleAspectFit
            imageView.layer.cornerRadius = 6
            imageView.clipsToBounds = true
            addSubview(imageView)
            delegate = self
            minimumZoomScale = 1
            maximumZoomScale = 5
            showsVerticalScrollIndicator = false
            showsHorizontalScrollIndicator = false
            contentInsetAdjustmentBehavior = .never
            decelerationRate = .fast
            backgroundColor = .clear
            let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
            doubleTap.numberOfTapsRequired = 2
            addGestureRecognizer(doubleTap)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        override func layoutSubviews() {
            super.layoutSubviews()
            guard bounds.size != lastSize, let image = imageView.image, image.size.width > 0 else {
                center()
                return
            }
            lastSize = bounds.size
            zoomScale = 1
            let inset: CGFloat = 16
            let available = CGSize(width: bounds.width - inset * 2, height: bounds.height - inset * 2 - 80)
            let scale = min(available.width / image.size.width, available.height / image.size.height)
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            imageView.frame = CGRect(origin: .zero, size: size)
            contentSize = size
            center()
        }

        private func center() {
            let x = max(0, (bounds.width - imageView.frame.width) / 2)
            let y = max(0, (bounds.height - imageView.frame.height) / 2)
            contentInset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

        func scrollViewDidZoom(_ scrollView: UIScrollView) { center() }

        @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
            if zoomScale > 1.01 {
                setZoomScale(1, animated: true)
            } else {
                let point = gesture.location(in: imageView)
                let size = CGSize(width: bounds.width / 2.5, height: bounds.height / 2.5)
                zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
            }
        }
    }
}
