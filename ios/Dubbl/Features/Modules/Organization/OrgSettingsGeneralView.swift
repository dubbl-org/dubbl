import SwiftUI

/// /settings: the organization's name, legal details, address, contact,
/// base currency, fiscal year and the books' lock date. Only the owner can
/// save (the route needs `manage:billing`); everyone else reads.
struct OrgSettingsGeneralView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var resource = OrgSettingsResource(Self.path)
    @State private var lock = OrgSettingsResource("period-lock")
    @State private var form = Form()
    @State private var original = Form()
    @State private var saving = false
    @State private var confirmCurrency = false

    /// The organization route answers the org list without an org header and a
    /// single org with one. Demo fixtures can't tell those apart, so demo mode
    /// reads a separate fixture.
    private static var path: String {
        #if DEBUG
        if DemoData.isEnabled { return "organization/demo-org" }
        #endif
        return "organization"
    }

    private var canEdit: Bool { OrgSettingsAccess.allows(.owner, env) }
    private var dirty: Bool { form != original }

    /// Every field the screen edits, as the web form holds them.
    struct Form: Equatable {
        var name = ""
        var countryCode: String?
        var taxId = ""
        var registrationNumber = ""
        var industry = ""
        var street = ""
        var city = ""
        var state = ""
        var postalCode = ""
        var addressCountry = ""
        var phone = ""
        var email = ""
        var website = ""
        var currency = "USD"
        var fiscalMonth = 1
        var paymentTerms = ""
        var lockDate: Date?

        init() {}

        init(_ org: JSONValue, lock: JSONValue?) {
            name = org.orgText("name")
            countryCode = org.orgString("countryCode")
            taxId = org.orgText("taxId")
            registrationNumber = org.orgText("businessRegistrationNumber")
            industry = org.orgText("industrySector")
            street = org.orgText("addressStreet")
            city = org.orgText("addressCity")
            state = org.orgText("addressState")
            postalCode = org.orgText("addressPostalCode")
            addressCountry = org.orgText("addressCountry")
            phone = org.orgText("contactPhone")
            email = org.orgText("contactEmail")
            website = org.orgText("contactWebsite")
            currency = org.orgString("defaultCurrency") ?? "USD"
            fiscalMonth = org.orgInt("fiscalYearStartMonth") ?? 1
            paymentTerms = org.orgText("defaultPaymentTerms")
            lockDate = DubblDate.parseDay(lock?.orgString("periodLock.lockDate"))
        }

        /// Only what changed, so an untouched base currency is never re-sent.
        func changes(from old: Form) -> [String: JSONValue] {
            var body: [String: JSONValue] = [:]
            func text(_ key: String, _ new: String, _ before: String) {
                if new != before { body[key] = OrgJSON.text(new) }
            }
            if name != old.name { body["name"] = .string(name.trimmingCharacters(in: .whitespaces)) }
            if countryCode != old.countryCode {
                body["countryCode"] = countryCode.map(JSONValue.string) ?? .null
                body["country"] = OrgSettingsLocale.countryName(countryCode).map(JSONValue.string) ?? .null
            }
            text("taxId", taxId, old.taxId)
            text("businessRegistrationNumber", registrationNumber, old.registrationNumber)
            text("industrySector", industry, old.industry)
            text("addressStreet", street, old.street)
            text("addressCity", city, old.city)
            text("addressState", state, old.state)
            text("addressPostalCode", postalCode, old.postalCode)
            text("addressCountry", addressCountry, old.addressCountry)
            text("contactPhone", phone, old.phone)
            text("contactEmail", email, old.email)
            text("contactWebsite", website, old.website)
            text("defaultPaymentTerms", paymentTerms, old.paymentTerms)
            if currency != old.currency { body["defaultCurrency"] = .string(currency) }
            if fiscalMonth != old.fiscalMonth { body["fiscalYearStartMonth"] = OrgJSON.number(fiscalMonth) }
            return body
        }
    }

    static let paymentTerms: [(value: String, label: String)] = [
        ("", "Not set"), ("due_on_receipt", "Due on receipt"), ("net_7", "Net 7"), ("net_15", "Net 15"),
        ("net_30", "Net 30"), ("net_45", "Net 45"), ("net_60", "Net 60"), ("net_90", "Net 90"),
    ]

    var body: some View {
        OrgSettingsPage(loaded: resource.isLoaded, error: resource.error, reload: load) {
            if !canEdit {
                OrgSettingsNotice(text: OrgSettingsLevel.owner.readOnlyMessage)
            }
            identity
            OrgSettingsSection("Legal", footer: "Your country sets the tax rules and default chart of accounts.") {
                OrgSettingsChoiceRow(label: "Country", title: "Country", choices: OrgSettingsLocale.countries, selection: $form.countryCode, disabled: !canEdit)
                field("Tax ID or VAT number", $form.taxId, prompt: "e.g. GB123456789", mono: true)
                field("Registration number", $form.registrationNumber, prompt: "Company number", mono: true)
                field("Industry", $form.industry, prompt: "e.g. Design studio")
            }
            OrgSettingsSection("Address") {
                field("Street", $form.street, prompt: "Street and number", content: .fullStreetAddress)
                field("City", $form.city, prompt: "City", content: .addressCity)
                field("State or province", $form.state, prompt: "State", content: .addressState)
                field("Postal code", $form.postalCode, prompt: "Postal code", content: .postalCode)
                field("Country", $form.addressCountry, prompt: "Country", content: .countryName)
            }
            OrgSettingsSection("Contact") {
                field("Phone", $form.phone, prompt: "+1 555 0100", keyboard: .phonePad, content: .telephoneNumber)
                field("Email", $form.email, prompt: "billing@company.com", keyboard: .emailAddress, content: .emailAddress, capitalization: .never)
                field("Website", $form.website, prompt: "company.com", keyboard: .URL, content: .URL, capitalization: .never)
            }
            OrgSettingsSection("Accounting", footer: "The base currency can't change once the books have transactions.") {
                OrgSettingsChoiceRow(
                    label: "Base currency", title: "Base currency", choices: OrgSettingsLocale.currencies,
                    selection: Binding(get: { form.currency }, set: { form.currency = $0 ?? form.currency }),
                    disabled: !canEdit
                )
                OrgSettingsPicker(label: "Fiscal year starts", selection: $form.fiscalMonth, options: OrgSettingsLocale.months, disabled: !canEdit)
                OrgSettingsPicker(label: "Payment terms", selection: $form.paymentTerms, options: Self.paymentTerms, disabled: !canEdit)
            }
            lockSection
        }
        .navigationTitle("General")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit, resource.isLoaded {
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        if form.currency != original.currency { confirmCurrency = true } else { Task { await save() } }
                    } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(!dirty || saving || form.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .confirmationDialog("Change the base currency to \(form.currency)?", isPresented: $confirmCurrency, titleVisibility: .visible) {
            Button("Change currency") { Task { await save() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Every report is measured in the base currency.")
        }
        .task { await load() }
    }

    // MARK: Sections

    private var identity: some View {
        OrgSettingsSection(nil) {
            HStack(spacing: 14) {
                Avatar(name: form.name.isEmpty ? "?" : form.name, imageURL: resource.value?.orgString("organization.logo"), size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text(form.name.isEmpty ? "Organization" : form.name)
                        .displayFont(19)
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    Text([resource.value?.orgString("organization.slug"), OrgSettingsLocale.countryName(form.countryCode)].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                Spacer()
            }
            .padding(16)
            field("Name", $form.name, prompt: "Organization name", content: .organizationName, capitalization: .words)
        }
    }

    private var lockSection: some View {
        OrgSettingsSection("Lock date", footer: "Nobody can post, edit or delete entries dated on or before the lock date.") {
            if canEdit {
                DatePicker(selection: Binding(get: { form.lockDate ?? .now }, set: { form.lockDate = $0 }), displayedComponents: .date) {
                    Text(form.lockDate == nil ? "Lock books through" : "Books locked through")
                        .font(.system(size: 16))
                        .foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
            } else {
                DetailRow("Books locked through", form.lockDate.map { $0.formatted(.dateTime.day().month(.abbreviated).year()) } ?? "Not locked")
            }
        }
    }

    private func field(
        _ label: String, _ text: Binding<String>, prompt: String, keyboard: UIKeyboardType = .default,
        content: UITextContentType? = nil, capitalization: TextInputAutocapitalization = .sentences, mono: Bool = false
    ) -> some View {
        OrgSettingsField(label: label, text: text, prompt: prompt, keyboard: keyboard, content: content, capitalization: capitalization, mono: mono, disabled: !canEdit)
    }

    // MARK: Data

    private func load() async {
        async let org: Void = resource.load(env)
        async let locked: Void = lock.load(env)
        _ = await (org, locked)
        guard let value = resource.value?["organization"] else { return }
        let fresh = Form(value, lock: lock.value)
        // Keep edits in progress when pulling to refresh.
        if !dirty { form = fresh }
        original = fresh
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let body = form.changes(from: original)
        let lockChanged = form.lockDate != original.lockDate
        let ok = await OrgSettingsRun.run(env, "Settings saved") {
            if !body.isEmpty {
                try await OrgSettingsAPI.send(env, .patch, "organization", body: body)
            }
            if lockChanged, let date = form.lockDate {
                try await OrgSettingsAPI.send(env, .put, "period-lock", body: ["lockDate": .string(DubblDate.string(date))])
            }
        }
        guard ok else { return }
        original = form
        await env.session.refreshIdentity()
    }
}
