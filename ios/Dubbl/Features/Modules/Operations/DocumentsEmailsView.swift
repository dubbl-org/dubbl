import SwiftUI

/// Every invoice, quote, credit note and purchase order email the workspace
/// sent, newest first. Failed ones can be sent again.
struct DocumentsEmailsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var emails: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var filter = "all"
    @State private var search = ""
    @State private var reading: JSONValue?
    @State private var shown = false

    private var visible: [JSONValue] {
        guard OperationsFormat.isDemo else { return emails }
        let term = search.trimmingCharacters(in: .whitespaces)
        return emails.filter { email in
            if filter != "all", email["status"]?.stringValue != filter { return false }
            guard !term.isEmpty else { return true }
            return ["recipientEmail", "subject"].contains { email[$0]?.stringValue?.localizedCaseInsensitiveContains(term) == true }
        }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Sent emails")
            .navigationSubtitle(loaded ? "\(visible.count)" : "")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Recipient or subject")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Status", selection: $filter) {
                            Text("All").tag("all")
                            Text("Sent").tag("sent")
                            Text("Failed").tag("failed")
                        }
                    } label: {
                        Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter by status")
                }
            }
            .task { await load() }
            .onChange(of: filter) { _, _ in Task { await load() } }
            .task(id: search) {
                guard loaded else { return }
                try? await Task.sleep(for: .milliseconds(300))
                if Task.isCancelled { return }
                await load()
            }
            .refreshable { await load() }
            .sheet(item: Binding(get: { reading.map(DocumentsEmailRef.init) }, set: { if $0 == nil { reading = nil } })) { ref in
                DocumentsEmailSheet(email: ref.email) { Task { await load() } }
            }
    }

    @ViewBuilder
    private var content: some View {
        if !loaded {
            if let error {
                ErrorStateView(message: error) { await load() }.frame(maxHeight: .infinity)
            } else {
                ScrollView { SkeletonRows(rows: 9) }
            }
        } else if visible.isEmpty {
            EmptyStateView(
                symbol: "envelope",
                title: filter == "failed" ? "Nothing failed" : "No emails yet",
                message: search.isEmpty ? "Invoices and quotes you email from dubbl show up here." : "No emails match \"\(search)\"."
            )
            .frame(maxHeight: .infinity)
        } else {
            List {
                let failed = emails.filter { $0["status"]?.stringValue == "failed" }.count
                if failed > 0, filter == "all", search.isEmpty {
                    Button { filter = "failed" } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(DTheme.negative)
                            Text("\(failed) \(failed == 1 ? "email" : "emails") didn't go out")
                                .font(.system(size: 14.5, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Text("Review").font(.system(size: 14, weight: .medium)).foregroundStyle(DTheme.inkSecondary)
                        }
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(RowPressStyle())
                    .ledgerRow()
                }
                ForEach(Array(visible.enumerated()), id: \.element.recordID) { index, email in
                    Button { reading = email } label: { row(email) }
                        .buttonStyle(RowPressStyle())
                        .ledgerRow()
                        .reveal(shown, min(index, 8))
                }
                LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "email" : "emails")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func row(_ email: JSONValue) -> some View {
        let status = email["status"]?.stringValue == "failed" ? "failed" : "sent"
        let document = [email["document.kind"]?.stringValue, email["document.label"]?.stringValue].compactMap { $0 }.joined(separator: " ")
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(email["subject"]?.stringValue ?? "Email")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([email["recipientEmail"]?.stringValue, document.isEmpty ? nil : document].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(DubblDate.short(email["sentAt"]?.stringValue))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                LedgerStatus(text: status == "failed" ? "Failed" : "Sent", tone: status == "failed" ? .negative : .positive)
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func load() async {
        let term = search.trimmingCharacters(in: .whitespaces)
        do {
            let response: JSONValue = try await env.api.get("document-emails", query: [
                "limit": "100",
                "status": filter == "all" ? nil : filter,
                "search": term.isEmpty ? nil : term,
            ])
            withAnimation(.snappy) {
                emails = response.opsArray("data")
                loaded = true
                error = nil
            }
            shown = true
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

struct DocumentsEmailRef: Identifiable {
    let email: JSONValue
    var id: String { email.recordID ?? "" }
}

/// One sent email: who it went to, what it said, and why it failed.
struct DocumentsEmailSheet: View {
    let email: JSONValue
    let onResent: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var sending = false

    private var failed: Bool { email["status"]?.stringValue == "failed" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        LedgerStatus(text: failed ? "Failed" : "Sent", tone: failed ? .negative : .positive)
                        Text(email["subject"]?.stringValue ?? "Email")
                            .font(.system(size: 22, weight: .semibold))
                            .tracking(-0.4)
                            .foregroundStyle(DTheme.ink)
                    }
                    .padding(.horizontal, 4)
                    if failed, let message = email["errorMessage"]?.stringValue {
                        Text(message)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Tone.negative.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    CardStack {
                        DetailRow("To", email["recipientEmail"]?.stringValue ?? "–")
                        if let sender = email["sentByUser.name"]?.stringValue ?? email["sentByUser.email"]?.stringValue {
                            DetailRow("From", sender)
                        }
                        DetailRow("Sent", DubblDate.display(email["sentAt"]?.stringValue))
                        if let kind = email["document.kind"]?.stringValue {
                            DetailRow(kind, email["document.label"]?.stringValue ?? "Deleted")
                        }
                        DetailRow("PDF attached", email["attachPdf"]?.boolValue == true ? "Yes" : "No")
                    }
                    if let body = email["body"]?.stringValue, !body.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("Message")
                            Text(Self.plainText(body))
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .dubblCard()
                        }
                    }
                }
                .padding(20)
            }
            .background(DTheme.shell)
            .navigationTitle("Email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                PurchasesActionBar {
                    Button { Task { await resend() } } label: {
                        HStack(spacing: 8) {
                            if sending { ProgressView().controlSize(.small).tint(failed ? DTheme.inkInverse : DTheme.ink) } else { Image(systemName: "arrow.clockwise") }
                            Text(failed ? "Try again" : "Send again")
                        }
                    }
                    .buttonStyle(InkOrSoft(filled: failed))
                    .disabled(sending)
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    /// The stored body is HTML; show its words.
    static func plainText(_ html: String) -> String {
        var text = html.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: .regularExpression)
        text = text.replacingOccurrences(of: "</p>", with: "\n\n")
        text = text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        for (entity, value) in ["&amp;": "&", "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'"] {
            text = text.replacingOccurrences(of: entity, with: value)
        }
        return text.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func resend() async {
        guard let id = email.recordID else { return }
        sending = true
        defer { sending = false }
        do {
            let response: JSONValue = try await env.api.post("document-emails/\(id)/resend")
            if response["emailLog.status"]?.stringValue == "failed" {
                env.toast.show("It failed again. Check the address and email settings.", isError: true)
            } else {
                env.toast.show("Sent to \(email["recipientEmail"]?.stringValue ?? "the recipient")")
                onResent()
                dismiss()
            }
        } catch {
            env.toast.error(error)
        }
    }
}

/// Filled ink for the main action, a soft pill otherwise.
private struct InkOrSoft: ButtonStyle {
    let filled: Bool

    func makeBody(configuration: Configuration) -> some View {
        if filled {
            InkButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        } else {
            SoftButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        }
    }
}
