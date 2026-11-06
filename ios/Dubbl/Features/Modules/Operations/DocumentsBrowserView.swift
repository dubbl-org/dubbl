import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The file library: folders, then files, in one of the web's views (all
/// files, recent, starred, attached to records, unlinked, private, trash).
/// Files open in QuickLook; scan, photos or files upload into the folder
/// you're in.
struct DocumentsBrowserView: View {
    /// "folder", "recent", "starred", "linked", "unlinked", "private" or "trash".
    var view: String
    var folderId: String?
    var folderName: String?
    /// Shows the view chips; folders pushed from a browser don't.
    var showsViews = true

    @Environment(AppEnvironment.self) private var env
    @State private var current = ""
    @State private var data: JSONValue?
    @State private var error: String?
    @State private var search = ""
    @State private var opening: String?
    @State private var preview: DocumentsPreviewFile?
    @State private var uploading: (done: Int, total: Int)?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var choosingPhotos = false
    @State private var importing = false
    @State private var scanning = false
    @State private var naming: DocumentsNaming?
    @State private var nameText = ""
    @State private var deletingFolder: JSONValue?

    static let views: [(value: String, label: String, symbol: String)] = [
        ("folder", "All files", "folder"), ("recent", "Recent", "clock"), ("starred", "Starred", "star"),
        ("linked", "Attachments", "paperclip"), ("unlinked", "Unlinked", "link.badge.plus"), ("private", "Private", "lock"), ("trash", "Trash", "trash"),
    ]

    private var activeView: String { current.isEmpty ? view : current }
    private var searching: Bool { !search.trimmingCharacters(in: .whitespaces).isEmpty }

    private var title: String {
        if let folderName { return folderName }
        return Self.views.first { $0.value == activeView }?.label ?? "Documents"
    }

    // MARK: Data

    private var folders: [JSONValue] {
        guard activeView == "folder", !searching else { return [] }
        return (data?.opsArray("folders") ?? [])
            .filter { $0["parentId"]?.stringValue == folderId }
            .sorted { ($0["name"]?.stringValue ?? "").localizedCaseInsensitiveCompare($1["name"]?.stringValue ?? "") == .orderedAscending }
    }

