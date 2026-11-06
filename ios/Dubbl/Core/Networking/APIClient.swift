import Foundation

/// Talks to `<server>/api/v1`. Holds the native token pair (in the Keychain),
/// refreshes it shortly before expiry or on a 401, and stamps every request
/// with the organization the user is working in.
actor APIClient {
    enum Method: String {
        case get = "GET", post = "POST", patch = "PATCH", put = "PUT", delete = "DELETE"
    }

    private var token: AuthToken?
    private var refreshTask: Task<AuthToken, Error>?
    private(set) var organizationID: String?
    private let session: URLSession
    private var authFailureHandler: (@Sendable () -> Void)?
    private static let tokenKey = "auth_token"

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.httpCookieStorage = nil // bearer tokens only; never ride a web cookie
        session = URLSession(configuration: config)
        if let raw = KeychainStore.get(Self.tokenKey),
           let stored = try? Self.decoder.decode(AuthToken.self, from: Data(raw.utf8)) {
            token = stored
        }
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        return encoder
    }()

    // MARK: Session state

    func onAuthFailure(_ handler: @escaping @Sendable () -> Void) { authFailureHandler = handler }

    var hasToken: Bool { token != nil }
    var refreshToken: String? { token?.refreshToken }

    func setToken(_ newToken: AuthToken?) {
        token = newToken
        if let newToken, let data = try? Self.encoder.encode(newToken) {
            KeychainStore.set(String(decoding: data, as: UTF8.self), for: Self.tokenKey)
        } else {
            KeychainStore.remove(Self.tokenKey)
        }
    }

    func setOrganization(_ id: String?) { organizationID = id }

    private func validAccessToken() async throws -> String {
        if let refreshTask { return try await refreshTask.value.accessToken }
        guard let token else { failAuth(); throw APIError.unauthorized(nil) }
        if token.accessTokenExpiresAt.timeIntervalSinceNow > 60 { return token.accessToken }
        return try await refresh().accessToken
    }

    /// Refresh tokens rotate on use, so concurrent callers share one refresh.
    @discardableResult
    private func refresh() async throws -> AuthToken {
        if let refreshTask { return try await refreshTask.value }
        guard let current = token else { failAuth(); throw APIError.unauthorized(nil) }

        let task = Task<AuthToken, Error> { [session] in
            var request = URLRequest(url: try Self.url(for: "app-auth/token"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.encoder.encode([
                "grant_type": "refresh_token",
                "refresh_token": current.refreshToken,
            ])
            let data: Data
            let response: URLResponse
            do { (data, response) = try await session.data(for: request) }
            catch { throw APIError.network(error) } // offline is not a dead session
            guard let http = response as? HTTPURLResponse else { throw APIError.network(URLError(.badServerResponse)) }
            guard http.statusCode == 200 else {
                if http.statusCode >= 500 { throw APIError.network(URLError(.badServerResponse)) }
                throw APIError.unauthorized(try? Self.decoder.decode(APIErrorPayload.self, from: data))
            }
            return try Self.decoder.decode(TokenResponse.self, from: data).token
        }
        refreshTask = task
        do {
            let fresh = try await task.value
            refreshTask = nil
            setToken(fresh)
            return fresh
        } catch {
            refreshTask = nil
            if let apiError = error as? APIError, apiError.isNetwork { throw error }
            failAuth()
            throw error
        }
    }

    private func failAuth() {
        setToken(nil)
        authFailureHandler?()
    }

    // MARK: Requests

    private static func url(for path: String, query: [String: String?] = [:]) throws -> URL {
        guard var url = AppConfig.apiBaseURL else { throw APIError.notConfigured }
        for part in path.split(separator: "/") { url.append(path: String(part)) }
        let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
        if !items.isEmpty { url.append(queryItems: items.sorted { $0.name < $1.name }) }
        return url
    }

    private func buildRequest(_ method: Method, _ path: String, query: [String: String?], body: Data?, scoped: Bool = true) throws -> URLRequest {
        var request = URLRequest(url: try Self.url(for: path, query: query))
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if scoped, let organizationID { request.setValue(organizationID, forHTTPHeaderField: "x-organization-id") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func execute(_ request: URLRequest, authorized: Bool) async throws -> (Data, HTTPURLResponse) {
        var request = request
        if authorized {
            request.setValue("Bearer \(try await validAccessToken())", forHTTPHeaderField: "Authorization")
        }
        let (data, http) = try await send(request)
        guard http.statusCode == 401, authorized else { return (data, http) }

        // Refresh once and retry; a second 401 means the session is gone.
        try await refresh()
        var retry = request
        retry.setValue("Bearer \(try await validAccessToken())", forHTTPHeaderField: "Authorization")
        let (retryData, retryHTTP) = try await send(retry)
        if retryHTTP.statusCode == 401 {
            failAuth()
            throw APIError.unauthorized(try? Self.decoder.decode(APIErrorPayload.self, from: retryData))
        }
        return (retryData, retryHTTP)
    }

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw APIError.network(error) }
        guard let http = response as? HTTPURLResponse else { throw APIError.network(URLError(.badServerResponse)) }
        return (data, http)
    }

    private func validate(_ data: Data, _ http: HTTPURLResponse) throws {
        switch http.statusCode {
        case 200 ..< 300: return
        case 401: throw APIError.unauthorized(try? Self.decoder.decode(APIErrorPayload.self, from: data))
        default: throw APIError.server(status: http.statusCode, payload: try? Self.decoder.decode(APIErrorPayload.self, from: data))
        }
    }

    func request<T: Decodable & Sendable>(
        _ method: Method,
        _ path: String,
        query: [String: String?] = [:],
        bodyData: Data? = nil,
        authorized: Bool = true,
        scoped: Bool = true
    ) async throws -> T {
        #if DEBUG
        if DemoData.isEnabled {
            try? await Task.sleep(for: .milliseconds(250))
            if T.self == EmptyBody.self { return EmptyBody() as! T }
            return try Self.decoder.decode(T.self, from: DemoData.response(method: method.rawValue, path: path))
        }
        #endif
        let request = try buildRequest(method, path, query: query, body: bodyData, scoped: scoped)
        let (data, http) = try await execute(request, authorized: authorized)
        try validate(data, http)
        if T.self == EmptyBody.self { return EmptyBody() as! T }
        do { return try Self.decoder.decode(T.self, from: data) }
        catch {
            #if DEBUG
            print("Decoding \(T.self) from \(path) failed: \(error)")
            #endif
            throw APIError.decoding(error)
        }
    }

    /// `scoped: false` leaves out the organization header, for account-level
    /// routes like the organization list that change shape when it's present.
    func get<T: Decodable & Sendable>(_ path: String, query: [String: String?] = [:], scoped: Bool = true) async throws -> T {
        try await request(.get, path, query: query, scoped: scoped)
    }

    func post<T: Decodable & Sendable, B: Encodable & Sendable>(_ path: String, body: B, authorized: Bool = true) async throws -> T {
        try await request(.post, path, bodyData: try Self.encoder.encode(body), authorized: authorized)
    }

    func post<T: Decodable & Sendable>(_ path: String) async throws -> T {
        try await request(.post, path)
    }

    func patch<T: Decodable & Sendable, B: Encodable & Sendable>(_ path: String, body: B) async throws -> T {
        try await request(.patch, path, bodyData: try Self.encoder.encode(body))
    }

    func delete<T: Decodable & Sendable>(_ path: String) async throws -> T {
        try await request(.delete, path)
    }

    /// Raw bytes from an authorized route, e.g. an invoice PDF.
    func download(_ path: String, query: [String: String?] = [:]) async throws -> Data {
        #if DEBUG
        if DemoData.isEnabled { return Data() }
        #endif
        let request = try buildRequest(.get, path, query: query, body: nil)
        let (data, http) = try await execute(request, authorized: true)
        try validate(data, http)
        return data
    }

    /// POST a JSON body to a server-sent-events route and yield each event's
    /// `data:` payload. Cancelling the consuming task closes the connection,
    /// which stops the run on the server.
    func stream<B: Encodable & Sendable>(_ path: String, body: B) async throws -> AsyncThrowingStream<Data, Error> {
        var request = try buildRequest(.post, path, query: [:], body: try Self.encoder.encode(body))
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 300

        func open(_ request: URLRequest) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
            var request = request
            request.setValue("Bearer \(try await validAccessToken())", forHTTPHeaderField: "Authorization")
            let bytes: URLSession.AsyncBytes
            let response: URLResponse
            do { (bytes, response) = try await session.bytes(for: request) }
            catch { throw APIError.network(error) }
            guard let http = response as? HTTPURLResponse else { throw APIError.network(URLError(.badServerResponse)) }
            return (bytes, http)
        }

        var (bytes, http) = try await open(request)
        if http.statusCode == 401 {
            try await refresh()
            (bytes, http) = try await open(request)
            if http.statusCode == 401 { failAuth() }
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            try validate(data, http)
            throw APIError.server(status: http.statusCode, payload: nil)
        }

        let lines = bytes.lines
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await line in lines {
                        guard line.hasPrefix("data:") else { continue }
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if !payload.isEmpty { continuation.yield(Data(payload.utf8)) }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: (error as? URLError)?.code == .cancelled ? CancellationError() : APIError.network(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// PUT a file straight to a presigned storage URL (no dubbl auth involved).
    func upload(_ data: Data, to url: URL, contentType: String) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120
        let response: URLResponse
        do { (_, response) = try await session.upload(for: request, from: data) }
        catch { throw APIError.network(error) }
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw APIError.server(status: (response as? HTTPURLResponse)?.statusCode ?? 0, payload: nil)
        }
    }

    // MARK: Native sign-in

    struct CodeExchange: Encodable, Sendable {
        var grantType = "authorization_code"
        var code: String
        var codeVerifier: String
        var redirectURI: String

        enum CodingKeys: String, CodingKey {
            case grantType = "grant_type", code, codeVerifier = "code_verifier", redirectURI = "redirect_uri"
        }
    }

    /// Trade the code from /app-authorize (plus its PKCE verifier) for tokens.
    func exchange(code: String, verifier: String) async throws -> TokenResponse {
        let body = CodeExchange(code: code, codeVerifier: verifier, redirectURI: AppConfig.redirectURI)
        let response: TokenResponse = try await post("app-auth/token", body: body, authorized: false)
        setToken(response.token)
        return response
    }

    /// End this device's session on the server, then forget the tokens.
    func revoke() async {
        if let token {
            var request = try? buildRequest(.post, "app-auth/revoke", query: [:], body: try? Self.encoder.encode(["refresh_token": token.refreshToken]))
            request?.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
            if let request { _ = try? await send(request) }
        }
        setToken(nil)
    }
}
