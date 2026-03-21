import SwiftUI

struct OrganizationPickerView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Image(systemName: "building.2")
                        .font(.system(size: 40))
                        .foregroundColor(.dubblPrimary)
                    Text("Select Organization")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("Choose which organization to work with")
                        .font(.subheadline)
                        .foregroundColor(.dubblMuted)
                }
                .padding(.top, 40)

                if authManager.organizations.isEmpty {
                    EmptyStateView(
                        icon: "building.2",
                        title: "No Organizations",
                        message: "You don't belong to any organizations yet. Ask an admin to invite you."
                    )
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(authManager.organizations) { org in
                                Button(action: { authManager.selectOrganization(org) }) {
                                    HStack(spacing: 14) {
                                        ZStack {
                                            Circle()
                                                .fill(Color.dubblPrimary.opacity(0.15))
                                                .frame(width: 44, height: 44)
                                            Text(String(org.name.prefix(1)).uppercased())
                                                .font(.headline)
                                                .foregroundColor(.dubblPrimary)
                                        }
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(org.name)
                                                .font(.headline)
                                                .foregroundColor(.primary)
                                            if let role = org.role {
                                                Text(role.capitalized)
                                                    .font(.caption)
                                                    .foregroundColor(.dubblMuted)
                                            }
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.dubblMuted)
                                    }
                                    .padding(16)
                                    .background(Color.dubblCardBackground)
                                    .cornerRadius(10)
                                    .shadow(color: .black.opacity(0.04), radius: 4, x: 0, y: 2)
                                }
                            }
                        }
                        .padding(.horizontal, 24)
                    }
                }

                Spacer()

                Button(action: {
                    Task { await authManager.signOut() }
                }) {
                    Text("Sign Out")
                }
                .buttonStyle(DubblButtonStyle(isPrimary: false, isDestructive: true))
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }
}
