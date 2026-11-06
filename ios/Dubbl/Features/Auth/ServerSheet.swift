import SwiftUI

/// Choose the dubbl server: Cloud, a self-hosted origin, or a local dev server.
struct ServerSheet: View {
    @Environment(\.dismiss) private var dismiss

    private enum Choice: Hashable { case cloud, selfHosted, local }

    @State private var choice: Choice
    @State private var origin: String
    @State private var checking = false
    @State private var error: String?

    init() {
        let current = AppConfig.serverOrigin
        if current == AppConfig.cloudOrigin {
            _choice = State(initialValue: .cloud)
            _origin = State(initialValue: "")
        } else if current == AppConfig.localOrigin {
            _choice = State(initialValue: .local)
            _origin = State(initialValue: "")
        } else {
            _choice = State(initialValue: .selfHosted)
            _origin = State(initialValue: current)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("dubbl is open source. Use dubbl Cloud or point the app at your own server.")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                        .padding(.horizontal, 4)

                    CardStack(dividerInset: 54) {
                        option(.cloud, symbol: "cloud", title: "dubbl Cloud", subtitle: "dubbl.dev")
                        option(.selfHosted, symbol: "server.rack", title: "Self-hosted", subtitle: "Your own dubbl server")
                        option(.local, symbol: "laptopcomputer", title: "Local development", subtitle: "localhost:3000")
                    }

                    if choice == .selfHosted {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("Server address")
                            TextField("books.example.com", text: $origin)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.URL)
                                .textContentType(.URL)
                                .font(.system(size: 16))
                                .padding(.horizontal, 16)
                                .frame(height: 50)
                                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(DTheme.hairline, lineWidth: 0.5))
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
                .animation(.snappy(duration: 0.25), value: choice)
            }
            .background(DTheme.shell)
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if checking { ProgressView() } else { Text("Save") }
                    }
                    .disabled(checking || (choice == .selfHosted && origin.trimmingCharacters(in: .whitespaces).isEmpty))
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func option(_ value: Choice, symbol: String, title: String, subtitle: String) -> some View {
        Button {
            choice = value
            error = nil
        } label: {
            HStack(spacing: 12) {
                IconTile(symbol: symbol, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(DTheme.ink)
                    Text(subtitle).font(.system(size: 13)).foregroundStyle(DTheme.inkSecondary)
                }
                Spacer()
                if choice == value {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(DTheme.ink)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 60)
        }
        .buttonStyle(RowPressStyle())
        .sensoryFeedback(.selection, trigger: choice)
    }

    private func save() async {
        let target: String
        switch choice {
        case .cloud: target = AppConfig.cloudOrigin
        case .local: target = AppConfig.localOrigin
        case .selfHosted: target = AppConfig.normalizeOrigin(origin)
        }
        guard let url = URL(string: target)?.appending(path: "api/health") else {
            error = "That doesn't look like a server address."
            return
        }
        checking = true
        defer { checking = false }
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                error = "That server didn't answer like dubbl."
                return
            }
            AppConfig.serverOrigin = target
            dismiss()
        } catch {
            self.error = "Couldn't reach \(URL(string: target)?.host() ?? target)."
        }
    }
}
