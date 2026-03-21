import Foundation

/// Generic paginated list view model for any entity type
@MainActor
final class ListViewModel<T: Decodable & Identifiable>: ObservableObject {
    @Published var items: [T] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String?
    @Published var searchText = ""
    @Published var selectedFilter: String?
    @Published var hasMore = true

    private var currentPage = 1
    private let pageSize = 50
    private let fetcher: (Int, Int, String?, String?) async throws -> PaginatedResponse<T>

    init(fetcher: @escaping (Int, Int, String?, String?) async throws -> PaginatedResponse<T>) {
        self.fetcher = fetcher
    }

    func load() async {
        isLoading = true
        error = nil
        currentPage = 1

        do {
            let result = try await fetcher(
                currentPage,
                pageSize,
                selectedFilter,
                searchText.isEmpty ? nil : searchText
            )
            items = result.data
            hasMore = result.hasMore ?? (result.data.count >= pageSize)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
    }

    func loadMore() async {
        guard !isLoadingMore, hasMore else { return }
        isLoadingMore = true
        currentPage += 1

        do {
            let result = try await fetcher(
                currentPage,
                pageSize,
                selectedFilter,
                searchText.isEmpty ? nil : searchText
            )
            items.append(contentsOf: result.data)
            hasMore = result.hasMore ?? (result.data.count >= pageSize)
        } catch {
            currentPage -= 1
        }

        isLoadingMore = false
    }

    func refresh() async {
        await load()
    }

    func search(_ text: String) async {
        searchText = text
        await load()
    }

    func filter(_ filter: String?) async {
        selectedFilter = filter
        await load()
    }

    func removeItem(id: T.ID) {
        items.removeAll { $0.id == id }
    }
}
