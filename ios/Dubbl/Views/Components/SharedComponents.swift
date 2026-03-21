import SwiftUI

// MARK: - Status Badge

struct StatusBadge: View {
    let text: String
    let color: Color

    init(_ text: String, color: Color = .dubblPrimary) {
        self.text = text
        self.color = color
    }

    init(invoiceStatus: InvoiceStatus) {
        self.text = invoiceStatus.displayName
        switch invoiceStatus {
        case .draft: self.color = .gray
        case .sent: self.color = .dubblInfo
        case .partial: self.color = .dubblWarning
        case .paid: self.color = .dubblPrimary
        case .overdue: self.color = .dubblDestructive
        case .void: self.color = .gray
        }
    }

    init(billStatus: BillStatus) {
        self.text = billStatus.displayName
        switch billStatus {
        case .draft: self.color = .gray
        case .pendingApproval: self.color = .dubblWarning
        case .received: self.color = .dubblInfo
        case .partial: self.color = .dubblWarning
        case .paid: self.color = .dubblPrimary
        case .overdue: self.color = .dubblDestructive
        case .void: self.color = .gray
        }
    }

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .cornerRadius(6)
    }
}

// MARK: - Currency Text

struct CurrencyText: View {
    let amount: Int
    let currencyCode: String
    var style: Font = .body
    var weight: Font.Weight = .regular

    init(_ amount: Int?, currency: String? = "USD", style: Font = .body, weight: Font.Weight = .regular) {
        self.amount = amount ?? 0
        self.currencyCode = currency ?? "USD"
        self.style = style
        self.weight = weight
    }

    var body: some View {
        Text(amount.asCurrency(code: currencyCode))
            .font(style)
            .fontWeight(weight)
    }
}

// MARK: - Loading View

struct LoadingView: View {
    var message: String = "Loading..."

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(.dubblPrimary)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.dubblMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Error View

struct ErrorView: View {
    let message: String
    var retryAction: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(.dubblDestructive)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.dubblMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            if let retryAction = retryAction {
                Button("Try Again", action: retryAction)
                    .buttonStyle(DubblButtonStyle())
                    .frame(width: 160)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Empty State

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundColor(.dubblPrimary.opacity(0.5))
            Text(title)
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.dubblMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            if let actionTitle = actionTitle, let action = action {
                Button(actionTitle, action: action)
                    .buttonStyle(DubblButtonStyle())
                    .frame(width: 200)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Search Bar

struct DubblSearchBar: View {
    @Binding var text: String
    var placeholder: String = "Search..."

    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.dubblMuted)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
            if !text.isEmpty {
                Button(action: { text = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.dubblMuted)
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    var action: (() -> Void)?
    var actionLabel: String = "See All"

    var body: some View {
        HStack {
            Text(title)
                .font(.headline)
            Spacer()
            if let action = action {
                Button(actionLabel, action: action)
                    .font(.subheadline)
                    .foregroundColor(.dubblPrimary)
            }
        }
    }
}

// MARK: - Filter Chips

struct FilterChips<T: Hashable>: View {
    let options: [(label: String, value: T?)]
    @Binding var selected: T?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(0..<options.count, id: \.self) { index in
                    let option = options[index]
                    let isSelected = selected == option.value || (selected == nil && option.value == nil)

                    Button(action: { selected = option.value }) {
                        Text(option.label)
                            .font(.system(size: 14, weight: isSelected ? .semibold : .regular))
                            .foregroundColor(isSelected ? .white : .primary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(isSelected ? Color.dubblPrimary : Color(.systemGray6))
                            .cornerRadius(20)
                    }
                }
            }
            .padding(.horizontal)
        }
    }
}

// MARK: - Detail Row

struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.dubblMuted)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    var color: Color = .dubblPrimary
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(color)
                Spacer()
            }
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(title)
                .font(.caption)
                .foregroundColor(.dubblMuted)
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.caption2)
                    .foregroundColor(color)
            }
        }
        .padding(14)
        .background(Color.dubblCardBackground)
        .cornerRadius(10)
        .shadow(color: Color.black.opacity(0.04), radius: 4, x: 0, y: 2)
    }
}
