import SwiftUI

/// Clean text field for auth screens.
struct AuthTextField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var isFocused: Bool = false
    var contentType: UITextContentType? = nil
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isFocused ? Color(.label) : Color(.secondaryLabel))

            TextField(placeholder, text: $text)
                .font(.system(size: 15))
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Color(.systemBackground))
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(isFocused ? Color.emerald500 : Color(.separator).opacity(0.6), lineWidth: isFocused ? 1.5 : 1)
                )
                .shadow(color: isFocused ? Color.emerald500.opacity(0.08) : .clear, radius: 4, y: 1)
                .textContentType(contentType)
                .keyboardType(keyboard)
                .autocapitalization(.none)
                .autocorrectionDisabled()
        }
        .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}

/// Clean password field with visibility toggle.
struct AuthPasswordField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var isFocused: Bool = false
    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isFocused ? Color(.label) : Color(.secondaryLabel))

            HStack(spacing: 0) {
                Group {
                    if revealed {
                        TextField(placeholder, text: $text)
                    } else {
                        SecureField(placeholder, text: $text)
                    }
                }
                .font(.system(size: 15))
                .textContentType(.password)

                Button {
                    revealed.toggle()
                } label: {
                    Image(systemName: revealed ? "eye.slash" : "eye")
                        .font(.system(size: 14))
                        .foregroundColor(Color(.tertiaryLabel))
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .frame(height: 48)
            .background(Color(.systemBackground))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isFocused ? Color.emerald500 : Color(.separator).opacity(0.6), lineWidth: isFocused ? 1.5 : 1)
            )
            .shadow(color: isFocused ? Color.emerald500.opacity(0.08) : .clear, radius: 4, y: 1)
        }
        .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}
