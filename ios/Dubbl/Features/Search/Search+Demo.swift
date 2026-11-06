#if DEBUG
extension DemoData {
    static let searchFixtures: [String: String] = [
        "search": #"""
        {"results":[
          {"type":"invoice","id":"demo-inv-0042","title":"INV-0042","subtitle":"Acme Corp","href":"/sales/demo-inv-0042"},
          {"type":"invoice","id":"demo-inv-0039","title":"INV-0039","subtitle":"Acme Corp","href":"/sales/demo-inv-0039"},
          {"type":"invoice","id":"demo-inv-0031","title":"INV-0031","subtitle":"Acme Corp","href":"/sales/demo-inv-0031"},
          {"type":"invoice","id":"demo-inv-0041","title":"INV-0041","subtitle":"Globex","href":"/sales/demo-inv-0041"},
          {"type":"invoice","id":"demo-inv-0040","title":"INV-0040","subtitle":"Umbrella Health","href":"/sales/demo-inv-0040"},
          {"type":"bill","id":"demo-bill-0118","title":"BILL-0118","subtitle":"WeWork","href":"/purchases/demo-bill-0118"},
          {"type":"bill","id":"demo-bill-0117","title":"AWS-2026-09","subtitle":"Amazon Web Services","href":"/purchases/demo-bill-0117"},
          {"type":"bill","id":"demo-bill-0112","title":"ACME-RET-7","subtitle":"Acme Corp","href":"/purchases/demo-bill-0112"},
          {"type":"contact","id":"demo-contact-acme","title":"Acme Corp","subtitle":"ap@acme.com","href":"/contacts/demo-contact-acme"},
          {"type":"contact","id":"demo-contact-globex","title":"Globex","subtitle":"finance@globex.io","href":"/contacts/demo-contact-globex"},
          {"type":"contact","id":"demo-contact-wayne","title":"Wayne Enterprises","subtitle":"accounts@wayne.com","href":"/contacts/demo-contact-wayne"},
          {"type":"document","id":"demo-doc-1","title":"Acme MSA 2026 signed.pdf","subtitle":null,"href":"/documents"},
          {"type":"document","id":"demo-doc-2","title":"acme-sow-brand-refresh.pdf","subtitle":null,"href":"/documents"}
        ]}
        """#,
    ]
}
#endif
