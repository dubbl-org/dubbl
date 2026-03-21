import SwiftUI

struct OrganizationPickerView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        GeometryReader { geo in
            ZStack {
                AuthBackground()

                VStack(spacing: 0) {
                    AuthBanner(compact: true)

                    // White card
                    VStack(spacing: 0) {
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 0) {
                                VStack(spacing: 4) {
                                    Text("Choose workspace")
                                        .font(.system(size: 24, weight: .bold))
                                    Text("Select an organization to continue")
                                        .font(.system(size: 14))
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                .padding(.bottom, 28)

                                if authManager.organizations.isEmpty {
                                    VStack(spacing: 8) {
                                        Image(systemName: "building.2")
                                            .font(.system(size: 28))
                                            .foregroundColor(Color(.tertiaryLabel))
                                        Text("No organizations yet")
                                            .font(.system(size: 15, weight: .medium))
                                        Text("Ask an admin to invite you.")
                                            .font(.system(size: 13))
                                            .foregroundColor(Color(.secondaryLabel))
                                    }
                                    .padding(.vertical, 32)
                                } else {
                                    VStack(spacing: 8) {
                                        ForEach(authManager.organizations) { org in
                                            Button(action: { authManager.selectOrganization(org) }) {
                                                HStack(spacing: 14) {
                                                    Text(String(org.name.prefix(1)).uppercased())
                                                        .font(.system(size: 14, weight: .bold))
                                                        .foregroundColor(Color(hex: "059669"))
                                                        .frame(width: 38, height: 38)
                                                        .background(Color(hex: "ecfdf5"))
                                                        .cornerRadius(8)

                                                    VStack(alignment: .leading, spacing: 2) {
                                                        Text(org.name)
                                                            .font(.system(size: 15, weight: .medium))
                                                            .foregroundColor(Color(.label))
                                                        if let role = org.role {
                                                            Text(role.capitalized)
                                                                .font(.system(size: 12))
                                                                .foregroundColor(Color(.secondaryLabel))
                                                        }
                                                    }

                                                    Spacer()

                                                    Image(systemName: "chevron.right")
                                                        .font(.system(size: 11, weight: .semibold))
                                                        .foregroundColor(Color(.tertiaryLabel))
                                                }
                                                .padding(12)
                                                .background(Color(.secondarySystemBackground))
                                                .cornerRadius(10)
                                            }
                                        }
                                    }
                                }

                                Spacer(minLength: 40)
                            }
                            .padding(.horizontal, 24)
                            .padding(.top, 28)
                        }

                        // Fixed bottom
                        Button(action: { Task { await authManager.signOut() } }) {
                            Text("Sign out")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(.systemRed))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .padding(.bottom, geo.safeAreaInsets.bottom > 0 ? 0 : 12)
                    }
                    .background(Color(.systemBackground))
                    .cornerRadius(24, corners: [.topLeft, .topRight])
                }
            }
        }
        .ignoresSafeArea(edges: .bottom)
    }
}
