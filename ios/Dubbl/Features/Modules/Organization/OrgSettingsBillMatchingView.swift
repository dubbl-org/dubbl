import SwiftUI

/// /settings/procurement: three-way matching between purchase orders, goods
/// received and supplier bills. Tolerances are stored in basis points
/// (500 = 5%) and typed here as percentages.
struct OrgSettingsBillMatchingView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var settings = OrgSettingsResource("procurement-settings")
    @State private var form = Form()
    @State private var original = Form()
    @State private var saving = false

    struct Form: Equatable {
        var priceTolerance = "0"
        var quantityTolerance = "0"
        var requireReceipt = false
        var blockOverBill = false
    }

    private var valid: Bool {
        OrgSettingsFormat.basisPoints(form.priceTolerance) != nil && OrgSettingsFormat.basisPoints(form.quantityTolerance) != nil
    }

    var body: some View {
        OrgSettingsPage(loaded: settings.isLoaded, error: settings.error, reload: load) {
            OrgSettingsSection("Tolerances", footer: "A bill line that differs from its purchase order by more than this is flagged for review.") {
                percentField("Price tolerance", $form.priceTolerance)
                percentField("Quantity tolerance", $form.quantityTolerance)
            }
            OrgSettingsSection("Rules") {
                OrgSettingsToggle(title: "Require goods received first", subtitle: "Bills can only be approved once the goods are received", isOn: $form.requireReceipt)
                OrgSettingsToggle(title: "Block over-billing", subtitle: "Stop bills that exceed the ordered quantity or amount", isOn: $form.blockOverBill)
            }
        }
        .navigationTitle("Bill matching")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if settings.isLoaded {
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(form == original || !valid || saving)
                }
            }
        }
        .task { await load() }
    }

    private func percentField(_ label: String, _ text: Binding<String>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 16))
                .foregroundStyle(DTheme.ink)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(DFont.figure(16, weight: .regular))
                .frame(width: 80)
            Text("%")
                .font(.system(size: 16))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func load() async {
        await settings.load(env)
        guard let value = settings.value?["procurementSettings"] else { return }
        let fresh = Form(
            priceTolerance: OrgSettingsFormat.percentText(value.orgInt("priceTolerancePercent") ?? 0),
            quantityTolerance: OrgSettingsFormat.percentText(value.orgInt("qtyTolerancePercent") ?? 0),
            requireReceipt: value.orgBool("requireGrnBeforeBill"),
            blockOverBill: value.orgBool("blockOverBill")
        )
        if form == original { form = fresh }
        original = fresh
    }

    private func save() async {
        guard let price = OrgSettingsFormat.basisPoints(form.priceTolerance), let quantity = OrgSettingsFormat.basisPoints(form.quantityTolerance) else { return }
        saving = true
        defer { saving = false }
        let ok = await OrgSettingsRun.run(env, "Bill matching saved") {
            try await OrgSettingsAPI.send(env, .put, "procurement-settings", body: [
                "priceTolerancePercent": OrgJSON.number(price),
                "qtyTolerancePercent": OrgJSON.number(quantity),
                "requireGrnBeforeBill": .bool(form.requireReceipt),
                "blockOverBill": .bool(form.blockOverBill),
            ])
        }
        if ok { original = form }
    }
}
