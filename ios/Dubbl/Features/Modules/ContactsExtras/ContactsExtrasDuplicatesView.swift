import SwiftUI

/// Contacts that look like the same company or person (same name, email or
/// tax number). Pick the one to keep and merge the rest into it: every
/// document, payment, person and file moves across. "Not duplicates" hides a
/// group on this device, like the web.
struct ContactsExtrasDuplicatesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remote = ContactsExtrasRemote()
    @State private var keep: [String: String] = [:]
    @State private var merging: JSONValue?
    @State private var working: String?
    @State private var showDismissed = false
    @AppStorage("contacts.duplicates.dismissed") private var dismissedRaw = ""

    private var dismissed: Set<String> {
        Set(dismissedRaw.split(separator: "|").map(String.init))
    }

    private var groups: [JSONValue] {
        (remote.value?["data"]?.arrayValue ?? []).filter { showDismissed || !dismissed.contains($0["key"]?.stringValue ?? "") }
    }

    var body: some View {
        ContactsExtrasLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !groups.isEmpty {
                        let contacts = groups.reduce(0) { $0 + ($1["members"]?.arrayValue?.count ?? 0) }
                        Text("\(groups.count) \(groups.count == 1 ? "group" : "groups") · \(contacts) contacts that look like duplicates. Keep one, merge the rest.")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.horizontal, 4)
                    }
                    ForEach(groups, id: \.self) { group in
                        groupCard(group)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .refreshable { await load() }
            .overlay {
                if groups.isEmpty {
                    EmptyStateView(symbol: "person.2.badge.gearshape", title: "No duplicates", message: dismissed.isEmpty ? "Every contact looks unique." : "Every contact looks unique, apart from groups you said aren't duplicates.")
                }
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Duplicates")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Toggle("Show hidden groups", isOn: $showDismissed)
                    Button("Scan again", systemImage: "arrow.clockwise") { Task { await load() } }
                } label: {
                    Image(systemName: showDismissed ? "line.3.horizontal.decrease.circle.fill" : "ellipsis")
                }
                .accessibilityLabel("Options")
            }
        }
        .confirmationDialog(mergeTitle, isPresented: Binding(get: { merging != nil }, set: { if !$0 { merging = nil } }), titleVisibility: .visible, presenting: merging) { group in
            Button(mergeButton(group), role: .destructive) { Task { await merge(group) } }
            Button("Cancel", role: .cancel) {}
        } message: { group in
            Text("\(others(group).compactMap { $0["name"]?.stringValue }.map { "“\($0)”" }.joined(separator: ", ")) \(others(group).count == 1 ? "is" : "are") folded in: every invoice, bill, payment, quote, person and file moves across, then the duplicate is removed. This can't be undone.")
        }
        .task { await load() }
    }

    private var mergeTitle: String {
        guard let group = merging, let survivor = survivor(group) else { return "" }
        return "Merge into “\(survivor["name"]?.stringValue ?? "contact")”?"
    }

    private func mergeButton(_ group: JSONValue) -> String {
        let count = others(group).count
        return count == 1 ? "Merge them" : "Merge \(count + 1) contacts"
    }

    private func keepID(_ group: JSONValue) -> String {
        keep[group["key"]?.stringValue ?? ""] ?? group["suggestedKeepId"]?.stringValue ?? ""
    }

    private func survivor(_ group: JSONValue) -> JSONValue? {
        group["members"]?.arrayValue?.first { $0.recordID == keepID(group) }
    }

    private func others(_ group: JSONValue) -> [JSONValue] {
        (group["members"]?.arrayValue ?? []).filter { $0.recordID != keepID(group) }
    }

    private func groupCard(_ group: JSONValue) -> some View {
        let key = group["key"]?.stringValue ?? ""
        let members = group["members"]?.arrayValue ?? []
        let isDismissed = dismissed.contains(key)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(group["matched"]?.arrayValue ?? [], id: \.self) { match in
                    StatusPill(text: Self.reason(match), tone: .neutral)
                }
                Spacer()
                if isDismissed {
                    Text("Hidden")
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            .padding(.horizontal, 4)
            CardStack(dividerInset: 52) {
                ForEach(members, id: \.self) { member in
                    memberRow(member, group: group)
                }
                HStack(spacing: 10) {
                    Button {
                        toggleDismiss(key)
                    } label: {
                        Text(isDismissed ? "Show again" : "Not duplicates")
                    }
                    .buttonStyle(SoftButtonStyle(size: .small, fullWidth: true))
                    Button {
                        merging = group
                    } label: {
                        HStack(spacing: 6) {
                            if working == key { ProgressView().controlSize(.small).tint(DTheme.canvas) }
                            Text("Merge into \(survivor(group)?["name"]?.stringValue ?? "selected")")
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .small, fullWidth: true))
                    .disabled(working != nil)
                }
                .padding(12)
            }
        }
    }

    private func memberRow(_ member: JSONValue, group: JSONValue) -> some View {
        let selected = member.recordID == keepID(group)
        let suggested = member.recordID == group["suggestedKeepId"]?.stringValue
        let currency = member["currencyCode"]?.stringValue ?? env.session.currency
        return Button {
            withAnimation(.snappy) { keep[group["key"]?.stringValue ?? ""] = member.recordID }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(selected ? DTheme.ink : DTheme.inkTertiary)
                    .frame(width: 24)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(member["name"]?.stringValue ?? "Contact")
                            .font(.system(size: 15.5, weight: .semibold))
                            .foregroundStyle(DTheme.ink)
                        if suggested {
                            Text("Most records")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                                .padding(.horizontal, 6)
                                .frame(height: 18)
                                .background(DTheme.tint, in: Capsule())
                        }
                    }
                    let contactLine = [member["email"]?.stringValue, member["taxNumberHint"]?.stringValue.map { "Tax ••\($0)" }].compactMap { $0 }
                    if !contactLine.isEmpty {
                        Text(contactLine.joined(separator: " · "))
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                            .lineLimit(1)
                    }
                    Text(Self.counts(member))
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                        .lineLimit(2)
                    let owesYou = member["owesYou"]?.intValue ?? 0
                    let youOwe = member["youOwe"]?.intValue ?? 0
                    if owesYou > 0 || youOwe > 0 {
                        Text([owesYou > 0 ? "Owes you \(Money.format(owesYou, currency: currency))" : nil, youOwe > 0 ? "You owe \(Money.format(youOwe, currency: currency))" : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.system(size: 12.5, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(selected ? DTheme.tint : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    static func reason(_ match: JSONValue) -> String {
        switch match["reason"]?.stringValue {
        case "email": "Same email"
        case "taxNumber": "Same tax number"
        default: "Same name"
        }
    }

    static func counts(_ member: JSONValue) -> String {
        let parts = [("invoiceCount", "invoice"), ("billCount", "bill"), ("quoteCount", "quote"), ("paymentCount", "payment")].compactMap { key, word -> String? in
            let n = member[key]?.intValue ?? 0
            return n > 0 ? "\(n) \(word)\(n == 1 ? "" : "s")" : nil
        }
        let type = member["type"]?.stringValue.map { $0 == "both" ? "Customer and supplier" : $0.humanized } ?? ""
        let added = member["createdAt"]?.stringValue.map { "added \(DubblDate.short($0))" }
        return ([type] + (parts.isEmpty ? ["No documents"] : parts) + [added].compactMap { $0 }).filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func toggleDismiss(_ key: String) {
        var set = dismissed
        if set.contains(key) { set.remove(key) } else { set.insert(key) }
        withAnimation(.snappy) { dismissedRaw = set.sorted().joined(separator: "|") }
        if set.contains(key) { env.toast.show("We won't suggest this group again") }
    }

    private func load() async {
        await remote.load(env.api, "contacts/duplicates")
    }

    private func merge(_ group: JSONValue) async {
        guard let target = survivor(group)?.recordID else { return }
        working = group["key"]?.stringValue
        defer { working = nil }
        do {
            // The contact in the URL is merged into targetContactId.
            for member in others(group) {
                guard let id = member.recordID else { continue }
                let _: JSONValue = try await env.api.post("contacts/\(id)/merge", body: ["targetContactId": target])
            }
            env.toast.show("Merged into \(survivor(group)?["name"]?.stringValue ?? "contact")")
            await load()
        } catch {
            env.toast.error(error)
            await load()
        }
    }
}
