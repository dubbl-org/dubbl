import SwiftUI

/// One way into Tilly: blank, or with a first question.
struct AssistantLaunch: Identifiable, Equatable {
    let id = UUID()
    var prompt: String?
    /// Context hint for the model, like the web's current page.
    var page: String?
}

/// Tilly on the phone: glass controls over the conversation, answers in
/// full-width type, a neutral bubble for what you asked, swipeable starters
/// and a floating composer.
struct AssistantView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var launch = AssistantLaunch()

    @State private var chat = AssistantStore()
    @State private var input = ""
    @State private var showHistory = false
    @State private var appeared = false
    @State private var boop = 0
    @State private var sent = 0
    @State private var atBottom = true
    @FocusState private var inputFocused: Bool

    private struct Starter: Identifiable {
        let title: String
        let detail: String
        let prompt: String
        let symbol: String
        let tint: Color
        var id: String { prompt }
    }

    private static let starters = [
        Starter(title: "How's business?", detail: "This month at a glance", prompt: "How is the business doing this month?", symbol: "chart.line.uptrend.xyaxis", tint: DTheme.positive),
        Starter(title: "Who owes me?", detail: "And who to chase first", prompt: "Who owes me money, and who should I chase first?", symbol: "hand.raised", tint: DTheme.warning),
        Starter(title: "Cash runway", detail: "How long will my cash last?", prompt: "How long will my cash last?", symbol: "hourglass", tint: DTheme.accent),
        Starter(title: "Biggest supplier", detail: "Everything from them this year", prompt: "Find everything from my biggest supplier this year", symbol: "magnifyingglass", tint: DTheme.special),
        Starter(title: "Explain my P&L", detail: "Like I'm new to accounting", prompt: "Explain my profit and loss like I'm new to accounting", symbol: "heart.text.square", tint: Color(hex: 0xEC4899)),
    ]

    var body: some View {
        NavigationStack {
            content
                .background(DTheme.canvas)
                .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbar }
        }
        .tint(DTheme.ink)
        .sheet(isPresented: $showHistory) {
            AssistantHistoryView { conversation in
                showHistory = false
                Task { await chat.open(env.api, id: conversation.id, title: conversation.title) }
            }
        }
        .onDisappear { chat.stop() }
        .task {
            await chat.checkConfigured(env.api)
            if let prompt = launch.prompt, chat.isEmpty, chat.configured != false {
                send(prompt)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.86)) { appeared = true }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: sent)
        .sensoryFeedback(trigger: chat.isStreaming) { was, now in
            was && !now && chat.errorMessage == nil && chat.pending == nil ? .success : nil
        }
    }

    private var markState: TillyState {
        if chat.pending != nil { return .attention }
        return chat.isStreaming ? .thinking : .idle
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.down")
            }
            .accessibilityLabel("Close Tilly")
        }
        ToolbarItem(placement: .principal) {
            HStack(spacing: 7) {
                TillyMark(size: 20, state: markState, celebrate: chat.errorMessage == nil, boop: boop)
                Text(chat.title.flatMap { $0.isEmpty ? nil : $0 } ?? "Tilly")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                    .contentTransition(.opacity)
            }
            .frame(maxWidth: 220)
            .animation(.easeOut(duration: 0.2), value: chat.title)
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                showHistory = true
            } label: {
                Image(systemName: "clock.arrow.circlepath")
            }
            .accessibilityLabel("Conversation history")
            Button {
                withAnimation(.snappy) { chat.newChat() }
                inputFocused = true
            } label: {
                Image(systemName: "square.and.pencil")
            }
            .disabled(chat.isEmpty)
            .accessibilityLabel("New chat")
        }
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        if chat.configured == false {
            notConfigured
        } else if chat.isLoadingTranscript {
            loadingSkeleton
        } else if chat.turns.isEmpty, !chat.isStreaming {
            emptyState
        } else {
            conversation
        }
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(chat.turns) { turn in
                        turnView(turn, streaming: chat.isStreaming && turn.id == chat.turns.last?.id)
                    }
                    if let pending = chat.pending {
                        TillyApprovalCard(pending: pending, currency: env.session.currency) { approve, always in
                            chat.decide(env.api, approve: approve, always: always)
                        }
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.96, anchor: .bottom).combined(with: .opacity).combined(with: .offset(y: 10)),
                            removal: .opacity.combined(with: .scale(scale: 0.98))
                        ))
                    }
                    if chat.isStreaming, chat.pending == nil, !isWritingNow {
                        TillyWorkingStatus(label: phase, since: chat.runStartedAt)
                            .transition(.opacity.combined(with: .offset(y: 4)))
                    }
                    if let error = chat.errorMessage {
                        errorRow(error)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .animation(.spring(response: 0.42, dampingFraction: 0.86), value: chat.pending?.id)
                .animation(.easeOut(duration: 0.2), value: chat.isStreaming)
            }
            .defaultScrollAnchor(.bottom)
            .defaultScrollAnchor(.bottom, for: .sizeChanges)
            .scrollEdgeEffectStyle(.soft, for: .vertical)
            .scrollDismissesKeyboard(.interactively)
            .onScrollGeometryChange(for: Bool.self) { geo in
                geo.contentSize.height <= geo.containerSize.height || geo.visibleRect.maxY >= geo.contentSize.height - 80
            } action: { _, isAtBottom in
                withAnimation(.snappy) { atBottom = isAtBottom }
            }
            .onChange(of: chat.turns.count) {
                withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .overlay(alignment: .bottom) {
                if !atBottom {
                    Button {
                        withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
                    } label: {
                        Image(systemName: "arrow.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(DTheme.ink)
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(TapScaleStyle())
                    .glassEffect(.regular.interactive(), in: Circle())
                    .padding(.bottom, 10)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
                    .accessibilityLabel("Jump to latest")
                }
            }
        }
    }

    /// Text is streaming into the last block, so the caret already shows progress.
    private var isWritingNow: Bool {
        chat.turns.last?.blocks.last.map { $0.kind == .text && $0.live } ?? false
    }

    private var phase: String {
        guard let last = chat.turns.last, last.role == "assistant", let block = last.blocks.last else { return "Thinking" }
        if block.kind == .tool, !block.done { return "Working" }
        return "Thinking"
    }

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                Spacer()
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(DTheme.field)
                    .frame(width: 170, height: 42)
            }
            VStack(alignment: .leading, spacing: 10) {
                ForEach([0.94, 0.82, 0.58], id: \.self) { width in
                    RoundedRectangle(cornerRadius: 5)
                        .fill(DTheme.field)
                        .frame(height: 13)
                        .containerRelativeFrame(.horizontal) { length, _ in (length - 40) * width }
                }
            }
            Spacer()
        }
        .skeletonShimmer()
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: Turns

    @ViewBuilder
    private func turnView(_ turn: AssistantStore.Turn, streaming: Bool) -> some View {
        if turn.role == "user" {
            VStack(alignment: .trailing, spacing: 6) {
                ForEach(turn.blocks.filter { $0.kind == .file }) { file in
                    Label(file.text, systemImage: "doc")
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(DTheme.surface, in: Capsule())
                }
                let text = turn.blocks.filter { $0.kind == .text }.map(\.text).joined()
                if !text.isEmpty {
                    Text(text)
                        .font(.system(size: 16))
                        .lineSpacing(3)
                        .foregroundStyle(DTheme.ink)
                        .textSelection(.enabled)
                        .padding(.horizontal, 15)
                        .padding(.vertical, 10)
                        .background(DTheme.field, in: RoundedRectangle(cornerRadius: 21, style: .continuous))
                }
            }
            .padding(.leading, 60)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .transition(.asymmetric(
                insertion: .scale(scale: 0.94, anchor: .bottomTrailing).combined(with: .opacity).combined(with: .offset(y: 10)),
                removal: .opacity
            ))
        } else {
            let segments = Self.segments(turn.blocks)
            let answer = turn.blocks.filter { $0.kind == .text }.map(\.text).joined(separator: "\n\n")
            VStack(alignment: .leading, spacing: 12) {
                ForEach(segments) { segment in
                    switch segment.kind {
                    case let .tools(steps):
                        TillyActivityTrace(steps: steps, live: streaming && segment.id == segments.last?.id)
                    case let .text(block):
                        if !block.text.isEmpty {
                            TillyMarkdown(text: block.text.trimmingCharacters(in: .whitespacesAndNewlines), caret: block.live)
                        }
                    }
                }
                if !streaming, !answer.isEmpty {
                    TillyTurnActions(text: answer.trimmingCharacters(in: .whitespacesAndNewlines))
                        .transition(.opacity)
                }
            }
            .transition(.opacity)
        }
    }

    private struct Segment: Identifiable {
        enum Kind {
            case tools([AssistantStore.Block])
            case text(AssistantStore.Block)
        }

        let id: UUID
        var kind: Kind
    }

    /// Folds consecutive steps into one trace, keyed by its first step so a
    /// trace keeps its state as steps stream in.
    private static func segments(_ blocks: [AssistantStore.Block]) -> [Segment] {
        var out: [Segment] = []
        for block in blocks {
            guard block.kind == .tool else {
                out.append(Segment(id: block.id, kind: .text(block)))
                continue
            }
            if let last = out.indices.last, case var .tools(steps) = out[last].kind {
                steps.append(block)
                out[last].kind = .tools(steps)
            } else {
                out.append(Segment(id: block.id, kind: .tools([block])))
            }
        }
        return out
    }

    private func errorRow(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 16))
                .foregroundStyle(DTheme.negative)
            VStack(alignment: .leading, spacing: 2) {
                Text("Tilly couldn't finish")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(DTheme.negative.opacity(0.07), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .transition(.opacity.combined(with: .offset(y: 6)))
    }

    // MARK: Empty states

    private var emptyState: some View {
        ScrollView {
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .fill(RadialGradient(
                            colors: [TillyColor.t400.opacity(0.22), TillyColor.t400.opacity(0)],
                            center: .center,
                            startRadius: 0,
                            endRadius: 110
                        ))
                        .frame(width: 220, height: 220)
                        .scaleEffect(appeared ? 1 : 0.6)
                    TillyMark(size: 76, boop: boop, tappable: true)
                        .scaleEffect(appeared ? 1 : 0.7)
                }
                .frame(height: 170)
                Text("Hi, I'm Tilly")
                    .displayFont(30, weight: .semibold)
                    .foregroundStyle(DTheme.ink)
                Text("I can explain your numbers, find anything in your books and book receipts for you. I always ask before changing anything.")
                    .font(.system(size: 16))
                    .lineSpacing(3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: 320)
                    .padding(.top, 10)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
            .containerRelativeFrame(.vertical, alignment: .center) { length, _ in length }
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
    }

    private var notConfigured: some View {
        VStack(spacing: 12) {
            TillyMark(size: 56, muted: true)
            Text("Tilly isn't switched on yet")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(DTheme.ink)
            Text("Your server needs an OPENROUTER_API_KEY in its environment. Ask whoever runs your dubbl server to add one.")
                .font(.system(size: 15))
                .multilineTextAlignment(.center)
                .foregroundStyle(DTheme.inkSecondary)
                .frame(maxWidth: 300)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Swipeable starters above the composer.
    private var starterCards: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(Self.starters.enumerated()), id: \.element.id) { index, starter in
                    Button {
                        send(starter.prompt)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 7) {
                                Image(systemName: starter.symbol)
                                    .font(.system(size: 12.5, weight: .semibold))
                                    .foregroundStyle(starter.tint)
                                Text(starter.title)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(DTheme.ink)
                                    .lineLimit(1)
                            }
                            Text(starter.detail)
                                .font(.system(size: 13.5))
                                .foregroundStyle(DTheme.inkSecondary)
                                .lineLimit(1)
                        }
                        .frame(width: 196, alignment: .leading)
                        .padding(.horizontal, 15)
                        .padding(.vertical, 12)
                        .background(DTheme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(TapScaleStyle())
                    .opacity(appeared ? 1 : 0)
                    .offset(x: appeared ? 0 : 24)
                    .animation(.spring(response: 0.5, dampingFraction: 0.86).delay(0.12 + Double(index) * 0.06), value: appeared)
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
    }

    // MARK: Composer

    private var canSend: Bool {
        !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chat.pending == nil && !chat.isStreaming
    }

    private func send(_ text: String) {
        guard chat.pending == nil, !chat.isStreaming else { return }
        sent += 1
        chat.send(env.api, text: text, page: launch.page)
    }

    @ViewBuilder
    private var bottomBar: some View {
        if chat.configured != false {
            VStack(spacing: 10) {
                if chat.turns.isEmpty, !chat.isStreaming, !chat.isLoadingTranscript {
                    starterCards
                        .transition(.opacity.combined(with: .offset(y: 8)))
                }
                composer
                    .padding(.horizontal, 12)
                Text("Reads run on their own. Changes ask you first.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(DTheme.inkTertiary)
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, 8)
            .padding(.bottom, 4)
            .animation(.spring(response: 0.4, dampingFraction: 0.88), value: chat.turns.isEmpty)
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(
                chat.pending != nil ? "Answer the approval first" : "Ask Tilly anything",
                text: $input,
                axis: .vertical
            )
            .font(.system(size: 16.5))
            .foregroundStyle(DTheme.ink)
            .lineLimit(1 ... 6)
            .focused($inputFocused)
            .disabled(chat.pending != nil)
            .padding(.vertical, 11)
            .onChange(of: input) { old, new in
                if new.count > old.count { boop += 1 }
            }

            composerButton
                .padding(.bottom, 6)
        }
        .padding(.leading, 18)
        .padding(.trailing, 6)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .onTapGesture { inputFocused = true }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: chat.isStreaming)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: canSend)
    }

    @ViewBuilder
    private var composerButton: some View {
        if chat.isStreaming {
            Button {
                chat.stop()
            } label: {
                Image(systemName: "square.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(DTheme.inkInverse)
                    .frame(width: 36, height: 36)
                    .background(DTheme.ink, in: Circle())
            }
            .buttonStyle(TapScaleStyle())
            .accessibilityLabel("Stop")
            .transition(.scale(scale: 0.5).combined(with: .opacity))
        } else {
            Button {
                let text = input
                input = ""
                send(text)
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(canSend ? DTheme.inkInverse : DTheme.inkTertiary)
                    .frame(width: 36, height: 36)
                    .background(canSend ? DTheme.ink : DTheme.field, in: Circle())
            }
            .buttonStyle(TapScaleStyle())
            .disabled(!canSend)
            .accessibilityLabel("Send")
            .transition(.scale(scale: 0.5).combined(with: .opacity))
        }
    }
}

// MARK: - History

/// Your Tilly conversations in this organization, newest first, grouped by
/// day, with swipe to delete and Clear history.
struct AssistantHistoryView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var onSelect: (AssistantConversationSummary) -> Void

    @State private var conversations: [AssistantConversationSummary]?
    @State private var error: String?
    @State private var query = ""
    @State private var confirmClear = false

    private var filtered: [AssistantConversationSummary] {
        let all = conversations ?? []
        let term = query.trimmingCharacters(in: .whitespaces)
        return term.isEmpty ? all : all.filter { $0.displayTitle.localizedCaseInsensitiveContains(term) }
    }

    private var grouped: [(title: String, items: [AssistantConversationSummary])] {
        let calendar = Calendar.current
        var groups: [(String, [AssistantConversationSummary])] = []
        for item in filtered {
            let date = (item.updatedAt ?? item.createdAt).flatMap(DubblDate.parseMoment) ?? .distantPast
            let title = calendar.isDateInToday(date) ? "Today"
                : calendar.isDateInYesterday(date) ? "Yesterday"
                : date > .now.addingTimeInterval(-7 * 86400) ? "This week" : "Earlier"
            if let last = groups.indices.last, groups[last].0 == title { groups[last].1.append(item) } else { groups.append((title, [item])) }
        }
        return groups.map { (title: $0.0, items: $0.1) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ErrorStateView(message: error) { Task { await load() } }
                } else if conversations == nil {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filtered.isEmpty {
                    EmptyStateView(
                        symbol: "bubble.left.and.text.bubble.right",
                        title: query.isEmpty ? "No conversations yet" : "No matches",
                        message: query.isEmpty ? "Your chats with Tilly show up here." : "No conversation matches \"\(query)\"."
                    )
                } else {
                    List {
                        ForEach(grouped, id: \.title) { group in
                            Section {
                                ForEach(group.items) { item in
                                    row(item)
                                        .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                                        .listRowBackground(DTheme.canvas)
                                        .listRowSeparatorTint(DTheme.hairline)
                                }
                            } header: {
                                Text(group.title)
                                    .font(.system(size: 13.5, weight: .semibold))
                                    .foregroundStyle(DTheme.inkTertiary)
                                    .textCase(nil)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(DTheme.canvas)
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search conversations")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Clear history", systemImage: "trash", role: .destructive) { confirmClear = true }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .disabled(conversations?.isEmpty ?? true)
                }
            }
            .confirmationDialog(
                "Delete all your Tilly conversations in this organization? This can't be undone.",
                isPresented: $confirmClear,
                titleVisibility: .visible
            ) {
                Button("Clear history", role: .destructive) {
                    Task {
                        let _: EmptyBody? = try? await env.api.delete("assistant/conversations")
                        withAnimation { conversations = [] }
                    }
                }
            }
        }
        .tint(DTheme.ink)
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.canvas)
        .task { await load() }
    }

    private func load() async {
        do {
            let response: AssistantConversationsResponse = try await env.api.get("assistant/conversations")
            withAnimation { conversations = response.conversations; error = nil }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func row(_ item: AssistantConversationSummary) -> some View {
        Button {
            onSelect(item)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.displayTitle)
                        .font(.system(size: 15.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    if let stamp = (item.updatedAt ?? item.createdAt).flatMap(DubblDate.parseMoment) {
                        Text(stamp.formatted(.relative(presentation: .named)))
                            .font(.system(size: 12.5))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                Spacer(minLength: 8)
                if item.waiting == true {
                    Text("Needs you")
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(DTheme.tilly)
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(TillyColor.wash, in: Capsule())
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) {
            Button("Delete", systemImage: "trash", role: .destructive) {
                Task {
                    let _: EmptyBody? = try? await env.api.delete("assistant/conversations/\(item.id)")
                    withAnimation { conversations?.removeAll { $0.id == item.id } }
                }
            }
        }
    }
}
