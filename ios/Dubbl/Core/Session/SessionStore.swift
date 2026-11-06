import Foundation
import Observation

enum SessionPhase: Equatable {
    case launching
    case loggedOut
    /// Signed in, but the server can't be reached. Tokens are kept.
    case unreachable
    /// Signed in with no organization yet: setup happens on the web.
    case noOrganization
    case selectOrg
    case ready
}

@MainActor @Observable
final class SessionStore {
    let api: APIClient

    private(set) var phase: SessionPhase = .launching
    private(set) var user: User?
    private(set) var organizations: [Organization] = []
    private(set) var currentOrg: Organization?
    /// Set when the server ended the session, so sign-in can say why.
    private(set) var wasSignedOutBySession = false
    private(set) var isSigningIn = false

    /// Bumped on every org switch so screens reload their data.
    private(set) var orgGeneration = 0

    private let webSignIn = WebSignIn()

    init(api: APIClient) {
        self.api = api
        Task { [weak self, api] in
            await api.onAuthFailure {
                Task { @MainActor in self?.handleAuthFailure() }
            }
        }
    }

    var currency: String { currentOrg?.defaultCurrency ?? "USD" }

    var canManage: Bool {
        guard let role = currentOrg?.role else { return false }
        return role == .owner || role == .admin
    }

    // MARK: Lifecycle

    func bootstrap() async {
        #if DEBUG
        if DemoData.isEnabled {
            await previewReady(user: DemoData.user, org: DemoData.organization)
            organizations = (try? await api.get("organization", scoped: false) as OrganizationsResponse)?.organizations ?? organizations
            return
        }
        #endif
        guard await api.hasToken else {
            phase = .loggedOut
            return
        }
        do {
            try await loadIdentity()
            await enterApp()
        } catch let error as APIError {
            if case .unauthorized = error {
                wasSignedOutBySession = true
                await clearSession()
            } else {
                phase = .unreachable
            }
        } catch {
            phase = .unreachable
        }
    }

    func signIn(createAccount: Bool = false) async throws {
        isSigningIn = true
        defer { isSigningIn = false }
        let result = try await webSignIn.run(createAccount: createAccount)
        let response = try await api.exchange(code: result.code, verifier: result.verifier)
        wasSignedOutBySession = false
        user = response.user
        try await loadIdentity()
        await enterApp()
    }

    func signOut() async {
        await api.revoke()
        wasSignedOutBySession = false
        await clearSession()
    }

    /// Re-read the user and organizations (also used to retry when offline,
    /// and after the user finishes setup on the web).
    func refreshIdentity() async {
        do {
            try await loadIdentity()
            await enterApp()
        } catch let error as APIError {
            if case .unauthorized = error { await clearSession() } else if phase != .ready { phase = .unreachable }
        } catch {
            if phase != .ready { phase = .unreachable }
        }
    }

    private func loadIdentity() async throws {
        async let profile: UserResponse = api.get("user/profile", scoped: false)
        async let orgs: OrganizationsResponse = api.get("organization", scoped: false)
        let (profileResult, orgsResult) = try await (profile, orgs)
        user = profileResult.user
        organizations = orgsResult.organizations.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func enterApp() async {
        if let current = currentOrg, let fresh = organizations.first(where: { $0.id == current.id }) {
            currentOrg = fresh
            phase = .ready
            return
        }
        if organizations.isEmpty {
            phase = .noOrganization
        } else if let last = AppConfig.lastOrganizationID, let org = organizations.first(where: { $0.id == last }) {
            await select(org)
        } else if organizations.count == 1 {
            await select(organizations[0])
        } else {
            phase = .selectOrg
        }
    }

    /// Switch the organization every request is scoped to. The header is set
    /// before any screen sees the change, so nothing loads the old org's data.
    func select(_ org: Organization) async {
        await api.setOrganization(org.id)
        let changed = currentOrg?.id != org.id
        currentOrg = org
        AppConfig.lastOrganizationID = org.id
        if changed { orgGeneration += 1 }
        phase = .ready
    }

    private func handleAuthFailure() {
        if phase == .ready || phase == .selectOrg || phase == .noOrganization { wasSignedOutBySession = true }
        Task { await clearSession() }
    }

    private func clearSession() async {
        await api.setToken(nil)
        await api.setOrganization(nil)
        user = nil
        organizations = []
        currentOrg = nil
        phase = .loggedOut
    }

    #if DEBUG
    /// Lets previews and simulator screenshots render signed-in screens.
    func previewReady(user: User, org: Organization) async {
        self.user = user
        organizations = [org]
        await select(org)
    }
    #endif
}
