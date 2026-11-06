import SwiftUI
import UIKit

// Shared pieces for the contacts extras: a one-response loader, a contact
// picker, a share sheet and the statement periods.

/// One GET response, kept while it reloads so screens don't flash.
@MainActor @Observable
final class ContactsExtrasRemote {
    private(set) var value: JSONValue?
    private(set) var error: String?

    func load(_ api: APIClient, _ path: String, query: [String: String?] = [:]) async {
        do {
            let response: JSONValue = try await api.get(path, query: query)
            withAnimation(.snappy) {
                value = response
                error = nil
            }
        } catch is CancellationError {
        } catch {
            if value == nil { self.error = error.localizedDescription }
        }
    }

    /// Forget the last response, e.g. when the filter changes shape.
    func reset() {
        value = nil
        error = nil
    }
}

/// Skeleton while loading, the error with a retry, then the content.
struct ContactsExtrasLoadState<Content: View>: View {
    let value: JSONValue?
    let error: String?
    let retry: () async -> Void
    @ViewBuilder let content: (JSONValue) -> Content

    var body: some View {
        if let value {
            content(value)
        } else if let error {
            ErrorStateView(message: error, retry: retry)
                .frame(maxHeight: .infinity)
        } else {
            ScrollView { SkeletonRows(rows: 8) }
                .scrollDisabled(true)
        }
    }
}

/// Demo fixtures ignore query strings; screens filter on the device there.
enum ContactsExtrasDemo {
    static var isOn: Bool {
        #if DEBUG
        DemoData.isEnabled
        #else
        false
        #endif
    }
}

/// A contact chosen in a form.
struct ContactsExtrasContactRef: Hashable, Sendable {
    let id: String
    let name: String
    let email: String?
}

/// Customers or suppliers as a searchable list; picking one closes it.
struct ContactsExtrasContactPicker: View {
    let title: String
    /// "customer", "supplier" or nil for everyone.
    var type: String?
    @Binding var selection: ContactsExtrasContactRef?

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = ContactsExtrasRemote()
    @State private var search = ""

    private var rows: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        return (remote.value?["data"]?.arrayValue ?? []).filter { row in
            let kind = row["type"]?.stringValue ?? ""
            let typeOK = type == nil || kind == type || kind == "both"
            let termOK = !ContactsExtrasDemo.isOn || term.isEmpty || (row["name"]?.stringValue ?? "").localizedCaseInsensitiveContains(term)
            return typeOK && termOK
        }
    }

    var body: some View {
        ContactsExtrasLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            List(rows, id: \.self) { row in
                Button {
                    if let id = row.recordID {
                        selection = ContactsExtrasContactRef(id: id, name: row["name"]?.stringValue ?? "Contact", email: row["email"]?.stringValue)
                    }
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Avatar(name: row["name"]?.stringValue ?? "?", size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row["name"]?.stringValue ?? "Contact")
                                .font(.system(size: 15.5, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            if let email = row["email"]?.stringValue {
                                Text(email)
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        Spacer()
                        if selection?.id == row.recordID {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(DTheme.ink)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowBackground(selection?.id == row.recordID ? DTheme.tint : DTheme.card)
            }
            .scrollContentBackground(.hidden)
            .overlay {
                if rows.isEmpty {
                    EmptyStateView(symbol: "person.2", title: "No contacts", message: search.isEmpty ? nil : "Nothing matches “\(search)”.")
                }
            }
        }
        .background(DTheme.shell)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search contacts")
        .task(id: search) {
            if !search.isEmpty { try? await Task.sleep(for: .milliseconds(250)) }
            if Task.isCancelled { return }
            await load()
        }
    }

    private func load() async {
        // `type=` matches exactly and would drop "both", so the type filter runs here.
        var query: [String: String?] = ["limit": "100", "sortBy": "name", "sortOrder": "asc"]
        let term = search.trimmingCharacters(in: .whitespaces)
        if !term.isEmpty { query["search"] = term }
        await remote.load(env.api, "contacts", query: query)
    }
}

/// A form row that opens the contact picker.
struct ContactsExtrasContactField: View {
    let label: String
    var type: String?
    @Binding var contact: ContactsExtrasContactRef?

    var body: some View {
        NavigationLink {
            ContactsExtrasContactPicker(title: label, type: type, selection: $contact)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(label)
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                    Text(contact?.name ?? "Choose a contact")
                        .font(.system(size: 16))
                        .foregroundStyle(contact == nil ? DTheme.inkTertiary : DTheme.ink)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }
}

/// The system share sheet, for files the app downloads (statement PDFs).
struct ContactsExtrasShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// A file to share, identifiable for `.sheet(item:)`.
struct ContactsExtrasSharedFile: Identifiable {
    let url: URL
    var id: URL { url }
}

/// The statement ranges people actually ask for.
enum ContactsExtrasPeriod: String, CaseIterable, Identifiable {
    case threeMonths, sixMonths, twelveMonths, thisYear, lastYear

    var id: String { rawValue }

    var label: String {
        switch self {
        case .threeMonths: "Last 3 months"
        case .sixMonths: "Last 6 months"
        case .twelveMonths: "Last 12 months"
        case .thisYear: "This year"
        case .lastYear: "Last year"
        }
    }

    /// Start and end as "YYYY-MM-DD".
    var range: (start: String, end: String) {
        let calendar = Calendar.current
        let today = Date.now
        let year = calendar.component(.year, from: today)
        func day(_ date: Date?) -> String { DubblDate.string(date ?? today) }
        switch self {
        case .threeMonths: return (day(calendar.date(byAdding: .month, value: -3, to: today)), day(today))
        case .sixMonths: return (day(calendar.date(byAdding: .month, value: -6, to: today)), day(today))
        case .twelveMonths: return (day(calendar.date(byAdding: .year, value: -1, to: today)), day(today))
        case .thisYear: return ("\(year)-01-01", day(today))
        case .lastYear: return ("\(year - 1)-01-01", "\(year - 1)-12-31")
        }
    }
}

/// A small round icon button for quick actions in a row (call, email).
struct ContactsExtrasRowButton: View {
    let symbol: String
    let label: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(DTheme.ink)
                .frame(width: 34, height: 34)
                .background(DTheme.tint, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
