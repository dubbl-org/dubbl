import Foundation
import SwiftUI

// MARK: - Auth Models

struct LoginRequest: Encodable {
    let email: String
    let password: String
    let turnstileToken: String?
}

struct RegisterRequest: Encodable {
    let name: String
    let email: String
    let password: String
    let turnstileToken: String?
}

struct AuthResponse: Decodable {
    let token: String?
    let refreshToken: String?
    let user: AuthUser?
    let error: String?
}

struct AuthUser: Decodable, Identifiable {
    let id: String
    let name: String?
    let email: String
    let image: String?
    let isSiteAdmin: Bool?
}

struct AuthOrganization: Decodable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let logo: String?
    let role: String?
}

struct OrgListResponse: Decodable {
    let data: [AuthOrganization]?
    let organizations: [AuthOrganization]?

    var items: [AuthOrganization] {
        data ?? organizations ?? []
    }
}

// MARK: - Auth State

enum AuthState: Equatable {
    case loading
    case unauthenticated
    case authenticated
    case needsOrganization

    static func == (lhs: AuthState, rhs: AuthState) -> Bool {
        switch (lhs, rhs) {
        case (.loading, .loading),
             (.unauthenticated, .unauthenticated),
             (.authenticated, .authenticated),
             (.needsOrganization, .needsOrganization):
            return true
        default:
            return false
        }
    }
}

// MARK: - Auth Manager

@MainActor
final class AuthManager: ObservableObject {
    @Published var state: AuthState = .loading
    @Published var currentUser: AuthUser?
    @Published var currentOrganization: AuthOrganization?
    @Published var organizations: [AuthOrganization] = []
    @Published var error: String?
    @Published var isLoading = false

    @Published var baseURL: String {
        didSet {
            KeychainService.shared.save(baseURL, for: .baseURL)
        }
    }

    private let keychain = KeychainService.shared
    private let apiClient = APIClient.shared

    static let shared = AuthManager()

    init() {
        #if DEBUG
        self.baseURL = KeychainService.shared.get(.baseURL) ?? "http://localhost:3000"
        #else
        self.baseURL = KeychainService.shared.get(.baseURL) ?? "https://dubbl.dev"
        #endif
        Task { await checkAuthStatus() }
    }

    // MARK: - Auth Flow

    func checkAuthStatus() async {
        guard let token = keychain.get(.authToken) else {
            state = .unauthenticated
            return
        }

        await apiClient.setAuthToken(token)

        do {
            let user: AuthUser = try await apiClient.request(
                APIEndpoint(path: "/auth/session")
            )
            currentUser = user

            if keychain.get(.organizationId) != nil {
                state = .authenticated
            } else {
                state = .needsOrganization
            }
        } catch {
            if let apiError = error as? APIError, apiError.isAuthError {
                await signOut()
            } else {
                // Network error but we have a token, try offline mode
                state = .authenticated
            }
        }
    }

