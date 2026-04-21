#!/bin/bash
cd "$(dirname "$0")"
swiftc -O -framework Cocoa -framework ApplicationServices app-monitor.swift -o app-monitor
echo "Built native/app-monitor"
swiftc -O -framework Cocoa -framework ScreenCaptureKit screen-capture.swift -o screen-capture
echo "Built native/screen-capture"
swiftc -O -framework Cocoa -framework SensitiveContentAnalysis nsfw-scan.swift -o nsfw-scan
echo "Built native/nsfw-scan"
swiftc -O -framework Cocoa -framework WebKit overlay-host.swift -o overlay-host
echo "Built native/overlay-host"
