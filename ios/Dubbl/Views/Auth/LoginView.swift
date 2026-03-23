import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var email = ""
    @State private var password = ""
    @State private var showSignUp = false
    @State private var appeared = false
    @State private var turnstileToken: String?
    @FocusState private var focus: Field?

    enum Field: Hashable { case email, password }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                AuthBackground()

                VStack(spacing: 0) {
                    AuthBanner()

                    // ── White card area (rounded top corners, fills rest of screen) ──
                    VStack(spacing: 0) {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 0) {

                                // Heading
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Welcome back")
                                        .font(.system(size: 24, weight: .bold))
                                    Text("Sign in to your account")
                                        .font(.system(size: 14))
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                .padding(.bottom, 24)
                                .opacity(appeared ? 1 : 0)
                                .offset(y: appeared ? 0 : 8)

                                // OAuth
                                HStack(spacing: 10) {
                                    Button(action: { Task { await authManager.signInWithGoogle() } }) {
                                        HStack(spacing: 8) {
                                            GoogleIcon(size: 16)
                                            Text("Google")
                                                .font(.system(size: 14, weight: .medium))
                                        }
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 44)
                                        .foregroundColor(Color(.label))
                                        .background(Color(.systemBackground))
                                        .cornerRadius(10)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(Color(.separator), lineWidth: 1)
                                        )
                                    }

                                    Button(action: { triggerAppleSignIn() }) {
                                        HStack(spacing: 8) {
                                            AppleIcon(size: 16)
                                            Text("Apple")
                                                .font(.system(size: 14, weight: .medium))
                                        }
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 44)
                                        .foregroundColor(Color(.label))
                                        .background(Color(.systemBackground))
                                        .cornerRadius(10)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(Color(.separator), lineWidth: 1)
                                        )
                                    }
                                }
                                .opacity(appeared ? 1 : 0)

                                // Separator
                                HStack(spacing: 12) {
                                    sep
                                    Text("or continue with email")
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(.tertiaryLabel))
                                        .layoutPriority(1)
                                    sep
                                }
                                .padding(.vertical, 20)

                                // Email
                                AuthTextField(
                                    label: "Email",
                                    placeholder: "you@example.com",
                                    text: $email,
                                    isFocused: focus == .email,
                                    contentType: .emailAddress,
                                    keyboard: .emailAddress
                                )
                                .focused($focus, equals: .email)
                                .submitLabel(.next)
                                .onSubmit { focus = .password }

                                // Password
                                AuthPasswordField(
                                    label: "Password",
                                    placeholder: "Your password",
                                    text: $password,
                                    isFocused: focus == .password
                                )
                                .focused($focus, equals: .password)
                                .submitLabel(.go)
                                .onSubmit { signIn() }
                                .padding(.top, 4)

                                // Error
                                if let error = authManager.error {
                                    HStack(spacing: 8) {
                                        Image(systemName: "exclamationmark.triangle.fill")
                                            .font(.system(size: 12))
                                        Text(error)
                                            .font(.system(size: 13))
                                    }
                                    .foregroundColor(Color(hex: "dc2626"))
                                    .padding(12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(hex: "fef2f2"))
                                    .cornerRadius(8)
                                    .padding(.top, 12)
                                }

                                // Turnstile captcha
                                if let siteKey = turnstileSiteKey {
                                    TurnstileView(
                                        siteKey: siteKey,
                                        onToken: { token in turnstileToken = token },
                                        onError: { _ in turnstileToken = nil }
                                    )
                                    .frame(height: 65)
                                    .cornerRadius(8)
                                    .padding(.top, 16)
                                }

                                Spacer(minLength: 24)
                            }
                            .padding(.horizontal, 24)
                            .padding(.top, 28)
                        }

                        // ── Fixed bottom bar ──
                        VStack(spacing: 0) {
                            // Sign in button
                            Button(action: signIn) {
                                HStack(spacing: 8) {
                                    if authManager.isLoading {
                                        ProgressView().tint(.white)
                                    } else {
                                        Text("Sign in")
                                            .font(.system(size: 16, weight: .semibold))
                                        Image(systemName: "arrow.right")
                                            .font(.system(size: 13, weight: .semibold))
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .foregroundColor(.white)
                                .background(canSignIn ? Color(hex: "059669") : Color(hex: "059669").opacity(0.35))
                                .cornerRadius(12)
                                .shadow(color: Color(hex: "059669").opacity(canSignIn ? 0.2 : 0), radius: 8, y: 4)
                            }
                            .disabled(!canSignIn)
                            .padding(.horizontal, 24)
                            .padding(.top, 8)

                            // Sign up link
                            Button(action: { showSignUp = true }) {
                                HStack(spacing: 4) {
                                    Text("Don't have an account?")
                                        .foregroundColor(Color(.secondaryLabel))
                                    Text("Sign up")
                                        .foregroundColor(Color(hex: "059669"))
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .font(.system(size: 14))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                            }
                        }
                        .padding(.bottom, geo.safeAreaInsets.bottom > 0 ? 0 : 12)
                    }
                    .background(Color(.systemBackground))
                    .cornerRadius(24, corners: [.topLeft, .topRight])
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeOut(duration: 0.4).delay(0.1)) { appeared = true }
        }
        .onTapGesture { focus = nil }
        .fullScreenCover(isPresented: $showSignUp) {
            SignUpView().environmentObject(authManager)
        }
    }

    private var sep: some View {
        Rectangle().frame(height: 0.5).foregroundColor(Color(.separator))
    }

    private var canSignIn: Bool {
        !email.isEmpty && !password.isEmpty && !authManager.isLoading
            && (turnstileSiteKey == nil || turnstileToken != nil)
    }

    private func signIn() {
        guard canSignIn else { return }
        focus = nil
        Task { await authManager.signIn(email: email, password: password, turnstileToken: turnstileToken) }
    }

    private func triggerAppleSignIn() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        let delegate = AppleSignInCoordinator { result in
            switch result {
            case .success(let auth):
                if let cred = auth.credential as? ASAuthorizationAppleIDCredential {
                    Task {
                        await authManager.signInWithApple(
                            identityToken: cred.identityToken,
                            fullName: cred.fullName,
                            email: cred.email
                        )
                    }
                }
            case .failure(let error):
                if (error as? ASAuthorizationError)?.code != .canceled {
                    authManager.error = error.localizedDescription
                }
            }
        }
        controller.delegate = delegate
        AppleSignInCoordinator.retained = delegate
        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = scene.windows.first {
            let provider = WindowProvider(window: window)
            controller.presentationContextProvider = provider
            WindowProvider.retained = provider
        }
        controller.performRequests()
    }
}

// MARK: - Rounded specific corners

extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCornerShape(radius: radius, corners: corners))
    }
}

struct RoundedCornerShape: Shape {
    var radius: CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}

// MARK: - Apple auth helpers

class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate {
    static var retained: AppleSignInCoordinator?
    let handler: (Result<ASAuthorization, Error>) -> Void

    init(handler: @escaping (Result<ASAuthorization, Error>) -> Void) {
        self.handler = handler
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        handler(.success(authorization))
        Self.retained = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        handler(.failure(error))
        Self.retained = nil
    }
}

class WindowProvider: NSObject, ASAuthorizationControllerPresentationContextProviding {
    static var retained: WindowProvider?
    let window: UIWindow
    init(window: UIWindow) { self.window = window }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { window }
}
