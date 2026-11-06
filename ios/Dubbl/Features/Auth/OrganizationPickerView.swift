import SwiftUI

/// Shown after sign-in when the user belongs to several organizations and
/// hasn't picked one on this device yet.
struct OrganizationPickerView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ZStack {
            DTheme.shell.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Choose an organization").displayFont(28).foregroundStyle(DTheme.ink)
                        Text("You can switch any time from the overview.")
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .padding(.top, 40)
                    .padding(.horizontal, 4)

                    OrganizationList()
                }
                .padding(20)
            }
        }
    }
}

/// The user's organizations as a card of rows. Tapping one switches to it.
struct OrganizationList: View {
    @Environment(AppEnvironment.self) private var env
    var onSelect: (() -> Void)?

    var body: some View {
        CardStack(dividerInset: 62) {
            ForEach(env.session.organizations) { org in
                Button {
                    Task {
                        await env.session.select(org)
                        onSelect?()
                    }
                } label: {
                    HStack(spacing: 12) {
                        Avatar(name: org.name, imageURL: org.logo, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(org.name).font(.system(size: 16, weight: .medium)).foregroundStyle(DTheme.ink)
                            Text([org.role?.rawValue.humanized, org.defaultCurrency].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                        Spacer()
                        if org.id == env.session.currentOrg?.id {
                            Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(DTheme.ink)
                        } else {
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 64)
                }
                .buttonStyle(RowPressStyle())
            }
        }
    }
}
