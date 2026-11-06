import SwiftUI

/// Presented as a sheet from the overview avatar button: profile,
/// organization, appearance, security, server, help and sign out.
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.light
    @State private var editingName = false
    @State private var confirmSignOut = false
    @State private var signingOut = false
    /// The saved name, shown until the session's copy catches up.
    @State private var savedName: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 26) {
                    profile
                    organization
                    group("Appearance") {
                        SettingsAppearancePicker(selection: $appearance)
                    }
                    security
                    server
                    help
                    signOut
                    footer
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .defaultScrollAnchor(debugAnchor)
            .background(DTheme.shell)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationDestination(for: SettingsRoute.self) { route in
                switch route {
                case .organizations: SettingsOrganizationsView { dismiss() }
                }
            }
        }
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $editingName) {
            SettingsEditNameSheet(name: displayName) { savedName = $0 }
        }
        .confirmationDialog("Sign out of dubbl on this iPhone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) {
                Task {
                    signingOut = true
                    await env.session.signOut()
                    signingOut = false
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    /// Screenshots of the lower cards: DUBBL_DEMO_OPEN=settings-end.
    private var debugAnchor: UnitPoint? {
        #if DEBUG
        if DemoData.open == "settings-end" { return .bottom }
        #endif
        return nil
    }

    private var user: User? { env.session.user }
    private var displayName: String { savedName ?? user?.name ?? "" }

    // MARK: Profile

    private var profile: some View {
        Button {
            editingName = true
        } label: {
            HStack(spacing: 14) {
                Avatar(name: displayName.isEmpty ? (user?.email ?? "?") : displayName, imageURL: user?.image, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(displayName.isEmpty ? "Add your name" : displayName)
                        .displayFont(20)
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    Text(user?.email ?? "")
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Text("Edit")
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(DTheme.tint, in: Capsule())
            }
            .padding(16)
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        }
        .buttonStyle(TapScaleStyle())
        .accessibilityLabel("Edit name, \(displayName)")
    }

    // MARK: Organization

    @ViewBuilder
    private var organization: some View {
        if let org = env.session.currentOrg {
            group("Organization", inset: 62) {
                HStack(spacing: 12) {
                    Avatar(name: org.name, imageURL: org.logo, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(org.name)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(DTheme.ink)
                        Text([org.role?.rawValue.humanized, org.defaultCurrency].compactMap { $0 }.joined(separator: " · "))
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    Spacer()
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 64)

                if env.session.organizations.count > 1 {
                    NavigationLink(value: SettingsRoute.organizations) {
                        SettingsRow(symbol: "arrow.left.arrow.right", title: "Switch organization", value: "\(env.session.organizations.count)")
                    }
                    .buttonStyle(RowPressStyle())
                }
            }
        }
    }

    // MARK: Security

    private var security: some View {
        group("Security", inset: 56) {
            HStack(spacing: 12) {
                IconTile(symbol: env.lock.biometrySymbol, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Lock with \(env.lock.biometryName)")
                        .font(.system(size: 16))
                        .foregroundStyle(DTheme.ink)
                    Text(env.lock.isAvailable ? "Asks when you come back to dubbl" : "Set a passcode on this iPhone first")
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                Spacer(minLength: 8)
                Toggle("Lock with \(env.lock.biometryName)", isOn: lockBinding)
                    .labelsHidden()
                    .tint(DTheme.positive)
                    .disabled(!env.lock.isAvailable)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 60)

            linkRow(symbol: "laptopcomputer.and.iphone", title: "Signed-in devices", path: "/dashboard")
        }
        .sensoryFeedback(.selection, trigger: env.lock.isEnabled)
    }

    private var lockBinding: Binding<Bool> {
        Binding(
            get: { env.lock.isEnabled },
            set: { value in Task { await env.lock.setEnabled(value) } }
        )
    }

    // MARK: Server

    private var server: some View {
        group("Server", inset: 56) {
            HStack(spacing: 12) {
                IconTile(symbol: AppConfig.isCloud ? "cloud" : "server.rack", size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(AppConfig.isCloud ? "dubbl Cloud" : "Self-hosted")
                        .font(.system(size: 16))
                        .foregroundStyle(DTheme.ink)
                    Text(AppConfig.serverHost)
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 60)
        }
    }

    // MARK: Help

    private var help: some View {
        group("Help", inset: 56) {
            linkRow(symbol: "book", title: "Documentation", path: "/docs")
            linkRow(symbol: "safari", title: "Open dubbl on the web", path: "/dashboard")
            linkRow(symbol: "hand.raised", title: "Privacy", path: "/privacy")
            linkRow(symbol: "doc.plaintext", title: "Terms", path: "/terms")
        }
    }

    // MARK: Sign out

    private var signOut: some View {
        Button {
            confirmSignOut = true
        } label: {
            HStack {
                Spacer()
                if signingOut {
                    ProgressView()
                } else {
                    Text("Sign out")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(DTheme.negative)
                }
                Spacer()
            }
            .frame(height: 52)
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        }
        .buttonStyle(TapScaleStyle())
        .disabled(signingOut)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            DubblLogo(height: 18)
                .opacity(0.85)
            Text("dubbl for iOS")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(versionText)
                .font(.system(size: 12))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
    }

    private var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "Version \(version) (\(build))"
    }

    // MARK: Helpers

    private func group<Content: View>(_ title: String, inset: CGFloat = 16, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(title)
            CardStack(dividerInset: inset) { content() }
        }
    }

    private func linkRow(symbol: String, title: String, path: String) -> some View {
        Button {
            if let url = AppConfig.webURL(path) { openURL(url) }
        } label: {
            SettingsRow(symbol: symbol, title: title, trailingSymbol: "arrow.up.right")
        }
        .buttonStyle(RowPressStyle())
    }
}

private enum SettingsRoute: Hashable {
    case organizations
}

// MARK: - Row

/// Icon, title, optional value and a trailing glyph.
private struct SettingsRow: View {
    let symbol: String
    let title: String
    var value: String?
    var trailingSymbol = "chevron.right"

    var body: some View {
        HStack(spacing: 12) {
            IconTile(symbol: symbol, size: 30)
            Text(title)
                .font(.system(size: 16))
                .foregroundStyle(DTheme.ink)
            Spacer(minLength: 8)
            if let value {
                Text(value)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Image(systemName: trailingSymbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

// MARK: - Organizations

private struct SettingsOrganizationsView: View {
    let onSelect: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                OrganizationList(onSelect: onSelect)
                Text("Everything in the app switches to the organization you pick.")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                    .padding(.horizontal, 4)
            }
            .padding(20)
        }
        .background(DTheme.shell)
        .navigationTitle("Organizations")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Edit name

private struct SettingsEditNameSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let onSave: (String) -> Void
    @State private var name: String
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    init(name: String, onSave: @escaping (String) -> Void) {
        self.onSave = onSave
        _name = State(initialValue: name)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                CardStack {
                    FieldRow(label: "Name") {
                        TextField("Your name", text: $name)
                            .textContentType(.name)
                            .focused($focused)
                            .submitLabel(.done)
                            .onSubmit { Task { await save() } }
                    }
                }
                Text(error ?? "Shown to your team and on activity across dubbl.")
                    .font(.system(size: 13))
                    .foregroundStyle(error == nil ? DTheme.inkTertiary : DTheme.negative)
                    .padding(.horizontal, 4)
                Spacer()
            }
            .padding(20)
            .background(DTheme.shell)
            .navigationTitle("Your name")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(trimmed.isEmpty || saving)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.height(250)])
        .presentationDragIndicator(.visible)
    }

    private struct NameBody: Encodable, Sendable { var name: String }

    private func save() async {
        guard !trimmed.isEmpty, !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let _: UserResponse = try await env.api.patch("user/profile", body: NameBody(name: trimmed))
            onSave(trimmed)
            env.toast.show("Name updated")
            dismiss()
            await env.session.refreshIdentity()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Appearance

/// Three tiny phones: automatic, light and dark. The choice gets a grey tint.
private struct SettingsAppearancePicker: View {
    @Binding var selection: AppearancePreference

    var body: some View {
        HStack(spacing: 8) {
            ForEach(AppearancePreference.allCases) { option in
                let selected = selection == option
                Button {
                    withAnimation(.snappy) { selection = option }
                } label: {
                    VStack(spacing: 10) {
                        SettingsAppearanceThumbnail(option: option)
                            .frame(width: 58, height: 96)
                        HStack(spacing: 5) {
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 14))
                                .foregroundStyle(selected ? DTheme.ink : DTheme.inkTertiary)
                                .contentTransition(.symbolEffect(.replace))
                            Text(option.label)
                                .font(.system(size: 13.5, weight: selected ? .semibold : .regular))
                                .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(selected ? DTheme.tint : Color.clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(8)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A sketch of the app in one appearance; automatic is split diagonally.
private struct SettingsAppearanceThumbnail: View {
    let option: AppearancePreference

    var body: some View {
        switch option {
        case .light: screen(dark: false)
        case .dark: screen(dark: true)
        case .system:
            ZStack {
                screen(dark: false)
                screen(dark: true)
                    .mask {
                        GeometryReader { proxy in
                            Path { path in
                                path.move(to: CGPoint(x: proxy.size.width, y: 0))
                                path.addLine(to: CGPoint(x: proxy.size.width, y: proxy.size.height))
                                path.addLine(to: CGPoint(x: 0, y: proxy.size.height))
                                path.closeSubpath()
                            }
                        }
                    }
            }
        }
    }

    // Fixed colours on purpose: each thumbnail shows its own mode.
    private func screen(dark: Bool) -> some View {
        let shell = Color(hex: dark ? 0x000000 : 0xF5F5F3)
        let card = Color(hex: dark ? 0x1C1C1C : 0xFFFFFF)
        let ink = Color(hex: dark ? 0xFAFAFA : 0x0A0A0A)
        let line = Color(hex: dark ? 0x3A3A3A : 0xDEDEDC)
        let edge = Color(hex: dark ? 0x2A2A2A : 0xE2E2E0)
        return RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(shell)
            .overlay(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Capsule().fill(ink.opacity(0.85)).frame(width: 22, height: 4)
                        .padding(.top, 2)
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(card)
                        .frame(height: 28)
                        .overlay(alignment: .topLeading) {
                            VStack(alignment: .leading, spacing: 4) {
                                Capsule().fill(line).frame(width: 18, height: 3)
                                Capsule().fill(ink.opacity(0.85)).frame(width: 28, height: 5)
                            }
                            .padding(5)
                        }
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(card)
                        .frame(height: 34)
                        .overlay(alignment: .topLeading) {
                            VStack(alignment: .leading, spacing: 5) {
                                HStack(spacing: 3) {
                                    Circle().fill(line).frame(width: 7, height: 7)
                                    Capsule().fill(line).frame(width: 20, height: 3)
                                }
                                HStack(spacing: 3) {
                                    Circle().fill(line).frame(width: 7, height: 7)
                                    Capsule().fill(line).frame(width: 14, height: 3)
                                }
                            }
                            .padding(5)
                        }
                }
                .padding(7)
            }
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(edge, lineWidth: 1))
    }
}
