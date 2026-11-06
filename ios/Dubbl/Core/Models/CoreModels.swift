import Foundation

// MARK: - Auth

/// The token pair the app holds for its native session. `/app-auth/token`
/// answers with `expires_in`; the absolute expiry is fixed when it arrives.
struct AuthToken: Codable, Sendable {
    var accessToken: String
    var refreshToken: String
    var accessTokenExpiresAt: Date
}

struct TokenResponse: Decodable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var user: User?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }

    var token: AuthToken {
        AuthToken(
            accessToken: accessToken,
            refreshToken: refreshToken,
            accessTokenExpiresAt: Date().addingTimeInterval(TimeInterval(expiresIn))
        )
    }
}

// MARK: - Errors

/// Every route answers errors as `{ error }`; the token endpoint adds an
/// OAuth-style `error_description`.
struct APIErrorPayload: Decodable, Sendable {
    var error: String?
    var errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case error
        case errorDescription = "error_description"
    }

    var message: String? { errorDescription ?? error }
}

enum APIError: Error, LocalizedError {
    case notConfigured
    case unauthorized(APIErrorPayload?)
    case server(status: Int, payload: APIErrorPayload?)
    case network(Error)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "No server is set up yet."
        case let .unauthorized(payload): payload?.message ?? "Your session has expired. Please sign in again."
        case let .server(status, payload): payload?.message ?? "The server returned an error (\(status))."
        case .network: "Couldn't reach the server. Check your connection."
        case .decoding: "The server's response couldn't be read."
        }
    }

    var isNetwork: Bool {
        if case .network = self { return true }
        return false
    }
}

// MARK: - Envelopes

struct Pagination: Codable, Sendable, Hashable {
    var page: Int
    var limit: Int
    var total: Int
    var totalPages: Int
}

/// The standard paginated list: `{ data, pagination }`.
struct Page<T: Decodable & Sendable>: Decodable, Sendable {
    var data: [T]
    var pagination: Pagination?

    var hasMore: Bool {
        guard let pagination else { return false }
        return pagination.page < pagination.totalPages
    }
}

struct SuccessResponse: Decodable, Sendable {
    var success: Bool?
}

struct EmptyBody: Codable, Sendable {}

// MARK: - Account

struct User: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var name: String?
    var email: String
    var image: String?

    var displayName: String { name?.isEmpty == false ? name! : email }
}

struct UserResponse: Decodable, Sendable {
    var user: User
}

enum MemberRole: String, Codable, Sendable {
    case owner, admin, member
}

/// An organization from the list endpoint, with the user's role in it.
struct Organization: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var name: String
    var slug: String?
    var logo: String?
    var defaultCurrency: String
    var countryCode: String?
    var role: MemberRole?
    var memberCount: Int?
}

struct OrganizationsResponse: Decodable, Sendable {
    var organizations: [Organization]
}

// MARK: - Lenient numbers

/// Report totals are numbers, but a few SQL aggregates arrive as strings.
/// Decodes either, so one odd field never sinks a whole screen.
@propertyWrapper
struct LenientInt: Codable, Sendable, Hashable {
    var wrappedValue: Int

    init(wrappedValue: Int) { self.wrappedValue = wrappedValue }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) {
            wrappedValue = int
        } else if let double = try? container.decode(Double.self) {
            wrappedValue = Int(double.rounded())
        } else if let string = try? container.decode(String.self), let double = Double(string) {
            wrappedValue = Int(double.rounded())
        } else if container.decodeNil() {
            wrappedValue = 0
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected a number")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

extension KeyedDecodingContainer {
    /// A missing key decodes as 0 rather than failing.
    func decode(_ type: LenientInt.Type, forKey key: Key) throws -> LenientInt {
        try decodeIfPresent(type, forKey: key) ?? LenientInt(wrappedValue: 0)
    }
}
