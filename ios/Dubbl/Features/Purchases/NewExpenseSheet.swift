import PhotosUI
import SwiftUI

/// A new claim being put together: receipts first, then the items they cover.
/// Receipts are read on device to prefill the merchant and total.
@MainActor @Observable
final class PurchasesNewExpenseStore {
    struct Item: Identifiable {
        let id = UUID()
        var description = ""
        var amountText = ""
        var date = Date()
        var category = "Other"
        var receipt: UIImage?
        /// Set once the receipt is in storage, so a retry doesn't upload it again.
        var uploaded: PurchasesUploadedReceipt?
        var reading = false
        var autofilled = false

        var isBlank: Bool { receipt == nil && description.isEmpty && amountText.isEmpty }

        var amount: Decimal? {
            let normalized = amountText.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
            guard let value = Decimal(string: normalized), value > 0 else { return nil }
            return value
        }
    }

    enum Phase: Equatable {
        case idle
        case uploading(Int, Int)
        case saving
        case submitting

        var message: String {
            switch self {
            case .idle: ""
            case let .uploading(index, count): count == 1 ? "Uploading receipt" : "Uploading receipt \(index) of \(count)"
            case .saving: "Saving claim"
            case .submitting: "Submitting for approval"
            }
        }
    }

    var title = ""
    var notes = ""
    var items: [Item] = [Item()]
    private(set) var phase: Phase = .idle
    private(set) var errorMessage: String?
    private(set) var uploadFailed = false
    /// Bumped when a receipt fills in fields, for a light haptic.
    private(set) var autofillPulse = 0

    var isBusy: Bool { phase != .idle }
    var receipts: [Item] { items.filter { $0.receipt != nil } }

    var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
            && items.allSatisfy { !$0.description.trimmingCharacters(in: .whitespaces).isEmpty && $0.amount != nil }
    }

    func total(currency: String) -> Int {
        items.reduce(0) { $0 + ($1.amount.map { Money.minor(fromMajor: $0, currency: currency) } ?? 0) }
    }

    func index(of id: Item.ID) -> Int? { items.firstIndex { $0.id == id } }

    // MARK: Editing

    /// Each receipt becomes an item: the first fills an empty item, the rest are added.
    func addReceipts(_ images: [UIImage]) {
        var added: [Item.ID] = []
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            for image in images {
                if let index = items.firstIndex(where: \.isBlank) {
                    items[index].receipt = image
                    items[index].uploaded = nil
                    added.append(items[index].id)
                } else {
                    var item = Item()
                    item.receipt = image
                    items.append(item)
                    added.append(item.id)
                }
            }
        }
        uploadFailed = false
        errorMessage = nil
        for id in added {
            Task { await read(id) }
        }
    }

    func addItem() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { items.append(Item()) }
    }

    func removeItem(_ id: Item.ID) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            items.removeAll { $0.id == id }
            if items.isEmpty { items = [Item()] }
        }
    }

    func removeReceipt(_ id: Item.ID) {
        guard let index = index(of: id) else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            if items[index].description.isEmpty, items[index].amountText.isEmpty || items[index].autofilled, items.count > 1 {
                items.remove(at: index)
            } else {
                items[index].receipt = nil
                items[index].uploaded = nil
                items[index].autofilled = false
            }
        }
    }

    /// Best effort: fill only what the user hasn't typed yet.
    private func read(_ id: Item.ID) async {
        guard let index = index(of: id), let image = items[index].receipt else { return }
        items[index].reading = true
        let guess = await PurchasesReceiptReader.read(image)
        guard let index = self.index(of: id) else { return }
        withAnimation(.snappy) {
            var item = items[index]
            item.reading = false
            var filled = false
            if item.description.isEmpty, let merchant = guess.merchant {
                item.description = merchant
                filled = true
            }
            if item.amountText.isEmpty, let total = guess.total {
                item.amountText = String(format: "%.2f", NSDecimalNumber(decimal: total).doubleValue)
                filled = true
            }
            if let date = guess.date, Calendar.current.isDateInToday(item.date) {
                item.date = date
            }
            if item.category == "Other", let category = PurchasesReceiptReader.category(for: guess.merchant) {
                item.category = category
            }
            item.autofilled = filled
            items[index] = item
            if title.isEmpty, let merchant = guess.merchant, index == 0 {
                title = merchant
            }
            if filled { autofillPulse += 1 }
        }
    }

    // MARK: Saving

    /// Upload receipts (presign, then PUT), create the claim, and optionally submit it.
    func save(_ api: APIClient, submit: Bool, withoutReceipts: Bool = false) async throws -> ExpenseClaim {
        errorMessage = nil
        uploadFailed = false
        defer { phase = .idle }

        if !withoutReceipts {
            let pending = items.indices.filter { items[$0].receipt != nil && items[$0].uploaded == nil }
            for (position, index) in pending.enumerated() {
                phase = .uploading(position + 1, pending.count)
                do {
                    items[index].uploaded = try await upload(items[index].receipt!, number: index + 1, api: api)
                } catch {
                    uploadFailed = true
                    errorMessage = "Couldn't upload the receipt. \(error.localizedDescription) Receipt storage may not be set up on this server."
                    throw error
                }
            }
        }

        phase = .saving
        let body = PurchasesNewExpenseBody(
            title: title.trimmingCharacters(in: .whitespaces),
            description: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes.trimmingCharacters(in: .whitespacesAndNewlines),
            items: items.map { item in
                PurchasesNewExpenseBody.Item(
                    date: DubblDate.string(item.date),
                    description: item.description.trimmingCharacters(in: .whitespaces),
                    amount: item.amount ?? 0,
                    category: item.category,
                    receiptFileKey: withoutReceipts ? nil : item.uploaded?.fileKey,
                    receiptFileName: withoutReceipts ? nil : item.uploaded?.fileName
                )
            }
        )
        let created: ExpenseClaimResponse
        do {
            created = try await api.post("expenses", body: body)
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
        guard submit else { return created.expenseClaim }

        phase = .submitting
        do {
            let submitted: ExpenseClaimResponse = try await api.post("expenses/\(created.expenseClaim.id)/submit")
            return PurchasesKit.merged(submitted.expenseClaim, into: created.expenseClaim)
        } catch {
            // The claim exists as a draft; report the submit failure separately.
            throw PurchasesSubmitFailed(claim: created.expenseClaim, underlying: error)
        }
    }

    private func upload(_ image: UIImage, number: Int, api: APIClient) async throws -> PurchasesUploadedReceipt {
        guard let data = PurchasesImageEncoder.jpeg(image) else { throw URLError(.cannotDecodeContentData) }
        let fileName = "receipt-\(DubblDate.string(.now))-\(number).jpg"
        let presign: PurchasesPresignResponse = try await api.post(
            "attachments/presign",
            body: PurchasesPresignBody(fileName: fileName, contentType: "image/jpeg", fileSize: data.count)
        )
        var skipPut = false
        #if DEBUG
        skipPut = DemoData.isEnabled
        #endif
        if !skipPut {
            guard let url = URL(string: presign.uploadUrl) else { throw URLError(.badURL) }
            try await api.upload(data, to: url, contentType: "image/jpeg")
        }
        return PurchasesUploadedReceipt(fileKey: presign.attachment.fileKey, fileName: presign.attachment.fileName ?? fileName)
    }
}

