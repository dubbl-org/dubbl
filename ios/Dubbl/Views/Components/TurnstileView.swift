import SwiftUI
import WebKit

/// Cloudflare Turnstile site key. Set to nil to disable captcha.
/// Must match NEXT_PUBLIC_TURNSTILE_SITE_KEY in the web app.
let turnstileSiteKey: String? = nil

/// Renders a Cloudflare Turnstile captcha widget via WKWebView.
/// Calls `onToken` with the verification token on success.
struct TurnstileView: UIViewRepresentable {
    let siteKey: String
    var onToken: (String) -> Void
    var onError: ((String) -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(onToken: onToken, onError: onError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "turnstile")
        config.websiteDataStore = WKWebsiteDataStore.default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.navigationDelegate = context.coordinator

        let html = Self.turnstileHTML(siteKey: siteKey)
        webView.loadHTMLString(html, baseURL: URL(string: "https://dubbl.dev"))

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    // MARK: - HTML

    private static func turnstileHTML(siteKey: String) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit" async defer></script>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              background: transparent;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 65px;
              overflow: hidden;
            }
          </style>
        </head>
        <body>
          <div id="turnstile-widget"></div>
          <script>
            function onTurnstileLoad() {
              turnstile.render('#turnstile-widget', {
                sitekey: '\(siteKey)',
                size: 'flexible',
                theme: 'auto',
                retry: 'auto',
                callback: function(token) {
                  window.webkit.messageHandlers.turnstile.postMessage(token);
                },
                'error-callback': function(errorCode) {
                  window.webkit.messageHandlers.turnstile.postMessage('ERROR:' + errorCode);
                },
                'expired-callback': function() {
                  window.webkit.messageHandlers.turnstile.postMessage('EXPIRED');
                }
              });
            }
          </script>
        </body>
        </html>
        """
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let onToken: (String) -> Void
        let onError: ((String) -> Void)?

        init(onToken: @escaping (String) -> Void, onError: ((String) -> Void)?) {
            self.onToken = onToken
            self.onError = onError
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard let body = message.body as? String else { return }

            if body.hasPrefix("ERROR:") {
                onError?(String(body.dropFirst(6)))
            } else if body == "EXPIRED" {
                onError?("Token expired")
            } else {
                onToken(body)
            }
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let url = navigationAction.request.url
            if url == nil
                || url?.scheme == "about"
                || url?.host?.hasSuffix("cloudflare.com") == true
                || url?.host == "dubbl.dev" {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}
