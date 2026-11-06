# dubbl for iOS

A native SwiftUI app for iPhone (iOS 26+, Liquid Glass) that talks to the same
`/api/v1` routes as the web app. No third-party packages.

## Run

1. Open `ios/Dubbl.xcodeproj` in Xcode 26 or later and run the **Dubbl** scheme.
2. Tap the server button on the sign-in screen to choose dubbl Cloud, a self-hosted
   server, or `http://localhost:3000` (run `pnpm dev` at the repo root).
3. Tap **Continue**. The server's sign-in page opens in a browser sheet. After you
   approve the device, the app trades the one-time code for its own tokens (PKCE).

The project uses a folder-synchronized group: any `.swift` file under `Dubbl/`
is compiled, so there's no need to touch the project file.

Quick check without Xcode open:

```bash
xcodebuild -project ios/Dubbl.xcodeproj -scheme Dubbl \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

## Demo mode (debug builds)

Launch with `DUBBL_DEMO=1` to sign in to a fake organization served from fixtures
(`Features/*/*+Demo.swift`). This is handy for screenshots and for working on UI
without a server:

```bash
SIMCTL_CHILD_DUBBL_DEMO=1 SIMCTL_CHILD_DUBBL_DEMO_TAB=sales \
  xcrun simctl launch booted dev.dubbl.app
```

`DUBBL_DEMO_TAB` picks the tab (`home`, `sales`, `purchases`, `contacts`, `search`).
`DUBBL_DEMO_OPEN` opens a screen directly (`invoice`, `bill`, `expense`,
`new-expense`, `contact`, `settings`).

## Layout

- `Core/`: API client (bearer tokens in the Keychain, refresh on expiry or 401),
  session and organization switching, Face ID lock, formatting, router, demo data
- `DesignSystem/`: the theme (the web's monochrome palette), components and the trend chart
- `Features/`: Auth, Home (overview, bank accounts), Notifications, Sales (invoices),
  Purchases (bills, expenses, receipt scanning), Contacts, Search, Settings

## Conventions

- Amounts are integers in the currency's minor units. Format them with `Money`.
  Some create endpoints take decimal major units (invoice line prices, expense
  amounts). Check the route before you post.
- Use `DTheme` tokens only. Selected states use a grey tint, not white chips.
- Copy is in sentence case with no em dashes.
- Every screen loads with `.task` and supports pull to refresh. Stores are
  `@MainActor @Observable`.

## Release

Set your team in Signing & Capabilities, then Product → Archive. The bundle ID is
`dev.dubbl.app`. The `dubbl://auth/callback` redirect must stay registered (Info.plist)
and match `APP_REDIRECT_URIS` in `lib/api/app-auth.ts`.
