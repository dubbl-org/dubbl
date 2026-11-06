import SwiftUI

/// /settings/email: send invoices, quotes and reminders from your own mail
/// server (SMTP) instead of dubbl's shared sender. Saving checks the login;
/// the password is never sent back, so leaving it blank keeps the saved one.
struct OrgSettingsEmailView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var config = OrgSettingsResource("email-config")
    @State private var form = Form()
    @State private var original = Form()
    @State private var saving = false
    @State private var testing = false
    @State private var confirmation: OrgSettingsConfirmation?

    struct Form: Equatable {
        var host = ""
        var port = "587"
        var username = ""
        var password = ""
        var fromEmail = ""
        var fromName = ""
        var replyTo = ""
        var useTLS = true
    }

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var saved: JSONValue? { config.value?["emailConfig"].flatMap { $0.isNull ? nil : $0 } }
    private var hasPassword: Bool { saved?.orgBool("hasPassword") ?? false }

    private var valid: Bool {
        !form.host.isEmpty && Int(form.port) != nil && !form.username.isEmpty && form.fromEmail.contains("@") && (hasPassword || !form.password.isEmpty)
    }

    var body: some View {
        OrgSettingsPage(loaded: config.isLoaded, error: config.error, reload: load) {
            status
            if !canManage {
                OrgSettingsNotice(text: OrgSettingsLevel.admin.readOnlyMessage)
            }
            OrgSettingsSection("Sender") {
                field("From email", $form.fromEmail, prompt: "billing@northwind.studio", keyboard: .emailAddress)
                field("From name", $form.fromName, prompt: "Northwind Studio", capitalization: .words)
                field("Reply-to", $form.replyTo, prompt: "Optional", keyboard: .emailAddress)
            }
            OrgSettingsSection("Mail server", footer: hasPassword ? "Leave the password empty to keep the saved one." : "Your provider lists these as SMTP settings.") {
                field("Host", $form.host, prompt: "smtp.example.com", keyboard: .URL, mono: true)
                field("Port", $form.port, prompt: "587", keyboard: .numberPad, mono: true)
                field("Username", $form.username, prompt: "Username", keyboard: .emailAddress)
                OrgSettingsField(label: "Password", text: $form.password, prompt: hasPassword ? "••••••••" : "Password", secure: true, disabled: !canManage)
                OrgSettingsToggle(title: "Use TLS", subtitle: "Encrypts the connection. Keep this on unless your server says otherwise.", isOn: $form.useTLS, disabled: !canManage)
            }
            if canManage, saved != nil {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Send a test email", symbol: "paperplane", working: testing) { Task { await test() } }
                    OrgSettingsButtonRow(title: "Stop using this server", symbol: "xmark.circle", destructive: true) {
                        confirmation = OrgSettingsConfirmation(title: "Stop using your mail server?", message: "Documents go out from dubbl's shared sender again.", action: "Remove") {
                            if await OrgSettingsRun.run(env, "Mail server removed", { try await OrgSettingsAPI.send(env, .delete, "email-config") }) {
                                form = Form()
                                await load()
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Email sending")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage, config.isLoaded {
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(form == original || !valid || saving)
                }
            }
        }
        .orgSettingsConfirm($confirmation)
        .task { await load() }
    }

    @ViewBuilder
    private var status: some View {
        if let saved {
            let verified = saved.orgBool("isVerified")
            OrgSettingsNotice(
                symbol: verified ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
                text: verified ? "Documents are sent from \(saved.orgText("fromEmail"))." : "The server didn't accept the login yet. Check the details and send a test.",
                tone: verified ? .positive : .warning
            )
        } else {
            OrgSettingsNotice(symbol: "paperplane", text: "Documents are sent from dubbl's shared address. Add your mail server to send from your own.", tone: .info)
        }
    }

    private func field(_ label: String, _ text: Binding<String>, prompt: String, keyboard: UIKeyboardType = .default, capitalization: TextInputAutocapitalization = .never, mono: Bool = false) -> some View {
        OrgSettingsField(label: label, text: text, prompt: prompt, keyboard: keyboard, capitalization: capitalization, mono: mono, disabled: !canManage)
    }

    private func load() async {
        await config.load(env)
        guard config.isLoaded else { return }
        var fresh = Form()
        if let saved {
            fresh = Form(
                host: saved.orgText("smtpHost"), port: saved.orgString("smtpPort") ?? "587", username: saved.orgText("smtpUsername"),
                password: "", fromEmail: saved.orgText("fromEmail"), fromName: saved.orgText("fromName"),
                replyTo: saved.orgText("replyTo"), useTLS: saved.orgBool("useTls", default: true)
            )
        }
        if form == original { form = fresh }
        original = fresh
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var body: [String: JSONValue] = [
            "smtpHost": .string(form.host.trimmingCharacters(in: .whitespaces)),
            "smtpPort": OrgJSON.number(Int(form.port) ?? 587),
            "smtpUsername": .string(form.username.trimmingCharacters(in: .whitespaces)),
            "fromEmail": .string(form.fromEmail.trimmingCharacters(in: .whitespaces)),
            "fromName": OrgJSON.text(form.fromName),
            "replyTo": OrgJSON.text(form.replyTo),
            "useTls": .bool(form.useTLS),
        ]
        if !form.password.isEmpty { body["smtpPassword"] = .string(form.password) }
        do {
            let response = try await OrgSettingsAPI.send(env, .put, "email-config", body: body)
            let verified = response.orgBool("emailConfig.isVerified")
            env.toast.show(verified ? "Saved and connected" : "Saved, but the server didn't accept the login", isError: !verified)
            form.password = ""
            await load()
            original = form
        } catch {
            env.toast.error(error)
        }
    }

    private func test() async {
        testing = true
        defer { testing = false }
        do {
            let response = try await OrgSettingsAPI.send(env, .post, "email-config/test")
            env.toast.show(response.orgString("message") ?? "Test email sent")
            await config.load(env)
        } catch {
            env.toast.error(error)
        }
    }
}
