import Foundation
import AppKit
import ApplicationServices

// Browser bundle IDs that support URL extraction
let browserBundleIds: Set<String> = [
    "com.google.Chrome",
    "com.apple.Safari",
    "org.mozilla.firefox",
    "company.thebrowser.Browser",  // Arc
    "com.microsoft.edgemac",
    "com.brave.Browser",
    "com.operasoftware.Opera",
    "com.vivaldi.Vivaldi"
]

// Get the window title for a given PID using CGWindowListCopyWindowInfo
func getWindowTitle(pid: pid_t) -> String? {
    let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
    guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return nil
    }

    for window in windowList {
        guard let ownerPID = window[kCGWindowOwnerPID as String] as? pid_t,
              ownerPID == pid,
              let layer = window[kCGWindowLayer as String] as? Int,
              layer == 0 else {
            continue
        }
        if let name = window[kCGWindowName as String] as? String, !name.isEmpty {
            return name
        }
    }
    return nil
}

// Validate a string looks like a URL (matches BrowserURLService.isValidURL)
func isValidURL(_ string: String) -> Bool {
    let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") { return true }
    if trimmed.contains(".") && !trimmed.contains(" ") {
        let pattern = "^[a-zA-Z0-9][-a-zA-Z0-9]*(\\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(/.*)?$"
        if trimmed.range(of: pattern, options: .regularExpression) != nil {
            return true
        }
    }
    return false
}

// Recursively search AX element tree for a URL.
// Ported from BrowserURLService.findURLInElement: checks multiple roles (text
// field, combo box, text area), kAXURLAttribute directly, and AXDescription.
func findURLInElement(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 8) -> String? {
    if depth > maxDepth { return nil }

    var role: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
    let roleStr = role as? String ?? ""

    // Text-field-like roles: the URL bar is usually a text field or combo box
    if roleStr == kAXTextFieldRole as String ||
       roleStr == kAXComboBoxRole as String ||
       roleStr == kAXTextAreaRole as String {
        var value: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value) == .success,
           let urlString = value as? String, isValidURL(urlString) {
            return urlString
        }
    }

    // kAXDescriptionAttribute - some browsers put URL here directly
    var desc: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &desc) == .success,
       let descStr = desc as? String, isValidURL(descStr) {
        return descStr
    }

    // Description-based address-bar identification (fallback)
    if roleStr == kAXTextFieldRole as String ||
       roleStr == kAXComboBoxRole as String ||
       roleStr == kAXTextAreaRole as String {
        if let descStr = desc as? String {
            let descLower = descStr.lowercased()
            if descLower.contains("address") || descLower.contains("url") || descLower.contains("location") {
                var value: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value) == .success,
                   let urlString = value as? String, !urlString.isEmpty {
                    return urlString
                }
            }
        }
    }

    // kAXURLAttribute - some elements expose URL directly as URL or string
    var urlAttr: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXURLAttribute as CFString, &urlAttr) == .success {
        if let url = urlAttr as? URL {
            return url.absoluteString
        } else if let urlString = urlAttr as? String, isValidURL(urlString) {
            return urlString
        }
    }

    // Recurse into children
    var children: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children)
    if let childArray = children as? [AXUIElement] {
        for child in childArray {
            if let url = findURLInElement(child, depth: depth + 1, maxDepth: maxDepth) {
                return url
            }
        }
    }

    return nil
}

// Extract browser URL via Accessibility API.
// Matches BrowserURLService.fetchURLUsingAccessibility: tries window matching by
// title, falls back to focused window, then first window; and tries AXDocument
// on the window element (Safari).
func getBrowserURL(pid: pid_t, windowTitle: String?) -> String? {
    let appElement = AXUIElementCreateApplication(pid)

    var targetWindow: AXUIElement?

    // Strategy 1: match a specific window by title if provided
    if let wt = windowTitle, !wt.isEmpty {
        var windows: CFTypeRef?
        if AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windows) == .success,
           let windowArray = windows as? [AXUIElement] {
            for window in windowArray {
                var title: CFTypeRef?
                if AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title) == .success,
                   let titleString = title as? String {
                    if titleString == wt || wt.contains(titleString) || titleString.contains(wt) {
                        targetWindow = window
                        break
                    }
                }
            }
        }
    }

    // Strategy 2: focused window
    if targetWindow == nil {
        var focusedWindow: CFTypeRef?
        if AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindow) == .success,
           let fw = focusedWindow {
            targetWindow = (fw as! AXUIElement)
        }
    }

    // Strategy 3: first window in the list
    if targetWindow == nil {
        var windows: CFTypeRef?
        if AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windows) == .success,
           let windowArray = windows as? [AXUIElement], let first = windowArray.first {
            targetWindow = first
        }
    }

    guard let windowElement = targetWindow else { return nil }

    // Strategy A: recursive element search
    if let url = findURLInElement(windowElement) {
        return url
    }

    // Strategy B: AXDocument attribute (Safari)
    var documentURL: CFTypeRef?
    if AXUIElementCopyAttributeValue(windowElement, "AXDocument" as CFString, &documentURL) == .success,
       let urlString = documentURL as? String, isValidURL(urlString) {
        return urlString
    }

    // Strategy C: fall back to walking the full app element tree
    if let url = findURLInElement(appElement) {
        return url
    }

    return nil
}

// Main logic
func main() {
    let timestamp = Int(Date().timeIntervalSince1970)

    guard let frontApp = NSWorkspace.shared.frontmostApplication else {
        let output: [String: Any?] = [
            "app": nil,
            "bundleId": nil,
            "windowTitle": nil,
            "url": nil,
            "pid": nil,
            "timestamp": timestamp
        ]
        printJSON(output)
        return
    }

    let appName = frontApp.localizedName
    let bundleId = frontApp.bundleIdentifier
    let pid = frontApp.processIdentifier

    let windowTitle = getWindowTitle(pid: pid)

    var url: String? = nil
    if let bid = bundleId, browserBundleIds.contains(bid) {
        url = getBrowserURL(pid: pid, windowTitle: windowTitle)
    }

    let output: [String: Any?] = [
        "app": appName,
        "bundleId": bundleId,
        "windowTitle": windowTitle,
        "url": url,
        "pid": Int(pid),
        "timestamp": timestamp
    ]
    printJSON(output)
}

func printJSON(_ dict: [String: Any?]) {
    // Build JSON manually to handle nil values properly
    var parts: [String] = []
    // Use a stable key order for consistent output
    let orderedKeys = ["app", "bundleId", "windowTitle", "url", "pid", "timestamp"]
    for key in orderedKeys {
        guard let value = dict[key] else {
            parts.append("\"\(key)\":null")
            continue
        }
        if let val = value {
            if let s = val as? String {
                // Escape special JSON characters
                let escaped = s
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                    .replacingOccurrences(of: "\n", with: "\\n")
                    .replacingOccurrences(of: "\r", with: "\\r")
                    .replacingOccurrences(of: "\t", with: "\\t")
                parts.append("\"\(key)\":\"\(escaped)\"")
            } else if let i = val as? Int {
                parts.append("\"\(key)\":\(i)")
            } else {
                parts.append("\"\(key)\":null")
            }
        } else {
            parts.append("\"\(key)\":null")
        }
    }
    print("{\(parts.joined(separator: ","))}")
}

main()
