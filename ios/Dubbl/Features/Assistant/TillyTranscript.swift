import SwiftUI

// The pieces of a Tilly conversation, matching the web panel: answers in
// full-width type, steps folded into one trace, approvals as a warm card.

// MARK: - Markdown

/// The web's small Markdown: paragraphs, lists, headings and code fences,
/// with inline emphasis, code and links.
struct TillyMarkdown: View {
    let text: String
    /// Puts a blinking caret after the last paragraph while text streams in.
    var caret = false

    private enum Block {
        case para(String)
        case heading(String)
        case list(ordered: Bool, items: [String])
        case code(String)
    }

    var body: some View {
        let blocks = Self.parse(text)
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                view(block, isLast: index == blocks.count - 1)
            }
        }
        .font(.system(size: 16))
        .lineSpacing(5)
        .foregroundStyle(DTheme.ink)
        .tint(DTheme.tilly)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func view(_ block: Block, isLast: Bool) -> some View {
        switch block {
        case let .para(text):
            paragraph(text, bold: false, isLast: isLast)
        case let .heading(text):
            paragraph(text, bold: true, isLast: isLast)
        case let .list(ordered, items):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(ordered ? "\(index + 1)." : "•")
                            .foregroundStyle(DTheme.inkTertiary)
                            .monospacedDigit()
                        Text(Self.inline(item))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.leading, 2)
        case let .code(text):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(text)
                    .font(.system(size: 12.5, design: .monospaced))
                    .lineSpacing(3)
                    .foregroundStyle(DTheme.ink.opacity(0.85))
                    .padding(.horizontal, 11)
                    .padding(.vertical, 9)
            }
            .background(DTheme.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    @ViewBuilder
    private func paragraph(_ text: String, bold: Bool, isLast: Bool) -> some View {
        let attr = Self.inline(text)
        if caret && isLast {
            TimelineView(.periodic(from: .now, by: 0.5)) { context in
                let on = Int(context.date.timeIntervalSinceReferenceDate * 2) % 2 == 0
                Text("\(Text(attr))\(Text(" ▍").foregroundStyle(DTheme.tilly.opacity(on ? 1 : 0)))")
                    .fontWeight(bold ? .semibold : nil)
            }
        } else {
            Text(attr)
                .fontWeight(bold ? .semibold : nil)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private static func inline(_ text: String) -> AttributedString {
        (try? AttributedString(
            markdown: text,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(text)
    }

    private static func parse(_ text: String) -> [Block] {
        var blocks: [Block] = []
        var para: [String] = []
        var list: (ordered: Bool, items: [String])?
        var code: [String]?

        func flushPara() {
            if !para.isEmpty { blocks.append(.para(para.joined(separator: "\n"))) }
            para = []
        }
        func flushList() {
            if let current = list { blocks.append(.list(ordered: current.ordered, items: current.items)) }
            list = nil
        }

        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("```") {
                if let open = code {
                    blocks.append(.code(open.joined(separator: "\n")))
                    code = nil
                } else {
                    flushPara(); flushList()
                    code = []
                }
                continue
            }
            if code != nil { code?.append(raw); continue }
            if line.isEmpty { flushPara(); flushList(); continue }
            if line.hasPrefix("#") {
                flushPara(); flushList()
                blocks.append(.heading(line.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)))
                continue
            }
            if let item = bullet(line) {
                flushPara()
                if list?.ordered == item.ordered { list?.items.append(item.text) } else { flushList(); list = (item.ordered, [item.text]) }
                continue
            }
            flushList()
            para.append(line)
        }
        if let open = code { blocks.append(.code(open.joined(separator: "\n"))) }
        flushPara(); flushList()
        return blocks
    }

    private static func bullet(_ line: String) -> (ordered: Bool, text: String)? {
        if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("• ") {
            return (false, String(line.dropFirst(2)))
        }
        if let dot = line.firstIndex(of: "."), line[..<dot].allSatisfy(\.isNumber), !line[..<dot].isEmpty,
           line[line.index(after: dot)...].hasPrefix(" ") {
            return (true, String(line[line.index(dot, offsetBy: 2)...]))
        }
        return nil
    }
}

// MARK: - Activity trace

/// Consecutive steps as one quiet trace: the live step shimmers, finished
/// ones collapse behind "N steps" once the answer arrives.
struct TillyActivityTrace: View {
    let steps: [AssistantStore.Block]
    let live: Bool

    @State private var expanded = false

    var body: some View {
        let collapsed = !live && steps.count > 2 && !expanded
        VStack(alignment: .leading, spacing: 8) {
            if collapsed {
                Button {
                    withAnimation(.snappy) { expanded = true }
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(DTheme.inkTertiary)
                        Text("\(steps.count) steps")
                            .font(.system(size: 13.5, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                .buttonStyle(.plain)
            } else {
                ForEach(steps) { step in
                    line(step)
                        .transition(.opacity.combined(with: .offset(y: 4)))
                }
            }
        }
    }

    private func line(_ step: AssistantStore.Block) -> some View {
        let name = step.tool ?? "step"
        let label = step.skipped
            ? "Skipped: \(TillyLabels.action(name).lowercased())"
            : TillyLabels.step(name, done: step.done)
        return HStack(spacing: 8) {
            Group {
                if !step.done {
                    TillySpark(size: 12)
                } else if step.failed {
                    Image(systemName: "exclamationmark.circle").foregroundStyle(DTheme.negative)
                } else if step.skipped {
                    Image(systemName: "forward").foregroundStyle(DTheme.inkTertiary)
                } else {
                    Image(systemName: "checkmark").foregroundStyle(DTheme.inkTertiary)
                }
            }
            .font(.system(size: 11.5, weight: .semibold))
            .frame(width: 14)
            if step.done {
                Text(label).foregroundStyle(DTheme.inkSecondary)
            } else {
                Text(label).tillyShimmer()
            }
        }
        .font(.system(size: 13.5, weight: .medium))
        .lineLimit(1)
    }
}

/// Under the conversation while a run works: the mark, what it's doing, how long.
struct TillyWorkingStatus: View {
    let label: String
    let since: Date?

    var body: some View {
        HStack(spacing: 9) {
            TillySpark(size: 13)
            Text(label).tillyShimmer()
            if let since {
                TimelineView(.periodic(from: since, by: 1)) { context in
                    let seconds = max(0, Int(context.date.timeIntervalSince(since)))
                    Text(seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s")
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .font(.system(size: 14, weight: .medium))
    }
}

/// Copy and share under a finished answer.
struct TillyTurnActions: View {
    let text: String
    @State private var copied = false

    var body: some View {
        HStack(spacing: 16) {
            Button {
                UIPasteboard.general.string = text
                withAnimation(.snappy) { copied = true }
                Task {
                    try? await Task.sleep(for: .seconds(1.5))
                    withAnimation(.snappy) { copied = false }
                }
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .contentTransition(.symbolEffect(.replace))
            }
            .accessibilityLabel("Copy answer")
            ShareLink(item: text) {
                Image(systemName: "square.and.arrow.up")
            }
            .accessibilityLabel("Share answer")
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(DTheme.inkTertiary)
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: copied) { _, new in new }
    }
}

// MARK: - Approval

/// A write Tilly wants to make, waiting on you: what it is, the fields that
/// matter in plain words, and Approve or Skip.
struct TillyApprovalCard: View {
    let pending: AssistantPending
    let currency: String
    let onDecide: (_ approve: Bool, _ always: Bool) -> Void

    @State private var showAll = false
    @State private var always = false

    private var entries: [(key: String, value: JSONValue)] {
        (pending.input?.objectValue ?? [:])
            .filter { !$0.value.isEmpty && !TillyLabels.isRecordID($0.value) }
            .sorted { $0.key < $1.key }
            .map { (key: $0.key, value: $0.value) }
    }

    var body: some View {
        let cents = Set(pending.cents ?? [])
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                TillyMark(size: 15, state: .attention)
                Text(pending.sends ? "Ready to send" : "Waiting for your approval")
                Spacer(minLength: 6)
                HStack(spacing: 4) {
                    if pending.sends { Image(systemName: "envelope") }
                    Text(pending.sends ? "Sends email" : "Changes data")
                }
                .font(.system(size: 11.5, weight: .medium))
                .padding(.horizontal, 8)
                .frame(height: 22)
                .background(DTheme.canvas.opacity(0.7), in: Capsule())
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(DTheme.tilly)
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(TillyColor.wash)

            VStack(alignment: .leading, spacing: 12) {
                Text(TillyLabels.action(pending.name))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)

                if !entries.isEmpty {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(showAll ? entries : Array(entries.prefix(6)), id: \.key) { entry in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(TillyLabels.field(entry.key))
                                    .foregroundStyle(DTheme.inkSecondary)
                                    .frame(width: 104, alignment: .leading)
                                Text(TillyLabels.value(entry.key, entry.value, cents: cents, currency: currency))
                                    .fontWeight(.medium)
                                    .foregroundStyle(DTheme.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.system(size: 14))
                        }
                    }
                }

                if showAll, let input = pending.input {
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(input.pretty)
                            .font(.system(size: 11.5, design: .monospaced))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(10)
                    }
                    .background(DTheme.tint, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .transition(.opacity)
                }

                if !pending.sends {
                    Toggle(isOn: $always) {
                        Text("Don't ask again for this in this chat")
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .toggleStyle(.switch)
                    .tint(DTheme.tilly)
                }

                HStack(spacing: 8) {
                    Button(pending.sends ? "Send" : "Approve") { onDecide(true, always) }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .frame(height: 40)
                        .background(TillyColor.t600, in: Capsule())
                        .buttonStyle(TapScaleStyle())
                    Button("Skip") { onDecide(false, false) }
                        .buttonStyle(SoftButtonStyle(size: .regular))
                        .frame(height: 40)
                    Spacer(minLength: 0)
                    Button(showAll ? "Fewer details" : "All details") {
                        withAnimation(.snappy) { showAll.toggle() }
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
        }
        .background(DTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(TillyColor.line, lineWidth: 1))
        .shadow(color: TillyColor.t600.opacity(0.16), radius: 18, y: 10)
        .sensoryFeedback(.warning, trigger: pending.id)
    }
}
