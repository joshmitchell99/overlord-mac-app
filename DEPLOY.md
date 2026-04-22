# Deploy checklist

- Bundle ID: `app.forfeit.OverlordMacScreenUtil` (shared with Swift app)
- Team ID: `A2CJRG8KKK` (from Swift project's DEVELOPMENT_TEAM)
- Entitlements: `build/entitlements.mac.plist` - slim, Electron-specific.
  Swift entitlements at `../OverlordMacScreenUtil/OverlordMacScreenUtil.entitlements`
  are the reference; keep overlapping keys in sync when you edit either.

## First-time setup

1. **Developer ID Application cert**. The Swift project uses "Apple Development"
   for local builds, but **distribution** requires "Developer ID Application"
   tied to team `A2CJRG8KKK`. Get it via Xcode > Settings > Accounts > Manage
   Certificates > "+" > Developer ID Application. Or via developer.apple.com.
   Verify with:
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```

2. **App-specific password** for notarytool. appleid.apple.com > Sign-In and
   Security > App-Specific Passwords > Generate. Label it e.g. "overlord-notarize".

3. **Environment variables** (add to `~/.zshrc` or a shell-loaded `.env`):
   ```bash
   export APPLE_ID="you@forfeit.app"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="A2CJRG8KKK"
   export CSC_NAME="Developer ID Application: Your Name (A2CJRG8KKK)"
   ```

4. **GitHub token** for electron-updater publishing:
   ```bash
   export GH_TOKEN="ghp_..."
   ```

5. **Confirm the publish repo** in [package.json](package.json) exists. Currently
   set to `joshmitchell99/overlord-mac-react` - change if different.

## Per-release

```bash
# Bump version
cd overlord-mac-app/react-version
npm version patch   # or minor/major

# Build native Swift helpers (only needed if you changed any .swift files)
cd native && ./build.sh && cd ..

# Package + sign + notarize + publish
npm run build -- --publish always
```

electron-builder will:
- Run `vite build`
- Code-sign the .app with `CSC_NAME`
- Sign the helper binaries in Resources/native/
- Notarize the `.dmg` via notarytool
- Upload the release to the GitHub repo set in `build.publish`

## Verify

```bash
cd dist

# Confirm main app signed with Developer ID Application, team A2CJRG8KKK
codesign -dv --verbose=4 mac/Overlord.app 2>&1 | grep -E "Authority|TeamIdentifier"

# Confirm each helper is signed
for bin in nsfw-scan overlay-host app-monitor screen-capture; do
  echo "=== $bin ==="
  codesign -dv mac/Overlord.app/Contents/Resources/native/$bin 2>&1 | grep Authority
done

# Confirm the .dmg has a stapled notarization ticket
xcrun stapler validate Overlord-<version>.dmg
```

## Testing the release

- Open the .dmg on a Mac that's never had the Electron Overlord installed
  (or a fresh user account). First-run should trigger these permission
  prompts in order, each with the usage string from `extendInfo`:
  - Screen Recording (from `NSScreenCaptureUsageDescription`)
  - Accessibility (from `NSAccessibilityUsageDescription`)
  - Automation control (from `NSAppleEventsUsageDescription`)
- Verify Sensitive Content Warning works (enable in System Settings >
  Privacy & Security, then confirm the permission row flips to green and
  `nsfw-scan --check-policy` returns `{"enabled":true}`).
- Confirm URL tracking extracts real URLs (not just window titles).
- Confirm block overlay, countdown, and check-in overlays all fire correctly.

## Gotchas

- Hardened runtime + no Developer ID cert = Gatekeeper kills the helpers.
  Symptoms: blocking overlay never appears, Console.app shows `codesign-check
  failed` or `library not valid on system`.
- If permissions reset after every build, your signing identity changed
  between builds. Always use the same cert.
- `com.apple.developer.sensitivecontentanalysis.client` entitlement requires
  your provisioning profile to have the Sensitive Content Analysis capability
  enabled on developer.apple.com. If NSFW scans all return `skipped`, check
  the profile.
- The Swift app's entitlements include extras like `associated-domains` and
  `photos-library` that the Electron app doesn't need. Don't copy blindly;
  added entitlements that aren't covered by your provisioning profile will
  make the build fail to sign.
