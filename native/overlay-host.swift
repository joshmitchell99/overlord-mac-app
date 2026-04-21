// overlay-host.swift
// Native macOS overlay helper that creates NSPanel windows at CGShieldingWindowLevel
// with embedded WKWebView to render React overlay content.
//
// Usage:
//   overlay-host show <url> [--type blocking|checkin] [--all-screens]
//   overlay-host dismiss
//
// Communication: listens on stdin for commands (JSON lines), writes status to stdout.
// This stays running as a long-lived child process of Electron.

import Cocoa
import WebKit

// MARK: - BlockerPanel (appears over fullscreen apps)

class BlockerPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    override init(
        contentRect: NSRect,
        styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType,
        defer flag: Bool
    ) {
        super.init(
            contentRect: contentRect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: backingStoreType,
            defer: flag
        )
        self.isFloatingPanel = true
        self.becomesKeyOnlyIfNeeded = false
        self.worksWhenModal = true
    }
}

// MARK: - Overlay Manager

class OverlayManager: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    static let shared = OverlayManager()

    private var panels: [NSPanel] = []
    private var previousActivationPolicy: NSApplication.ActivationPolicy = .regular
    private var currentType: String = "blocking"

    func show(url: String, type: String, allScreens: Bool, clickThrough: Bool = false, silent: Bool = false) {
        dismiss(silent: silent)
        currentType = type

        // Save and switch activation policy - required for panels over fullscreen apps
        previousActivationPolicy = NSApp.activationPolicy()
        NSApp.setActivationPolicy(.accessory)

        let screens = allScreens ? NSScreen.screens : [NSScreen.main].compactMap { $0 }

        for screen in screens {
            let panel = BlockerPanel(
                contentRect: screen.frame,
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )

            // Create WKWebView with message handler for JS -> native communication
            let config = WKWebViewConfiguration()
            let contentController = WKUserContentController()
            contentController.add(self, name: "overlayHost")
            contentController.add(self, name: "overlayConsole")

            // Override console.log/error/warn to forward to native stdout
            let consoleScript = WKUserScript(source: """
                (function() {
                  const orig = { log: console.log, warn: console.warn, error: console.error };
                  function forward(level, args) {
                    try {
                      const msg = Array.from(args).map(a => {
                        if (a instanceof Error) return a.stack || a.message;
                        if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
                        return String(a);
                      }).join(' ');
                      window.webkit.messageHandlers.overlayConsole.postMessage({ level, msg });
                    } catch {}
                  }
                  console.log = function(...args) { forward('log', args); orig.log.apply(console, args); };
                  console.warn = function(...args) { forward('warn', args); orig.warn.apply(console, args); };
                  console.error = function(...args) { forward('error', args); orig.error.apply(console, args); };
                  window.addEventListener('error', (e) => forward('error', ['Uncaught:', e.message, e.filename + ':' + e.lineno]));
                  window.addEventListener('unhandledrejection', (e) => forward('error', ['UnhandledRejection:', e.reason?.message || e.reason]));
                })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            contentController.addUserScript(consoleScript)

            config.userContentController = contentController

            // Allow loading local dev server
            if #available(macOS 14.0, *) {
                config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
            }

            let webView = WKWebView(frame: screen.frame, configuration: config)
            webView.navigationDelegate = self
            webView.setValue(false, forKey: "drawsBackground")
            webView.allowsBackForwardNavigationGestures = false

            // Enable Web Inspector for debugging (right-click -> Inspect Element)
            if #available(macOS 13.3, *) {
                webView.isInspectable = true
            }
            // Also enable dev extras via defaults
            UserDefaults.standard.setValue(true, forKey: "WebKitDeveloperExtras")

            // Load the React overlay URL
            if let requestURL = URL(string: url) {
                webView.load(URLRequest(url: requestURL))
            }

            // For the block overlay we add native blur + a dark overlay behind
            // the webview so the UI sits over a consistent dark backdrop.
            // For click-through countdown panels we skip both - the webview
            // draws a semi-transparent grey directly over the user's app and
            // clicks pass through to whatever is underneath.
            let container = NSView(frame: screen.frame)
            container.autoresizingMask = [.width, .height]
            container.wantsLayer = true

            if !clickThrough {
                let effectView = NSVisualEffectView(frame: screen.frame)
                effectView.autoresizingMask = [.width, .height]
                effectView.material = .hudWindow
                effectView.blendingMode = .behindWindow
                effectView.state = .active
                effectView.appearance = NSAppearance(named: .vibrantDark)
                container.addSubview(effectView)

                let darkOverlay = NSView(frame: screen.frame)
                darkOverlay.autoresizingMask = [.width, .height]
                darkOverlay.wantsLayer = true
                darkOverlay.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.45).cgColor
                container.addSubview(darkOverlay)
            }

            webView.frame = container.bounds
            webView.autoresizingMask = [.width, .height]
            container.addSubview(webView)

            panel.contentView = container

            // CGShieldingWindowLevel + 1 - above fullscreen apps
            panel.level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)
            // canJoinAllSpaces + stationary - appears on all Spaces including fullscreen
            panel.collectionBehavior = [.canJoinAllSpaces, .stationary]
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.isReleasedWhenClosed = false
            panel.hidesOnDeactivate = false
            // Click-through: OS routes mouse events past the panel to whatever
            // window is underneath so the user can actually close their app.
            panel.ignoresMouseEvents = clickThrough

            panel.orderFrontRegardless()
            if !clickThrough {
                panel.makeKey()
            }

            panels.append(panel)
        }

        // Restore activation policy after panels are shown
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NSApp.setActivationPolicy(.regular)
        }

        sendStatus(["event": "shown", "type": type, "screens": screens.count])
    }

    func dismiss(silent: Bool = false) {
        // Only emit the dismissed event if we actually had panels to close.
        // show() calls dismiss() up front to clear any prior overlay, and
        // firing a spurious dismissed event there creates a show/dismiss
        // feedback loop with the JS-side suppression flag.
        // silent=true is used when transitioning between panel types (e.g.
        // block -> countdown) so the engine's _overlayShownAt flag stays set
        // across the seamless handoff.
        let hadPanels = !panels.isEmpty
        for panel in panels {
            panel.orderOut(nil)
            panel.close()
        }
        panels.removeAll()
        if hadPanels && !silent {
            sendStatus(["event": "dismissed", "type": currentType])
        }
    }

    // MARK: - WKScriptMessageHandler (JS -> Native)

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        // Console forwarding from the WKWebView
        if message.name == "overlayConsole" {
            if let body = message.body as? [String: Any] {
                let level = body["level"] as? String ?? "log"
                let msg = body["msg"] as? String ?? ""
                FileHandle.standardError.write("[overlay-web-\(level)] \(msg)\n".data(using: .utf8) ?? Data())
            }
            return
        }

        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "dismiss":
            dismiss()
        case "status":
            // Forward status from React overlay to Electron
            sendStatus(["event": "overlay-action", "data": body])
        case "show-countdown":
            // Transition from block overlay to a click-through countdown panel.
            // URL is built by the caller (renderer) to include mode/seconds/
            // appName as hash params for the CountdownOverlay React component.
            if let url = body["url"] as? String {
                show(url: url, type: "countdown", allScreens: true, clickThrough: true, silent: true)
            }
        default:
            break
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        didFinish navigation: WKNavigation!
    ) {
        // Inject the native bridge so the React overlay can call back
        let js = """
        window.nativeOverlay = {
            dismiss: function() {
                window.webkit.messageHandlers.overlayHost.postMessage({ action: 'dismiss' });
            },
            sendStatus: function(data) {
                window.webkit.messageHandlers.overlayHost.postMessage({ action: 'status', ...data });
            },
            showCountdown: function(url) {
                window.webkit.messageHandlers.overlayHost.postMessage({ action: 'show-countdown', url: url });
            }
        };
        // Also wire up electronAPI.dismissOverlay to use native dismiss
        if (!window.electronAPI) { window.electronAPI = {}; }
        window.electronAPI.dismissOverlay = function(type) {
            window.nativeOverlay.dismiss();
        };
        window.electronAPI.isElectron = true;
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        sendStatus(["event": "error", "message": error.localizedDescription])
    }

    // MARK: - Communication with Electron (stdout)

    private func sendStatus(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }
}

// MARK: - Stdin Command Reader

class StdinReader {
    private let queue = DispatchQueue(label: "stdin-reader")

    func start() {
        queue.async {
            while let line = readLine() {
                guard let data = line.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let command = json["command"] as? String else {
                    continue
                }

                DispatchQueue.main.async {
                    self.handleCommand(command, json: json)
                }
            }
            // stdin closed - parent process exited
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
        }
    }

    private func handleCommand(_ command: String, json: [String: Any]) {
        switch command {
        case "show":
            let url = json["url"] as? String ?? ""
            let type = json["type"] as? String ?? "blocking"
            let allScreens = json["allScreens"] as? Bool ?? (type == "blocking")
            OverlayManager.shared.show(url: url, type: type, allScreens: allScreens)

        case "dismiss":
            OverlayManager.shared.dismiss()

        case "quit":
            OverlayManager.shared.dismiss()
            NSApp.terminate(nil)

        default:
            break
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    let stdinReader = StdinReader()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // No dock icon or menu bar for this helper
        NSApp.setActivationPolicy(.accessory)

        // Start reading commands from stdin
        stdinReader.start()

        // Signal ready
        let ready: [String: Any] = ["event": "ready"]
        if let data = try? JSONSerialization.data(withJSONObject: ready),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }
}

// MARK: - Main

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
