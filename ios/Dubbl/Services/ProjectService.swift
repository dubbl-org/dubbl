import Foundation

actor ProjectService {
    private let api = APIClient.shared

    // MARK: - Projects

    func list(page: Int = 1, limit: Int = 50, status: String? = nil) async throws -> PaginatedResponse<Project> {
        var query: [URLQueryItem] = []
        if let status = status { query.append(URLQueryItem(name: "status", value: status)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/projects", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func get(id: String) async throws -> Project {
        try await api.request(APIEndpoint(path: "/projects/\(id)"))
    }

    func create(_ project: ProjectCreate) async throws -> Project {
        try await api.request(APIEndpoint(path: "/projects", method: .post), body: project)
    }

    func update(id: String, _ project: ProjectCreate) async throws -> Project {
        try await api.request(APIEndpoint(path: "/projects/\(id)", method: .patch), body: project)
    }

    func delete(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/projects/\(id)", method: .delete))
    }

    // MARK: - Tasks

    func listTasks(projectId: String, page: Int = 1) async throws -> PaginatedResponse<ProjectTask> {
        try await api.requestPaginated(
            APIEndpoint(path: "/projects/\(projectId)/tasks"),
            page: page
        )
    }

    func createTask(projectId: String, _ task: TaskCreate) async throws -> ProjectTask {
        try await api.request(
            APIEndpoint(path: "/projects/\(projectId)/tasks", method: .post),
            body: task
        )
    }

    func updateTask(projectId: String, taskId: String, _ task: TaskCreate) async throws -> ProjectTask {
        try await api.request(
            APIEndpoint(path: "/projects/\(projectId)/tasks/\(taskId)", method: .patch),
            body: task
        )
    }

    // MARK: - Milestones

    func listMilestones(projectId: String) async throws -> PaginatedResponse<ProjectMilestone> {
        try await api.requestPaginated(
            APIEndpoint(path: "/projects/\(projectId)/milestones"),
            page: 1, limit: 100
        )
    }

    // MARK: - Time Entries

    func listTimeEntries(projectId: String? = nil, page: Int = 1) async throws -> PaginatedResponse<TimeEntry> {
        var query: [URLQueryItem] = []
        if let projectId = projectId { query.append(URLQueryItem(name: "projectId", value: projectId)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/time-entries", queryItems: query),
            page: page
        )
    }

    func createTimeEntry(_ entry: TimeEntryCreate) async throws -> TimeEntry {
        try await api.request(APIEndpoint(path: "/time-entries", method: .post), body: entry)
    }

    func deleteTimeEntry(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/time-entries/\(id)", method: .delete))
    }
}
