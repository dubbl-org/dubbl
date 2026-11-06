import SwiftUI

/// One open Tilly conversation: sends messages over the SSE stream
/// (POST assistant/chat), folds text deltas and tool steps into turns as they
/// arrive, pauses on approval_required and resumes with the decision.
/// Cancelling the stream task closes the request, which stops the run.
@MainActor @Observable
final class AssistantStore {
    struct Block: Identifiable {
        enum Kind { case text, tool, file }

        let id = UUID()
        var kind: Kind
        var text = ""
        /// Still receiving deltas.
        var live = false
        var toolID: String?
        var tool: String?
        var done = false
        var failed = false
        var skipped = false
    }

    struct Turn: Identifiable {
        let id = UUID()
        var role: String
        var blocks: [Block]
    }

    private(set) var conversationID: String?
    private(set) var title: String?
    private(set) var turns: [Turn] = []
    private(set) var pending: AssistantPending?
    private(set) var isStreaming = false
    private(set) var isLoadingTranscript = false
    private(set) var errorMessage: String?
    /// nil until checked; false when the server has no model key.
    private(set) var configured: Bool?
    private(set) var runStartedAt: Date?
    private(set) var steps = 0

    private var streamTask: Task<Void, Never>?

    var isEmpty: Bool { turns.isEmpty && conversationID == nil }

    // MARK: Lifecycle

    func checkConfigured(_ api: APIClient) async {
        #if DEBUG
        if DemoData.isEnabled { configured = true; return }
        #endif
        guard let status: AssistantStatus = try? await api.get("assistant/chat") else { return }
        configured = status.configured
    }

    func newChat() {
        stop()
        conversationID = nil
        title = nil
        turns = []
        pending = nil
        errorMessage = nil
    }