    func signIn(email: String, password: String, turnstileToken: String? = nil) async {
        isLoading = true
        error = nil

        do {
            let response: AuthResponse = try await apiClient.request(
                APIEndpoint(path: "/auth/sign-in", method: .post),
                body: LoginRequest(email: email, password: password, turnstileToken: turnstileToken)
            )

            guard let token = response.token else {
                error = response.error ?? "Sign in failed"
                isLoading = false
                return
            }

            keychain.save(token, for: .authToken)
            if let refreshToken = response.refreshToken {
                keychain.save(refreshToken, for: .refreshToken)
            }

            await apiClient.setAuthToken(token)
            currentUser = response.user

            await loadOrganizations()

            if organizations.count == 1, let org = organizations.first {
                selectOrganization(org)
            } else {
                state = .needsOrganization
            }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
    }

    func signUp(name: String, email: String, password: String, turnstileToken: String? = nil) async {
        isLoading = true
        error = nil

        do {
            let response: AuthResponse = try await apiClient.request(
                APIEndpoint(path: "/auth/register", method: .post),
                body: RegisterRequest(name: name, email: email, password: password, turnstileToken: turnstileToken)
            )

            guard let token = response.token else {
                error = response.error ?? "Registration failed"
                isLoading = false
                return
            }

            keychain.save(token, for: .authToken)
            await apiClient.setAuthToken(token)
            currentUser = response.user

            await loadOrganizations()
            state = organizations.isEmpty ? .needsOrganization : .authenticated
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
    }

    func signInWithAPIKey(_ apiKey: String) async {
        isLoading = true
        error = nil

        keychain.save(apiKey, for: .apiKey)
        keychain.save(apiKey, for: .authToken)
        await apiClient.setAuthToken(apiKey)

        do {
            let user: AuthUser = try await apiClient.request(
                APIEndpoint(path: "/auth/session")
            )
            currentUser = user
            await loadOrganizations()

            if organizations.count == 1, let org = organizations.first {
                selectOrganization(org)
            } else if !organizations.isEmpty {
                state = .needsOrganization
            } else {
                state = .authenticated
            }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            keychain.delete(.apiKey)
            keychain.delete(.authToken)
        }

        isLoading = false
    }

    func signOut() async {
        keychain.clearAll()
        await apiClient.setAuthToken(nil)
        currentUser = nil
        currentOrganization = nil
        organizations = []
        state = .unauthenticated
    }

    // MARK: - OAuth

    func signInWithApple(identityToken: Data?, fullName: PersonNameComponents?, email: String?) async {
        guard let tokenData = identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            error = "Failed to get Apple identity token"
            return
        }

        isLoading = true
        error = nil

        var name: String?
        if let fullName = fullName {
            let parts = [fullName.givenName, fullName.familyName].compactMap { $0 }
            if !parts.isEmpty { name = parts.joined(separator: " ") }
        }

        do {
            let body: [String: String?] = [
                "idToken": idToken,
                "name": name,
                "email": email
            ]
            let response: AuthResponse = try await apiClient.request(
                APIEndpoint(path: "/auth/apple", method: .post),
                body: body.compactMapValues { $0 }
            )

            guard let token = response.token else {
                self.error = response.error ?? "Apple sign in failed"
                isLoading = false
                return
            }

            keychain.save(token, for: .authToken)
            if let refreshToken = response.refreshToken {
                keychain.save(refreshToken, for: .refreshToken)
            }
            await apiClient.setAuthToken(token)
            currentUser = response.user

            await loadOrganizations()
            if organizations.count == 1, let org = organizations.first {
                selectOrganization(org)
            } else {
                state = .needsOrganization
            }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
    }

    func signInWithGoogle() async {
        // Google Sign-In requires the GoogleSignIn SDK.
        // For now, open the web-based OAuth flow as a fallback.
        isLoading = true
        error = nil

        let callbackScheme = "dubbl"
        let authURL = "\(baseURL)/api/auth/signin/google?callbackUrl=\(callbackScheme)://auth/callback"

        guard let url = URL(string: authURL) else {
            error = "Invalid Google sign-in URL"
            isLoading = false
            return
        }

        await MainActor.run {
            UIApplication.shared.open(url)
        }

        isLoading = false
    }

    // MARK: - Organization

    func loadOrganizations() async {
        do {
            let response: OrgListResponse = try await apiClient.request(
                APIEndpoint(path: "/organization")
            )
            organizations = response.items

            if let savedOrgId = keychain.get(.organizationId),
               let org = organizations.first(where: { $0.id == savedOrgId }) {
                currentOrganization = org
            }
        } catch {
            // May not have orgs endpoint, try single org
            organizations = []
        }
    }

    func selectOrganization(_ org: AuthOrganization) {
        currentOrganization = org
        keychain.save(org.id, for: .organizationId)
        state = .authenticated
    }
}
