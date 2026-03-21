import Foundation

// MARK: - API Configuration

struct APIConfiguration {
    var baseURL: String
    var apiVersion: String = "v1"

    var apiBaseURL: String {
        "\(baseURL)/api/\(apiVersion)"
    }

    static let `default` = APIConfiguration(baseURL: "https://dubbl.dev")

    #if DEBUG
    static let development = APIConfiguration(baseURL: "http://localhost:3000")
    #endif
}

// MARK: - HTTP Method

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

// MARK: - API Endpoint

struct APIEndpoint {
    let path: String
    let method: HTTPMethod
    let queryItems: [URLQueryItem]?

    init(path: String, method: HTTPMethod = .get, queryItems: [URLQueryItem]? = nil) {
        self.path = path
        self.method = method
        self.queryItems = queryItems
    }
}

// MARK: - Paginated Response

struct PaginatedResponse<T: Decodable>: Decodable {
    let data: [T]
    let total: Int?
    let page: Int?
    let limit: Int?
    let hasMore: Bool?
}

// MARK: - API Client

actor APIClient {
    private let configuration: APIConfiguration
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var authToken: String?

    static let shared = APIClient()

    init(configuration: APIConfiguration = .default) {
        self.configuration = configuration

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 30
        sessionConfig.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: sessionConfig)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO 8601 with fractional seconds
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFormatter.date(from: dateString) { return date }

            // Try ISO 8601 without fractional seconds
            isoFormatter.formatOptions = [.withInternetDateTime]
            if let date = isoFormatter.date(from: dateString) { return date }

            // Try date-only format
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            dateFormatter.locale = Locale(identifier: "en_US_POSIX")
            if let date = dateFormatter.date(from: dateString) { return date }

            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date: \(dateString)")
        }
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
        self.encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    // MARK: - Auth Token Management

    func setAuthToken(_ token: String?) {
        self.authToken = token
    }

    func getAuthToken() -> String? {
        return authToken
    }

    // MARK: - Request Building

    private func buildRequest(endpoint: APIEndpoint, body: Data? = nil) throws -> URLRequest {
        var urlString = "\(configuration.apiBaseURL)\(endpoint.path)"

        if let queryItems = endpoint.queryItems, !queryItems.isEmpty {
            var components = URLComponents(string: urlString)
            components?.queryItems = queryItems
            guard let url = components?.url else { throw APIError.invalidURL }
            urlString = url.absoluteString
        }

        guard let url = URL(string: urlString) else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = body
        }

        return request
    }

    // MARK: - Response Handling

    private func handleResponse(_ data: Data, _ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown(0, "Invalid response")
        }

        switch httpResponse.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        case 409:
            let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data)
            throw APIError.conflict(errorResponse?.displayMessage ?? "Conflict")
        case 422:
            let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data)
            throw APIError.validationError(errorResponse?.displayMessage ?? "Validation error")
        case 429:
            throw APIError.rateLimited
        case 500...599:
            let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data)
            throw APIError.serverError(errorResponse?.displayMessage ?? "Internal server error")
        default:
            let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data)
            throw APIError.unknown(httpResponse.statusCode, errorResponse?.displayMessage ?? "Unknown error")
        }
    }

    // MARK: - Generic Requests

    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let request = try buildRequest(endpoint: endpoint)
        let (data, response) = try await session.data(for: request)
        try handleResponse(data, response)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    func request<T: Decodable, B: Encodable>(_ endpoint: APIEndpoint, body: B) async throws -> T {
        let bodyData = try encoder.encode(body)
        let request = try buildRequest(endpoint: endpoint, body: bodyData)
        let (data, response) = try await session.data(for: request)
        try handleResponse(data, response)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    func requestVoid(_ endpoint: APIEndpoint) async throws {
        let request = try buildRequest(endpoint: endpoint)
        let (data, response) = try await session.data(for: request)
        try handleResponse(data, response)
    }

    func requestVoid<B: Encodable>(_ endpoint: APIEndpoint, body: B) async throws {
        let bodyData = try encoder.encode(body)
        let request = try buildRequest(endpoint: endpoint, body: bodyData)
        let (data, response) = try await session.data(for: request)
        try handleResponse(data, response)
    }

    // MARK: - Paginated Request

    func requestPaginated<T: Decodable>(
        _ endpoint: APIEndpoint,
        page: Int = 1,
        limit: Int = 50
    ) async throws -> PaginatedResponse<T> {
        var queryItems = endpoint.queryItems ?? []
        queryItems.append(URLQueryItem(name: "page", value: "\(page)"))
        queryItems.append(URLQueryItem(name: "limit", value: "\(limit)"))
        let paginatedEndpoint = APIEndpoint(path: endpoint.path, method: endpoint.method, queryItems: queryItems)
        return try await request(paginatedEndpoint)
    }

    // MARK: - Upload

    func upload(endpoint: APIEndpoint, fileData: Data, fileName: String, mimeType: String) async throws -> Data {
        guard let url = URL(string: "\(configuration.apiBaseURL)\(endpoint.path)") else {
            throw APIError.invalidURL
        }

        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        try handleResponse(data, response)
        return data
    }
}