    /// Rehydrates a conversation from its saved transcript, in the same shape
    /// the live stream produces.
    func open(_ api: APIClient, id: String, title: String?) async {
        stop()
        conversationID = id
        self.title = title
        turns = []
        pending = nil
        errorMessage = nil
        isLoadingTranscript = true
        defer { isLoadingTranscript = false }
        do {
            let response: AssistantConversationResponse = try await api.get("assistant/conversations/\(id)")
            self.title = response.conversation.title ?? title
            pending = response.conversation.pending
            turns = Self.fold(response.conversation.messages ?? [], pendingID: pending?.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        endRun()
    }

    // MARK: Sending

    func send(_ api: APIClient, text: String, page: String? = nil) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isStreaming else { return }
        errorMessage = nil
        withAnimation(.snappy) {
            pending = nil
            turns.append(Turn(role: "user", blocks: [Block(kind: .text, text: trimmed, done: true)]))
        }
        run(api, AssistantChatRequest(conversationId: conversationID, text: trimmed, page: page))
    }

    /// Answers the paused action: approve (optionally for the rest of the chat) or skip.
    func decide(_ api: APIClient, approve: Bool, always: Bool = false) {
        guard let pending, conversationID != nil, !isStreaming else { return }
        withAnimation(.snappy) { self.pending = nil }
        lastSkippedName = approve ? nil : pending.name
        errorMessage = nil
        run(api, AssistantChatRequest(
            conversationId: conversationID,
            approval: .init(toolUseId: pending.id, decision: approve ? "approve" : "deny", always: always ? true : nil)
        ))
    }

    private func run(_ api: APIClient, _ request: AssistantChatRequest) {
        runStartedAt = .now
        steps = 0
        isStreaming = true
        #if DEBUG
        if DemoData.isEnabled {
            playDemo(approved: request.approval)
            return
        }
        #endif
        streamTask = Task {
            do {
                let stream = try await api.stream("assistant/chat", body: request)
                for try await data in stream {
                    guard !Task.isCancelled else { return }
                    guard let event = try? APIClient.decoder.decode(AssistantEvent.self, from: data) else { continue }
                    apply(event)
                }
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                if case let .server(status, _) = error as? APIError, status == 503 { configured = false }
                if errorMessage == nil { errorMessage = error.localizedDescription }
            }
            endRun()
        }
    }

    // MARK: Event folding

    private func apply(_ event: AssistantEvent) {
        switch event.type {
        case "conversation":
            conversationID = event.id ?? conversationID
            if let title = event.title, !title.isEmpty { withAnimation(.easeOut(duration: 0.2)) { self.title = title } }
        case "text_delta":
            appendDelta(event.text ?? "")
        case "tool_start":
            closeText()
            withAnimation(.snappy) {
                appendBlock(Block(kind: .tool, toolID: event.id, tool: event.name))
            }
            steps += 1
        case "tool_result":
            completeTool(id: event.id, ok: event.ok ?? true, skipped: event.skipped ?? false)
        case "approval_required":
            closeText()
            guard let id = event.id, let name = event.name else { return }
            withAnimation(.snappy) {
                pending = AssistantPending(id: id, name: name, input: event.input, risk: event.risk, cents: event.cents)
            }
        case "error":
            errorMessage = event.message ?? "Tilly hit a snag. Please try again."
        case "done":
            closeText()
        default:
            break
        }
    }

    private func endRun() {
        closeText()
        isStreaming = false
        runStartedAt = nil
    }

    private func ensureAssistantTurn() -> Int {
        if let last = turns.indices.last, turns[last].role == "assistant" { return last }
        turns.append(Turn(role: "assistant", blocks: []))
        return turns.indices.last!
    }

    private func appendBlock(_ block: Block) {
        let turn = ensureAssistantTurn()
        turns[turn].blocks.append(block)
    }

    private func appendDelta(_ delta: String) {
        let turn = ensureAssistantTurn()
        if let last = turns[turn].blocks.indices.last, turns[turn].blocks[last].kind == .text, turns[turn].blocks[last].live {
            turns[turn].blocks[last].text += delta
        } else {
            turns[turn].blocks.append(Block(kind: .text, text: delta, live: true))
        }
    }

    private func closeText() {
        guard let turn = turns.indices.last, turns[turn].role == "assistant" else { return }
        for index in turns[turn].blocks.indices where turns[turn].blocks[index].live {
            turns[turn].blocks[index].live = false
            turns[turn].blocks[index].done = true
        }
    }

    private func completeTool(id: String?, ok: Bool, skipped: Bool) {
        guard let turn = turns.indices.last, turns[turn].role == "assistant" else { return }
        guard let index = turns[turn].blocks.lastIndex(where: { $0.kind == .tool && $0.toolID == id })
            ?? turns[turn].blocks.lastIndex(where: { $0.kind == .tool && !$0.done }) else {
            // A skipped approval never had a tool_start; show it as its own line.
            if skipped, let pendingName = lastSkippedName {
                appendBlock(Block(kind: .tool, toolID: id, tool: pendingName, done: true, skipped: true))
            }
            return
        }
        withAnimation(.snappy) {
            turns[turn].blocks[index].done = true
            turns[turn].blocks[index].failed = !ok && !skipped
            turns[turn].blocks[index].skipped = skipped
        }
    }

    private var lastSkippedName: String?

    // MARK: Transcript

    /// Turns from the saved messages: tool results ride on user messages, so
    /// consecutive assistant messages between them read as one turn.
    static func fold(_ messages: [StoredMessage], pendingID: String?) -> [Turn] {
        var results: [String: Bool] = [:]
        for message in messages where message.role == "user" {
            for block in message.blocks where block.type == "tool_result" {
                if let id = block.toolUseId { results[id] = !(block.isError ?? false) }
            }
        }
        var turns: [Turn] = []
        for message in messages {
            if message.role == "user" {
                let visible = message.blocks.filter { $0.type == "text" || $0.type == "file" }
                guard !visible.isEmpty else { continue }
                turns.append(Turn(role: "user", blocks: visible.map { block in
                    block.type == "file"
                        ? Block(kind: .file, text: block.fileName ?? "File", done: true)
                        : Block(kind: .text, text: block.text ?? "", done: true)
                }))
            } else {
                var blocks: [Block] = []
                for block in message.blocks {
                    switch block.type {
                    case "text":
                        if let text = block.text, !text.isEmpty { blocks.append(Block(kind: .text, text: text, done: true)) }
                    case "tool_use":
                        guard block.id != pendingID else { continue }
                        let result = block.id.flatMap { results[$0] }
                        blocks.append(Block(kind: .tool, toolID: block.id, tool: block.name, done: true, failed: result == false))
                    default:
                        break
                    }
                }
                guard !blocks.isEmpty else { continue }
                if let last = turns.indices.last, turns[last].role == "assistant" {
                    turns[last].blocks += blocks
                } else {
                    turns.append(Turn(role: "assistant", blocks: blocks))
                }
            }
        }
        return turns
    }

    // MARK: Demo

    #if DEBUG
    /// Plays a scripted run through the real event folding, for screenshots.
    private func playDemo(approved: AssistantChatRequest.Approval?) {
        streamTask = Task {
            @MainActor func step(_ ms: Int, _ event: AssistantEvent) async throws {
                try await Task.sleep(for: .milliseconds(ms))
                apply(event)
            }
            func event(_ type: String, id: String? = nil, name: String? = nil, text: String? = nil) -> AssistantEvent {
                AssistantEvent(type: type, id: id, text: text, name: name)
            }
            do {
                if let approved {
                    try await step(400, event("tool_start", id: "t4", name: "send_invoice_reminder"))
                    try await step(900, AssistantEvent(type: "tool_result", id: "t4", ok: approved.decision == "approve", skipped: approved.decision != "approve"))
                    let reply = approved.decision == "approve"
                        ? "Done. I sent a friendly reminder to **Lumen Labs** for INV-0038 and noted it on the invoice."
                        : "No problem, I left it. Say the word if you'd like me to send it later."
                    for word in reply.split(separator: " ") {
                        try await step(40, event("text_delta", text: word + " "))
                    }
                    try await step(100, event("done"))
                } else {
                    try await step(500, AssistantEvent(type: "conversation", id: "demo-convo", title: "Who should I chase first?"))
                    try await step(300, event("tool_start", id: "t1", name: "get_aged_receivables"))
                    try await step(1100, AssistantEvent(type: "tool_result", id: "t1", ok: true))
                    try await step(150, event("tool_start", id: "t2", name: "list_invoices"))
                    try await step(900, AssistantEvent(type: "tool_result", id: "t2", ok: true))
                    let reply = "You're owed **$28,640** in total, and **$6,120** of it is overdue. I'd chase these first:\n\n1. **Lumen Labs** – INV-0038, $4,200, 23 days late\n2. **Brightside Co.** – INV-0041, $1,920, 9 days late\n\nLumen usually pays within a week of a reminder. Want me to send them one?"
                    for word in reply.split(separator: " ", omittingEmptySubsequences: false) {
                        try await step(32, event("text_delta", text: word + " "))
                    }
                    try await step(500, AssistantEvent(
                        type: "approval_required", id: "t4", name: "send_invoice_reminder",
                        input: .object(["invoiceNumber": .string("INV-0038"), "to": .string("ap@lumenlabs.io"), "amountDue": .number(420000), "message": .string("Hi! A friendly reminder that INV-0038 is now past due.")]),
                        risk: "send", cents: ["amountDue"]
                    ))
                    try await step(50, event("done"))
                }
            } catch {}
            endRun()
        }
    }
    #endif
}
