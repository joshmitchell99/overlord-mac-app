import Cocoa
import Foundation
import ScreenCaptureKit

// Parse command-line arguments
let args = CommandLine.arguments

func printJSON(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func fail(_ message: String) -> Never {
    printJSON(["success": false, "error": message])
    exit(1)
}

guard args.count >= 2 else {
    fail("Usage: screen-capture <output-path> [--quality 0.5] [--scale 0.5]")
}

let outputPath = args[1]
var quality: Double = 0.5
var scale: Double = 0.5

// Parse optional flags
var i = 2
while i < args.count {
    if args[i] == "--quality" && i + 1 < args.count {
        quality = Double(args[i + 1]) ?? 0.5
        i += 2
    } else if args[i] == "--scale" && i + 1 < args.count {
        scale = Double(args[i + 1]) ?? 0.5
        i += 2
    } else {
        i += 1
    }
}

// Use a semaphore to make async ScreenCaptureKit work in a CLI context
let semaphore = DispatchSemaphore(value: 0)
var captureResult: [String: Any]?

Task {
    do {
        // Get shareable content (displays, windows, apps)
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

        guard let display = content.displays.first else {
            fail("No displays found")
        }

        // Create a filter that includes the entire display
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Configure the capture
        let config = SCStreamConfiguration()
        let scaledWidth = Int(Double(display.width) * scale)
        let scaledHeight = Int(Double(display.height) * scale)
        config.width = scaledWidth
        config.height = scaledHeight
        config.showsCursor = false
        config.captureResolution = .nominal

        // Capture a single screenshot
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

        // Convert CGImage to JPEG data
        let bitmapRep = NSBitmapImageRep(cgImage: image)
        guard let jpegData = bitmapRep.representation(
            using: .jpeg,
            properties: [.compressionFactor: NSNumber(value: quality)]
        ) else {
            fail("Failed to compress image as JPEG")
        }

        // Write to file
        let url = URL(fileURLWithPath: outputPath)
        try jpegData.write(to: url)

        captureResult = [
            "success": true,
            "path": outputPath,
            "width": scaledWidth,
            "height": scaledHeight,
            "bytes": jpegData.count
        ]
    } catch {
        captureResult = [
            "success": false,
            "error": error.localizedDescription
        ]
    }
    semaphore.signal()
}

semaphore.wait()
if let result = captureResult {
    printJSON(result)
    let success = result["success"] as? Bool ?? false
    exit(success ? 0 : 1)
} else {
    fail("Capture timed out")
}