    /// Files for the view. Demo fixtures ignore the query, so filter here too.
    private var files: [JSONValue] {
        let all = data?.opsArray("files") ?? []
        guard OperationsFormat.isDemo else { return all }
        let term = search.trimmingCharacters(in: .whitespaces)
        if !term.isEmpty { return all.filter { $0["fileName"]?.stringValue?.localizedCaseInsensitiveContains(term) == true } }
        switch activeView {
        case "folder": return all.filter { $0["folderId"]?.stringValue == folderId }
        case "starred": return all.filter { $0["starred"]?.boolValue == true }
        case "linked": return all.filter { $0["entityType"]?.stringValue != nil }
        case "unlinked": return all.filter { $0["entityType"]?.stringValue == nil }
        case "private": return all.filter { $0["visibility"]?.stringValue == "private" }
        case "trash": return []
        default: return all
        }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle(title)
            .navigationSubtitle(data == nil ? "" : "\(files.count) \(files.count == 1 ? "file" : "files")")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search files")
            .toolbar {
                if activeView != "trash" {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            if DocumentsScanner.isSupported {
                                Button { scanning = true } label: { Label("Scan document", systemImage: "doc.viewfinder") }
                            }
                            Button { choosingPhotos = true } label: { Label("Choose photos", systemImage: "photo.on.rectangle") }
                            Button { importing = true } label: { Label("Choose files", systemImage: "folder") }
                            if activeView == "folder" {
                                Divider()
                                Button {
                                    nameText = ""
                                    naming = .newFolder
                                } label: {
                                    Label("New folder", systemImage: "folder.badge.plus")
                                }
                            }
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add")
                        .disabled(uploading != nil)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let uploading {
                    HStack(spacing: 10) {
                        ProgressView().controlSize(.small).tint(DTheme.inkInverse)
                        Text(uploading.total == 1 ? "Uploading…" : "Uploading \(uploading.done + 1) of \(uploading.total)…")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundStyle(DTheme.inkInverse)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(DTheme.ink, in: Capsule())
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .task { await load() }
            .task(id: search) {
                guard data != nil else { return }
                try? await Task.sleep(for: .milliseconds(300))
                if Task.isCancelled { return }
                await load()
            }
            .refreshable { await load() }
            .onChange(of: current) { _, _ in Task { await load() } }
            .photosPicker(isPresented: $choosingPhotos, selection: $pickerItems, maxSelectionCount: 10, matching: .images)
            .onChange(of: pickerItems) { _, items in
                guard !items.isEmpty else { return }
                Task {
                    var picked: [DocumentsPendingFile] = []
                    for (index, item) in items.enumerated() {
                        if let file = await DocumentsUploader.photo(item, index: index) { picked.append(file) }
                    }
                    pickerItems = []
                    await upload(picked)
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                guard case let .success(urls) = result else { return }
                Task { await upload(urls.compactMap(DocumentsUploader.file)) }
            }
            .fullScreenCover(isPresented: $scanning) {
                DocumentsScanner { pages in
                    scanning = false
                    if let pdf = DocumentsUploader.pdf(pages) { Task { await upload([pdf]) } }
                } onCancel: {
                    scanning = false
                }
                .ignoresSafeArea()
            }
            .sheet(item: $preview) { file in
                DocumentsQuickLook(url: file.url).ignoresSafeArea()
            }
            .alert(naming?.title ?? "", isPresented: Binding(get: { naming != nil }, set: { if !$0 { naming = nil } })) {
                TextField("Name", text: $nameText)
                Button("Cancel", role: .cancel) {}
                Button(naming?.confirm ?? "Save") {
                    if let naming { Task { await applyName(naming) } }
                }
            }
            .confirmationDialog(
                "Delete \(deletingFolder?["name"]?.stringValue ?? "this folder")?",
                isPresented: Binding(get: { deletingFolder != nil }, set: { if !$0 { deletingFolder = nil } }),
                titleVisibility: .visible
            ) {
                Button("Delete folder", role: .destructive) {
                    if let deletingFolder { Task { await deleteFolder(deletingFolder) } }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Its subfolders are deleted and the files inside go to Trash for 30 days.")
            }
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        if let data {
            List {
                if showsViews, !searching {
                    ChipRow(options: Self.views.map { option in
                        (value: option.value, label: option.label, count: option.value == "folder" ? nil : data["counts.\(option.value == "folder" ? "all" : option.value)"]?.intValue)
                    }, selection: Binding(get: { activeView }, set: { current = $0 }))
                    // Opened on a later view (Unlinked, Private, Trash), start
                    // with its chip in sight.
                    .defaultScrollAnchor((Self.views.firstIndex { $0.value == view } ?? 0) > 3 ? .trailing : .leading)
                    .padding(.horizontal, -20)
                    .padding(.vertical, 10)
                    .ledgerRow()
                    .listRowSeparator(.hidden)
                }
                if showsViews, !searching, activeView == "folder", let used = data["storage.usedBytes"]?.intValue {
                    storage(used: used, max: data["storage.maxBytes"]?.intValue)
                        .ledgerRow()
                }
                ForEach(folders, id: \.recordID) { folder in
                    NavigationLink {
                        DocumentsBrowserView(view: "folder", folderId: folder.recordID, folderName: folder["name"]?.stringValue, showsViews: false)
                    } label: {
                        folderRow(folder)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                    .contextMenu {
                        Button {
                            nameText = folder["name"]?.stringValue ?? ""
                            naming = .renameFolder(folder.recordID ?? "")
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        Button(role: .destructive) { deletingFolder = folder } label: { Label("Delete folder", systemImage: "trash") }
                    }
                }
                ForEach(files, id: \.recordID) { file in
                    Button { Task { await open(file) } } label: { fileRow(file) }
                        .buttonStyle(RowPressStyle())
                        .ledgerRow()
                        .contextMenu { fileMenu(file) }
                        .swipeActions(edge: .trailing) {
                            if activeView == "trash" {
                                Button(role: .destructive) { Task { await bulk("purge", file, done: "Deleted for good") } } label: { Label("Delete", systemImage: "trash") }
                                Button { Task { await bulk("restore", file, done: "Restored") } } label: { Label("Restore", systemImage: "arrow.uturn.backward") }
                            } else {
                                Button(role: .destructive) { Task { await bulk("trash", file, done: "Moved to Trash") } } label: { Label("Trash", systemImage: "trash") }
                            }
                        }
                        .swipeActions(edge: .leading) {
                            if activeView != "trash" {
                                let starred = file["starred"]?.boolValue == true
                                Button { Task { await bulk(starred ? "unstar" : "star", file, done: starred ? "Unstarred" : "Starred") } } label: {
                                    Label(starred ? "Unstar" : "Star", systemImage: starred ? "star.slash" : "star")
                                }
                                .tint(DTheme.warning)
                            }
                        }
                }
                if folders.isEmpty, files.isEmpty {
                    EmptyStateView(symbol: emptySymbol, title: emptyTitle, message: emptyMessage)
                        .padding(.top, 40)
                        .ledgerRow()
                        .listRowSeparator(.hidden)
                } else {
                    LedgerEndMarker(text: [
                        folders.isEmpty ? nil : "\(folders.count) \(folders.count == 1 ? "folder" : "folders")",
                        "\(files.count) \(files.count == 1 ? "file" : "files")",
                    ].compactMap { $0 }.joined(separator: " · "))
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .animation(.snappy, value: uploading?.done)
        } else if let error {
            ErrorStateView(message: error) { await load() }.frame(maxHeight: .infinity)
        } else {
            ScrollView { SkeletonRows(rows: 9) }
        }
    }

    private var emptySymbol: String { Self.views.first { $0.value == activeView }?.symbol ?? "folder" }

    private var emptyTitle: String {
        if searching { return "No matches" }
        switch activeView {
        case "trash": return "Trash is empty"
        case "starred": return "Nothing starred"
        case "linked": return "No attachments"
        case "unlinked": return "Everything's filed"
        default: return folderName == nil ? "No files yet" : "This folder is empty"
        }
    }

    private var emptyMessage: String {
        if searching { return "No files are called \"\(search)\"." }
        switch activeView {
        case "trash": return "Deleted files stay here for 30 days."
        case "starred": return "Swipe right on a file to star it."
        case "linked": return "Files attached to invoices, bills and other records show up here."
        case "unlinked": return "Every file is attached to a record."
        default: return "Scan a document, or add photos and files with the plus button."
        }
    }

    private func storage(used: Int, max: Int?) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("Storage").font(.system(size: 13.5, weight: .medium)).foregroundStyle(DTheme.inkSecondary)
                Spacer()
                Text(max.map { "\(Self.bytes(used)) of \(Self.bytes($0))" } ?? "\(Self.bytes(used)) used")
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
            if let max, max > 0 {
                OperationsBar(fraction: Double(used) / Double(max), tone: Double(used) / Double(max) > 0.9 ? .warning : .neutral, height: 5)
            }
        }
        .padding(.vertical, 12)
    }

    private func folderRow(_ folder: JSONValue) -> some View {
        let count = folder["fileCount"]?.intValue ?? 0
        return HStack(spacing: 12) {
            IconTile(symbol: "folder.fill", tone: .info, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(folder["name"]?.stringValue ?? "Folder")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text("\(count) \(count == 1 ? "file" : "files") · \(Self.bytes(folder["size"]?.intValue ?? 0))")
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func fileRow(_ file: JSONValue) -> some View {
        let mime = file["mimeType"]?.stringValue ?? ""
        let record = [file["record.kind"]?.stringValue, file["record.label"]?.stringValue].compactMap { $0 }.joined(separator: " ")
        let subtitle = [
            Self.bytes(file["fileSize"]?.intValue ?? 0),
            DubblDate.short(file["createdAt"]?.stringValue),
            record.isEmpty ? nil : record,
        ].compactMap { $0 }.filter { !$0.isEmpty }
        return HStack(spacing: 12) {
            DocumentsThumbnail(mime: mime, thumbURL: file["thumbUrl"]?.stringValue)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(file["fileName"]?.stringValue ?? "File")
                        .font(.system(size: 15.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if file["starred"]?.boolValue == true {
                        Image(systemName: "star.fill").font(.system(size: 10.5)).foregroundStyle(DTheme.warning)
                    }
                    if file["visibility"]?.stringValue == "private" {
                        Image(systemName: "lock.fill").font(.system(size: 10.5)).foregroundStyle(DTheme.inkTertiary)
                    }
                }
                Text(subtitle.joined(separator: " · "))
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            if opening == file.recordID {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func fileMenu(_ file: JSONValue) -> some View {
        if activeView == "trash" {
            Button { Task { await bulk("restore", file, done: "Restored") } } label: { Label("Restore", systemImage: "arrow.uturn.backward") }
            Button(role: .destructive) { Task { await bulk("purge", file, done: "Deleted for good") } } label: { Label("Delete for good", systemImage: "trash") }
        } else {
            Button { Task { await open(file) } } label: { Label("Open", systemImage: "eye") }
            let starred = file["starred"]?.boolValue == true
            Button { Task { await bulk(starred ? "unstar" : "star", file, done: starred ? "Unstarred" : "Starred") } } label: {
                Label(starred ? "Unstar" : "Star", systemImage: starred ? "star.slash" : "star")
            }
            Button {
                nameText = file["fileName"]?.stringValue ?? ""
                naming = .renameFile(file.recordID ?? "")
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button {
                env.router.askTilly("What's in the file \(file["fileName"]?.stringValue ?? "")?", page: "documents")
            } label: {
                Label("Ask Tilly", systemImage: "sparkle")
            }
            Divider()
            Button(role: .destructive) { Task { await bulk("trash", file, done: "Moved to Trash") } } label: { Label("Move to Trash", systemImage: "trash") }
        }
    }

    static func bytes(_ count: Int) -> String {
        Int64(count).formatted(.byteCount(style: .file))
    }

    // MARK: Loading and actions

    private func load() async {
        let term = search.trimmingCharacters(in: .whitespaces)
        var query: [String: String?] = ["view": term.isEmpty ? activeView : "search"]
        if !term.isEmpty { query["q"] = term }
        if term.isEmpty, activeView == "folder", let folderId { query["folder"] = folderId }
        do {
            let response: JSONValue = try await env.api.get("documents/browse", query: query)
            withAnimation(.snappy) {
                data = response
                error = nil
            }
        } catch {
            if data == nil { self.error = error.localizedDescription }
        }
    }

    private func open(_ file: JSONValue) async {
        guard let id = file.recordID, opening == nil else { return }
        let name = file["fileName"]?.stringValue ?? "File"
        opening = id
        defer { opening = nil }
        do {
            let url: URL
            if OperationsFormat.isDemo {
                url = try DocumentsDownloader.save(DocumentsUploader.demoFile(named: name), fileName: (name as NSString).deletingPathExtension + ".pdf")
            } else {
                let link: JSONValue = try await env.api.get("documents/\(id)/download")
                guard let remote = link["downloadUrl"]?.stringValue.flatMap(URL.init(string:)) else {
                    throw URLError(.fileDoesNotExist)
                }
                url = try await DocumentsDownloader.fetch(remote, fileName: link["fileName"]?.stringValue ?? name)
            }
            preview = DocumentsPreviewFile(url: url)
        } catch {
            env.toast.error(error)
        }
    }

    private func upload(_ picked: [DocumentsPendingFile]) async {
        guard !picked.isEmpty else { return }
        let folder = activeView == "folder" ? folderId : nil
        var uploaded = 0
        for (index, file) in picked.enumerated() {
            withAnimation(.snappy) { uploading = (index, picked.count) }
            do {
                try await DocumentsUploader.upload(file, folderId: folder, api: env.api)
                uploaded += 1
            } catch {
                env.toast.show("Couldn't upload \(file.fileName). \(error.localizedDescription)", isError: true)
            }
        }
        withAnimation(.snappy) { uploading = nil }
        if uploaded > 0 {
            env.toast.show(uploaded == 1 ? "File uploaded" : "\(uploaded) files uploaded")
            await load()
        }
    }

    private func bulk(_ action: String, _ file: JSONValue, done: String) async {
        guard let id = file.recordID else { return }
        do {
            try await DocumentsUploader.bulk(action, ids: [id], api: env.api)
            env.toast.show(done)
            if OperationsFormat.isDemo, let data {
                var files = data.opsArray("files")
                switch action {
                case "star", "unstar": files = files.map { $0.recordID == id ? $0.opsSetting("starred", .bool(action == "star")) : $0 }
                default: files.removeAll { $0.recordID == id }
                }
                self.data = data.opsSetting("files", .array(files))
            } else {
                await load()
            }
        } catch {
            env.toast.error(error)
        }
    }

    private func applyName(_ naming: DocumentsNaming) async {
        guard let name = OperationsFormat.trimmed(nameText) else { return }
        do {
            switch naming {
            case .newFolder:
                let _: JSONValue = try await env.api.post("documents/folders", body: DocumentsFolderBody(name: name, parentId: folderId))
                env.toast.show("Folder created")
            case let .renameFolder(id):
                let _: JSONValue = try await env.api.patch("documents/folders/\(id)", body: ["name": name])
                env.toast.show("Folder renamed")
            case let .renameFile(id):
                let _: JSONValue = try await env.api.patch("documents/\(id)", body: ["fileName": name])
                env.toast.show("File renamed")
            }
            await load()
        } catch {
            env.toast.error(error)
        }
    }

    private func deleteFolder(_ folder: JSONValue) async {
        guard let id = folder.recordID else { return }
        do {
            let _: JSONValue = try await env.api.delete("documents/folders/\(id)")
            env.toast.show("Folder deleted")
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

struct DocumentsFolderBody: Encodable, Sendable {
    var name: String
    var parentId: String?
}

/// What the name prompt is for.
enum DocumentsNaming: Equatable {
    case newFolder
    case renameFolder(String)
    case renameFile(String)

    var title: String {
        switch self {
        case .newFolder: "New folder"
        case .renameFolder: "Rename folder"
        case .renameFile: "Rename file"
        }
    }

    var confirm: String {
        self == .newFolder ? "Create" : "Rename"
    }
}

/// A file's thumbnail: the image itself when storage sent a preview link,
/// otherwise a tile for its type.
struct DocumentsThumbnail: View {
    let mime: String
    let thumbURL: String?

    private var symbol: (String, Tone) {
        if mime == "application/pdf" { return ("doc.richtext", .negative) }
        if mime.hasPrefix("image/") { return ("photo", .info) }
        if mime.contains("spreadsheet") || mime.contains("excel") || mime.contains("csv") { return ("tablecells", .positive) }
        if mime.contains("word") || mime.hasPrefix("text/") { return ("doc.text", .special) }
        if mime.contains("zip") { return ("doc.zipper", .neutral) }
        return ("doc", .neutral)
    }

    var body: some View {
        if let thumbURL, let url = URL(string: thumbURL) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                DTheme.field
            }
            .frame(width: 38, height: 38)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(DTheme.hairline, lineWidth: 0.5))
        } else {
            IconTile(symbol: symbol.0, tone: symbol.1, size: 38)
        }
    }
}
