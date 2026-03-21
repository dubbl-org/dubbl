import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var organization: Organization?
    @State private var members: [Member] = []
    @State private var isLoading = true
    @State private var showInvite = false
    @State private var inviteEmail = ""
    @State private var inviteRole = "member"

    private let orgService = OrganizationService()

    var body: some View {
        List {
            // Profile Section
            Section("Account") {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(Color.dubblPrimary.opacity(0.15)).frame(width: 50, height: 50)
                        Text(String(authManager.currentUser?.name?.prefix(1) ?? "U").uppercased())
                            .font(.title3).foregroundColor(.dubblPrimary)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(authManager.currentUser?.name ?? "User")
                            .font(.headline)
                        Text(authManager.currentUser?.email ?? "")
                            .font(.caption).foregroundColor(.dubblMuted)
                    }
                }
            }

            // Organization
            if let org = organization {
                Section("Organization") {
                    DetailRow(label: "Name", value: org.name)
                    if let country = org.country { DetailRow(label: "Country", value: country) }
                    DetailRow(label: "Currency", value: org.defaultCurrency ?? "USD")
                    if let taxId = org.taxId { DetailRow(label: "Tax ID", value: taxId) }
                    if let sector = org.industrySector { DetailRow(label: "Industry", value: sector) }
                }
            }

            // Members
            Section {
                ForEach(members) { member in
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(Color.dubblPrimary.opacity(0.1)).frame(width: 36, height: 36)
                            Text(String(member.user?.name?.prefix(1) ?? "?").uppercased())
                                .font(.subheadline).foregroundColor(.dubblPrimary)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(member.user?.name ?? member.user?.email ?? "Member")
                                .font(.subheadline)
                            Text(member.role?.capitalized ?? "Member")
                                .font(.caption).foregroundColor(.dubblMuted)
                        }
                    }
                }
            } header: {
                HStack {
                    Text("Members")
                    Spacer()
                    Button(action: { showInvite = true }) {
                        Image(systemName: "person.badge.plus")
                            .foregroundColor(.dubblPrimary)
                    }
                }
            }

            // Server
            Section("Connection") {
                DetailRow(label: "Server", value: authManager.baseURL)
                if let org = authManager.currentOrganization {
                    DetailRow(label: "Organization ID", value: String(org.id.prefix(8)) + "...")
                }
            }

            // Switch Org / Sign Out
            Section {
                if authManager.organizations.count > 1 {
                    Button(action: {
                        authManager.state = .needsOrganization
                    }) {
                        Label("Switch Organization", systemImage: "arrow.triangle.2.circlepath")
                            .foregroundColor(.dubblPrimary)
                    }
                }

                Button(action: {
                    Task { await authManager.signOut() }
                }) {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .foregroundColor(.dubblDestructive)
                }
            }

            // App Info
            Section("About") {
                DetailRow(label: "Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                DetailRow(label: "Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Settings")
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $showInvite) {
            InviteMemberView(onComplete: { Task { await load() } })
        }
    }

    private func load() async {
        do {
            async let orgResult = orgService.get()
            async let membersResult = orgService.listMembers()
            let (org, memberList) = try await (orgResult, membersResult)
            organization = org
            members = memberList.data
        } catch {}
        isLoading = false
    }
}

struct InviteMemberView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var role = "member"
    @State private var isSubmitting = false
    @State private var error: String?
    private let service = OrganizationService()
    var onComplete: (() -> Void)?

    var body: some View {
        NavigationView {
            Form {
                Section("Invite") {
                    TextField("Email address", text: $email)
                        .keyboardType(.emailAddress).autocapitalization(.none)
                    Picker("Role", selection: $role) {
                        Text("Member").tag("member")
                        Text("Admin").tag("admin")
                    }
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("Invite Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary) }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Send") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(email.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        do {
            try await service.invite(email: email, role: role)
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