struct PurchasesUploadedReceipt: Sendable, Hashable {
    var fileKey: String
    var fileName: String
}

struct PurchasesSubmitFailed: Error, LocalizedError {
    let claim: ExpenseClaim
    let underlying: Error

    var errorDescription: String? { "Saved as a draft, but couldn't submit: \(underlying.localizedDescription)" }
}

/// New expense claim, receipt first: scan (on devices with a camera) or pick
/// photos, check what was read, and save as a draft or submit for approval.
struct NewExpenseSheet: View {
    var onSaved: ((ExpenseClaim) -> Void)?

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var store = PurchasesNewExpenseStore()
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showScanner = false
    @State private var viewing: PurchasesViewedReceipt?
    @State private var confirmDiscard = false
    @FocusState private var focused: Bool

    private var currency: String { env.session.currency }

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    receiptsHero

                    CardStack {
                        FieldRow(label: "Title") {
                            TextField("Client trip to Austin", text: $store.title)
                                .focused($focused)
                        }
                        FieldRow(label: "Notes") {
                            TextField("Optional", text: $store.notes, axis: .vertical)
                                .lineLimit(1 ... 4)
                                .focused($focused)
                        }
                    }

                    ForEach(Array(store.items.enumerated()), id: \.element.id) { offset, item in
                        itemCard(item, number: offset + 1)
                            .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.97)), removal: .opacity))
                    }

                    Button {
                        store.addItem()
                    } label: {
                        Label("Add another item", systemImage: "plus")
                    }
                    .buttonStyle(SoftButtonStyle(size: .regular))
                    .disabled(store.isBusy)

                    if let message = store.errorMessage {
                        errorNotice(message)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(PurchasesKit.demoScrollAnchor)
            .background(DTheme.shell)
            .navigationTitle("New expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) {
                        if store.receipts.isEmpty, store.title.isEmpty, store.items.allSatisfy(\.isBlank) { dismiss() } else { confirmDiscard = true }
                    }
                    .disabled(store.isBusy)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focused = false }
                }
            }
            .safeAreaInset(edge: .bottom) { actionBar }
            .confirmationDialog("Discard this expense?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { dismiss() }
            }
        }
        .interactiveDismissDisabled(store.isBusy || !store.receipts.isEmpty)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
        .fullScreenCover(isPresented: $showScanner) {
            PurchasesDocumentScanner { images in
                showScanner = false
                store.addReceipts(images)
            } onCancel: {
                showScanner = false
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $viewing) { item in
            PurchasesReceiptViewer(image: item.image, title: item.title)
        }
        .onChange(of: pickerItems) { _, selection in
            guard !selection.isEmpty else { return }
            Task { await loadPicked(selection) }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: store.autofillPulse)
        #if DEBUG
        .task {
            let open = PurchasesKit.demoOpen
            if DemoData.isEnabled, open == "new-expense-filled" || open == "receipt", store.receipts.isEmpty {
                let image = DemoData.purchasesReceiptImage(for: "demo-delta")
                store.addReceipts([image])
                if open == "receipt" { viewing = PurchasesViewedReceipt(image: image, title: "Delta Air Lines") }
            }
        }
        #endif
    }

    // MARK: Receipts

    @ViewBuilder
    private var receiptsHero: some View {
        let receipts = store.receipts
        if receipts.isEmpty {
            captureCard
        } else {
            VStack(spacing: 12) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(receipts) { item in
                            receiptCard(item, number: (store.index(of: item.id) ?? 0) + 1, single: receipts.count == 1)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollClipDisabled()

                let canScan = PurchasesDocumentScanner.isSupported
                HStack(spacing: 8) {
                    if canScan {
                        Button {
                            showScanner = true
                        } label: {
                            Label("Scan another", systemImage: "doc.viewfinder")
                        }
                        .buttonStyle(SoftButtonStyle(size: .small))
                    }
                    PhotosPicker(selection: $pickerItems, maxSelectionCount: 10, matching: .images) {
                        Label(canScan ? "Add photo" : "Add another receipt", systemImage: "photo.on.rectangle")
                    }
                    .buttonStyle(SoftButtonStyle(size: .small))
                    Spacer()
                }
                .disabled(store.isBusy)
            }
        }
    }

    private var captureCard: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.viewfinder")
                .font(.system(size: 26, weight: .regular))
                .foregroundStyle(DTheme.ink)
                .frame(width: 60, height: 60)
                .background(DTheme.tint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(spacing: 5) {
                Text("Start with the receipt")
                    .displayFont(19)
                    .foregroundStyle(DTheme.ink)
                Text("We'll read the merchant and total for you.")
                    .font(.system(size: 14.5))
                    .foregroundStyle(DTheme.inkSecondary)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: 8) {
                if PurchasesDocumentScanner.isSupported {
                    Button {
                        showScanner = true
                    } label: {
                        Label("Scan", systemImage: "camera")
                    }
                    .buttonStyle(InkButtonStyle(size: .regular))
                }
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 10, matching: .images) {
                    Label("Choose photo", systemImage: "photo.on.rectangle")
                }
                .buttonStyle(PurchasesPickerStyle(primary: !PurchasesDocumentScanner.isSupported))
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .padding(.horizontal, 20)
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(DTheme.hairline, style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
        )
    }

    private func receiptCard(_ item: PurchasesNewExpenseStore.Item, number: Int, single: Bool) -> some View {
        let image = item.receipt ?? UIImage()
        return Button {
            viewing = PurchasesViewedReceipt(image: image, title: item.description.isEmpty ? "Receipt" : item.description)
        } label: {
            ZStack {
                DTheme.field
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .padding(14)
            }
            .frame(height: 320)
            .containerRelativeFrame(.horizontal) { width, _ in single ? width : width * 0.72 }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
            .overlay(alignment: .bottomLeading) {
                if item.reading || !single {
                    HStack(spacing: 6) {
                        if item.reading {
                            ProgressView().controlSize(.mini)
                            Text("Reading receipt")
                        } else {
                            Text("Item \(number)")
                        }
                    }
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .glassEffect(.regular, in: Capsule())
                    .padding(12)
                    .transition(.opacity)
                }
            }
            .animation(.snappy, value: item.reading)
        }
        .buttonStyle(TapScaleStyle())
        .overlay(alignment: .topTrailing) {
            Button {
                store.removeReceipt(item.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: Circle())
            .padding(12)
            .disabled(store.isBusy)
            .accessibilityLabel("Remove receipt")
        }
    }

    private func loadPicked(_ selection: [PhotosPickerItem]) async {
        var images: [UIImage] = []
        for item in selection {
            if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                images.append(image)
            }
        }
        pickerItems = []
        if images.isEmpty {
            env.toast.show("Couldn't open that photo", isError: true)
        } else {
            store.addReceipts(images)
        }
    }

    // MARK: Items

    private func itemCard(_ item: PurchasesNewExpenseStore.Item, number: Int) -> some View {
        let binding = itemBinding(item.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(store.items.count == 1 ? "Item" : "Item \(number)")
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                if item.autofilled {
                    HStack(spacing: 4) {
                        Image(systemName: "text.viewfinder")
                        Text("From receipt")
                    }
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(.horizontal, 8)
                    .frame(height: 20)
                    .background(DTheme.tint, in: Capsule())
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
                Spacer()
                if store.items.count > 1 {
                    Button("Remove", role: .destructive) { store.removeItem(item.id) }
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(DTheme.negative)
                        .disabled(store.isBusy)
                }
            }
            .padding(.horizontal, 4)

            CardStack {
                FieldRow(label: "Description") {
                    TextField(item.reading ? "Reading receipt…" : "Taxi to the airport", text: binding.description)
                        .focused($focused)
                }
                FieldRow(label: "Amount") {
                    HStack(spacing: 4) {
                        Text(Money.symbol(currency)).foregroundStyle(DTheme.inkSecondary)
                        TextField("0.00", text: binding.amountText)
                            .keyboardType(.decimalPad)
                            .font(DFont.figure(16, weight: .regular))
                            .focused($focused)
                    }
                }
                HStack {
                    Text("Date").font(.system(size: 16)).foregroundStyle(DTheme.ink)
                    Spacer()
                    DatePicker("Date", selection: binding.date, in: ...Date.now, displayedComponents: .date)
                        .labelsHidden()
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                HStack {
                    Text("Category").font(.system(size: 16)).foregroundStyle(DTheme.ink)
                    Spacer()
                    Picker("Category", selection: binding.category) {
                        ForEach(PurchasesKit.expenseCategories, id: \.self) { category in
                            Text(category).tag(category)
                        }
                    }
                    .labelsHidden()
                    .tint(DTheme.inkSecondary)
                }
                .padding(.leading, 16)
                .padding(.trailing, 4)
                .frame(minHeight: 52)
            }
            .disabled(store.isBusy)
        }
    }

    private func itemBinding(_ id: PurchasesNewExpenseStore.Item.ID) -> Binding<PurchasesNewExpenseStore.Item> {
        Binding {
            store.items.first { $0.id == id } ?? PurchasesNewExpenseStore.Item()
        } set: { value in
            if let index = store.index(of: id) { store.items[index] = value }
        }
    }

    private func errorNotice(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.circle")
                Text(message).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .font(.system(size: 14))
            .foregroundStyle(DTheme.negative)
            if store.uploadFailed {
                Button("Save without receipts") {
                    Task { await save(submit: false, withoutReceipts: true) }
                }
                .buttonStyle(SoftButtonStyle(size: .small))
            }
        }
        .padding(14)
        .background(Tone.negative.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .transition(.opacity)
    }

    // MARK: Saving

    private var actionBar: some View {
        VStack(spacing: 10) {
            HStack {
                if store.isBusy {
                    ProgressView().controlSize(.small)
                    Text(store.phase.message)
                        .foregroundStyle(DTheme.inkSecondary)
                        .contentTransition(.opacity)
                } else {
                    Text("Total")
                        .foregroundStyle(DTheme.inkSecondary)
                }
                Spacer()
                MoneyText(minor: store.total(currency: currency), currency: currency, size: 17, weight: .semibold)
                    .foregroundStyle(DTheme.ink)
            }
            .font(.system(size: 14.5, weight: .medium))
            .padding(.horizontal, 8)
            .padding(.top, 4)
            .animation(.snappy, value: store.phase)

            HStack(spacing: 10) {
                Button("Save draft") {
                    Task { await save(submit: false) }
                }
                .buttonStyle(SoftButtonStyle(size: .large))

                Button("Save and submit") {
                    Task { await save(submit: true) }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            }
            .disabled(!store.isValid || store.isBusy)
        }
        .padding(10)
        .glassEffect(.regular, in: .rect(cornerRadius: 32))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private func save(submit: Bool, withoutReceipts: Bool = false) async {
        focused = false
        do {
            var claim = try await store.save(env.api, submit: submit, withoutReceipts: withoutReceipts)
            claim.submittedByUser = claim.submittedByUser ?? env.session.user
            onSaved?(claim)
            env.toast.show(submit ? "Expense submitted" : "Expense saved as draft")
            dismiss()
        } catch let failure as PurchasesSubmitFailed {
            var claim = failure.claim
            claim.submittedByUser = claim.submittedByUser ?? env.session.user
            onSaved?(claim)
            env.toast.error(failure)
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

/// "Choose photo" is the main button when there's no camera to scan with.
private struct PurchasesPickerStyle: ButtonStyle {
    let primary: Bool

    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        if primary {
            InkButtonStyle(size: .regular).makeBody(configuration: configuration)
        } else {
            SoftButtonStyle(size: .regular).makeBody(configuration: configuration)
        }
    }
}
