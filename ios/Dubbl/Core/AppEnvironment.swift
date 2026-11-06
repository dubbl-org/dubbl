import Observation

/// The app's root object graph, injected with `.environment(env)`.
@MainActor @Observable
final class AppEnvironment {
    let api: APIClient
    let session: SessionStore
    let lock: AppLock
    let toast: ToastCenter
    let router: AppRouter

    init() {
        let api = APIClient()
        self.api = api
        session = SessionStore(api: api)
        lock = AppLock()
        toast = ToastCenter()
        router = AppRouter()
    }
}
