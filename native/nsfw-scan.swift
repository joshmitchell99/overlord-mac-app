// nsfw-scan.swift
// CLI tool that runs Apple's SensitiveContentAnalysis on a JPEG image.
//
// Usage: nsfw-scan <image-path>
// Output: JSON to stdout with result field (clean/flagged/error/skipped)
//
// Compile: swiftc -O -framework Cocoa -framework SensitiveContentAnalysis nsfw-scan.swift -o nsfw-scan

import Foundation
import AppKit
import SensitiveContentAnalysis

func printJSON(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func timestamp() -> Int {
    return Int(Date().timeIntervalSince1970)
}

// -- Validate arguments --

guard CommandLine.arguments.count >= 2 else {
    printJSON(["result": "error", "error": "Usage: nsfw-scan <image-path>|--check-policy", "timestamp": timestamp()])
    exit(1)
}

let firstArg = CommandLine.arguments[1]

// -- Policy-only mode: report whether Sensitive Content Analysis is enabled.
// Used by the Permissions UI to show the user's current OS-level setting
// without needing to actually scan an image.

if firstArg == "--check-policy" {
    guard #available(macOS 14.0, *) else {
        printJSON(["enabled": false, "reason": "Requires macOS 14+"])
        exit(0)
    }
    let analyzer = SCSensitivityAnalyzer()
    let enabled = analyzer.analysisPolicy != .disabled
    printJSON(["enabled": enabled])
    exit(0)
}

let imagePath = firstArg

// -- Check macOS version --

guard #available(macOS 14.0, *) else {
    printJSON(["result": "skipped", "error": "Requires macOS 14+", "timestamp": timestamp()])
    exit(0)
}

// -- Load image --

guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    printJSON(["result": "error", "error": "Failed to load image at path", "timestamp": timestamp()])
    exit(1)
}

// -- Check policy --

let analyzer = SCSensitivityAnalyzer()
let policy = analyzer.analysisPolicy

guard policy != .disabled else {
    printJSON(["result": "skipped", "error": "Sensitive content analysis disabled in System Settings", "timestamp": timestamp()])
    exit(0)
}

// -- Run analysis --

let semaphore = DispatchSemaphore(value: 0)
var isSensitive = false
var analysisError: String? = nil

Task {
    do {
        let response = try await analyzer.analyzeImage(cgImage)
        isSensitive = response.isSensitive
    } catch {
        analysisError = error.localizedDescription
    }
    semaphore.signal()
}

semaphore.wait()

if let err = analysisError {
    printJSON(["result": "error", "error": err, "timestamp": timestamp()])
} else {
    let resultStr = isSensitive ? "flagged" : "clean"
    printJSON(["result": resultStr, "path": imagePath, "timestamp": timestamp()])
}
