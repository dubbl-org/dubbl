#if DEBUG
extension DemoData {
    static let assistantFixtures: [String: String] = [
        "assistant/chat": #"{"configured":true}"#,
        "assistant/conversations": #"""
        {"conversations":[
          {"id":"demo-convo-1","title":"Who should I chase first?","waiting":true,"createdAt":"2026-10-12T09:12:00.000Z","updatedAt":"2026-10-12T09:14:00.000Z"},
          {"id":"demo-convo-2","title":"Book the Delta receipt","waiting":false,"createdAt":"2026-10-11T16:40:00.000Z","updatedAt":"2026-10-11T16:42:00.000Z"},
          {"id":"demo-convo-3","title":"September profit and loss","waiting":false,"createdAt":"2026-10-07T08:05:00.000Z","updatedAt":"2026-10-07T08:09:00.000Z"},
          {"id":"demo-convo-4","title":"How long will my cash last?","waiting":false,"createdAt":"2026-09-28T13:20:00.000Z","updatedAt":"2026-09-28T13:21:00.000Z"}
        ]}
        """#,
        "assistant/conversations/*": #"""
        {"conversation":{"id":"demo-convo-3","title":"September profit and loss","pending":null,"messages":[
          {"role":"user","content":[{"type":"text","text":"How did September go?"}]},
          {"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"get_profit_and_loss","input":{"startDate":"2026-09-01","endDate":"2026-09-30"}}]},
          {"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"{}"}]},
          {"role":"assistant","content":[{"type":"text","text":"September was a good month. You made **$33,900** in revenue and spent **$23,600**, leaving **$10,300** profit, about 8% below August.\n\n- Wages were the biggest cost at $14,200\n- Travel jumped to $1,860 after the Lisbon trip\n\nWant me to compare it with last September?"}]}
        ]}}
        """#,
    ]
}
#endif
