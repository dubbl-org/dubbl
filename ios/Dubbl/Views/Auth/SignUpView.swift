import SwiftUI
import AuthenticationServices

struct SignUpView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var appeared = false
    @State private var turnstileToken: String?
    @FocusState private var focus: Field?

    enum Field: Hashable { case name, email, password, confirm }

    private var passwordsMatch: Bool { !password.isEmpty && password == confirmPassword }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                AuthBackground()

                VStack(spacing: 0) {
                    AuthBanner(compact: true)

                    // ── White card ──
                    VStack(spacing: 0) {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 0) {

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Create your account")
                                        .font(.system(size: 24, weight: .bold))
                                    Text("Get started with dubbl")
                                        .font(.system(size: 14))
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                .padding(.bottom, 24)
                                .opacity(appeared ? 1 : 0)
                                .offset(y: appeared ? 0 : 8)

                                // OAuth
                                HStack(spacing: 10) {
                                    Button(action: { Task { await authManager.signInWithGoogle(); maybeDismiss() } }) {
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

                                HStack(spacing: 12) {
                                    sep
                                    Text("or continue with email")
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(.tertiaryLabel))
                                        .layoutPriority(1)
                                    sep
                                }
                                .padding(.vertical, 20)

                                // Fields
                                VStack(spacing: 10) {
                                    AuthTextField(
                                        label: "Full name",
                                        placeholder: "John Doe",
                                        text: $name,
                                        isFocused: focus == .name,
                                        contentType: .name
                                    )
                                    .focused($focus, equals: .name)
                                    .submitLabel(.next)
                                    .onSubmit { focus = .email }

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

                                    AuthPasswordField(
                                        label: "Password",
                                        placeholder: "Create a password",
                                        text: $password,
                                        isFocused: focus == .password
                                    )
                                    .focused($focus, equals: .password)
                                    .submitLabel(.next)
                                    .onSubmit { focus = .confirm }

                                    VStack(alignment: .leading, spacing: 6) {
                                        AuthPasswordField(
                                            label: "Confirm password",
                                            placeholder: "Repeat password",
                                            text: $confirmPassword,
                                            isFocused: focus == .confirm
                                        )
                                        .focused($focus, equals: .confirm)
                                        .submitLabel(.go)
                                        .onSubmit { create() }

                                        if !confirmPassword.isEmpty && !passwordsMatch {
                                            HStack(spacing: 4) {
                                                Image(systemName: "xmark.circle.fill")
                                                    .font(.system(size: 11))
                                                Text("Passwords don't match")
                                                    .font(.system(size: 12))
                                            }
                                            .foregroundColor(Color(hex: "dc2626"))
                                            .padding(.leading, 4)
                                            .padding(.top, 2)
                                        }
                                    }
                                }
                                .opacity(appeared ? 1 : 0)

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

                        // ── Fixed bottom ──
                        VStack(spacing: 0) {
                            Button(action: create) {
                                HStack(spacing: 8) {
                                    if authManager.isLoading {
                                        ProgressView().tint(.white)
                                    } else {
                                        Text("Create account")
                                            .font(.system(size: 16, weight: .semibold))
                                        Image(systemName: "arrow.right")
                                            .font(.system(size: 13, weight: .semibold))
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .foregroundColor(.white)
                                .background(canCreate ? Color(hex: "059669") : Color(hex: "059669").opacity(0.35))
                                .cornerRadius(12)
                                .shadow(color: Color(hex: "059669").opacity(canCreate ? 0.2 : 0), radius: 8, y: 4)
                            }
                            .disabled(!canCreate)
                            .padding(.horizontal, 24)
                            .padding(.top, 8)

                            Button(action: { dismiss() }) {
                                HStack(spacing: 4) {
                                    Text("Already have an account?")
                                        .foregroundColor(Color(.secondaryLabel))
                                    Text("Sign in")
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
    }

    private var sep: some View {
        Rectangle().frame(height: 0.5).foregroundColor(Color(.separator))
    }

    private var canCreate: Bool {
        !name.isEmpty && !email.isEmpty && passwordsMatch && !authManager.isLoading
            && (turnstileSiteKey == nil || turnstileToken != nil)
    }

    private func create() {
        guard canCreate else { return }
        focus = nil
        Task {
            await authManager.signUp(name: name, email: email, password: password, turnstileToken: turnstileToken)
            maybeDismiss()
        }
    }

    private func maybeDismiss() {
        if authManager.state != .unauthenticated { dismiss() }
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
                        maybeDismiss()
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
