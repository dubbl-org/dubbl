import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var email = ""
    @State private var password = ""
    @State private var showSignUp = false
    @State private var showAPIKeyLogin = false
    @State private var apiKey = ""
    @State private var showServerConfig = false

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // Logo & Branding
                VStack(spacing: 12) {
                    Image(systemName: "chart.bar.doc.horizontal")
                        .font(.system(size: 56))
                        .foregroundColor(.dubblPrimary)
                    Text("dubbl")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(.primary)
                    Text("Open-source accounting")
                        .font(.subheadline)
                        .foregroundColor(.dubblMuted)
                }
                .padding(.top, 60)

                // Login Form
                VStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        TextField("you@example.com", text: $email)
                            .textFieldStyle(DubblTextFieldStyle())
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .autocorrectionDisabled()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Password")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        SecureField("Enter your password", text: $password)
                            .textFieldStyle(DubblTextFieldStyle())
                            .textContentType(.password)
                    }

                    if let error = authManager.error {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.dubblDestructive)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button(action: {
                        Task { await authManager.signIn(email: email, password: password) }
                    }) {
                        if authManager.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Sign In")
                        }
                    }
                    .buttonStyle(DubblButtonStyle())
                    .disabled(email.isEmpty || password.isEmpty || authManager.isLoading)
                }
                .padding(.horizontal, 24)

                // Divider
                HStack {
                    Rectangle().frame(height: 1).foregroundColor(.dubblBorder)
                    Text("or")
                        .font(.caption)
                        .foregroundColor(.dubblMuted)
                    Rectangle().frame(height: 1).foregroundColor(.dubblBorder)
                }
                .padding(.horizontal, 24)

                // API Key Login
                VStack(spacing: 12) {
                    Button(action: { showAPIKeyLogin.toggle() }) {
                        Label("Sign in with API Key", systemImage: "key")
                    }
                    .buttonStyle(DubblButtonStyle(isPrimary: false))

                    if showAPIKeyLogin {
                        VStack(spacing: 12) {
                            TextField("Paste your API key", text: $apiKey)
                                .textFieldStyle(DubblTextFieldStyle())
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                            Button("Connect") {
                                Task { await authManager.signInWithAPIKey(apiKey) }
                            }
                            .buttonStyle(DubblButtonStyle())
                            .disabled(apiKey.isEmpty)
                        }
                    }
                }
                .padding(.horizontal, 24)

                // Sign Up
                Button(action: { showSignUp = true }) {
                    HStack(spacing: 4) {
                        Text("Don't have an account?")
                            .foregroundColor(.dubblMuted)
                        Text("Sign Up")
                            .foregroundColor(.dubblPrimary)
                            .fontWeight(.semibold)
                    }
                    .font(.subheadline)
                }

                // Server Configuration
                Button(action: { showServerConfig.toggle() }) {
                    Label("Server Settings", systemImage: "server.rack")
                        .font(.caption)
                        .foregroundColor(.dubblMuted)
                }

                if showServerConfig {
                    VStack(spacing: 8) {
                        Text("Server URL")
                            .font(.caption)
                            .foregroundColor(.dubblMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        TextField("https://dubbl.dev", text: $authManager.baseURL)
                            .textFieldStyle(DubblTextFieldStyle())
                            .autocapitalization(.none)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                        Text("For self-hosted instances, enter your server URL")
                            .font(.caption2)
                            .foregroundColor(.dubblMuted)
                    }
                    .padding(.horizontal, 24)
                }

                Spacer(minLength: 40)
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .sheet(isPresented: $showSignUp) {
            SignUpView()
                .environmentObject(authManager)
        }
    }
}

struct SignUpView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    private var passwordsMatch: Bool {
        !password.isEmpty && password == confirmPassword
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "chart.bar.doc.horizontal")
                            .font(.system(size: 40))
                            .foregroundColor(.dubblPrimary)
                        Text("Create Account")
                            .font(.title2)
                            .fontWeight(.bold)
                    }
                    .padding(.top, 24)

                    VStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Name")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            TextField("Your full name", text: $name)
                                .textFieldStyle(DubblTextFieldStyle())
                                .textContentType(.name)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Email")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            TextField("you@example.com", text: $email)
                                .textFieldStyle(DubblTextFieldStyle())
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Password")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            SecureField("Create a password", text: $password)
                                .textFieldStyle(DubblTextFieldStyle())
                                .textContentType(.newPassword)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Confirm Password")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            SecureField("Confirm your password", text: $confirmPassword)
                                .textFieldStyle(DubblTextFieldStyle())
                                .textContentType(.newPassword)
                            if !confirmPassword.isEmpty && !passwordsMatch {
                                Text("Passwords do not match")
                                    .font(.caption)
                                    .foregroundColor(.dubblDestructive)
                            }
                        }

                        if let error = authManager.error {
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.dubblDestructive)
                        }

                        Button(action: {
                            Task {
                                await authManager.signUp(name: name, email: email, password: password)
                                if authManager.state != .unauthenticated {
                                    dismiss()
                                }
                            }
                        }) {
                            if authManager.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Create Account")
                            }
                        }
                        .buttonStyle(DubblButtonStyle())
                        .disabled(name.isEmpty || email.isEmpty || !passwordsMatch || authManager.isLoading)
                    }
                    .padding(.horizontal, 24)
                }
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(.dubblPrimary)
                }
            }
        }
    }
}
