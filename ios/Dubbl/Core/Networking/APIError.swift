import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case forbidden
    case notFound
    case conflict(String)
    case validationError(String)
    case serverError(String)
    case networkError(Error)
    case decodingError(Error)
    case rateLimited
    case unknown(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .unauthorized:
            return "Session expired. Please sign in again."
        case .forbidden:
            return "You don't have permission to perform this action."
        case .notFound:
            return "The requested resource was not found."
        case .conflict(let message):
            return message
        case .validationError(let message):
            return message
        case .serverError(let message):
            return "Server error: \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError:
            return "Failed to process server response."
        case .rateLimited:
            return "Too many requests. Please try again later."
        case .unknown(let code, let message):
            return "Error \(code): \(message)"
        }
    }

    var isAuthError: Bool {
        if case .unauthorized = self { return true }
        return false
    }
}

struct APIErrorResponse: Decodable {
    let error: String?
    let message: String?

    var displayMessage: String {
        error ?? message ?? "Unknown error"
    }
}
