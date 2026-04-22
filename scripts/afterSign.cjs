// Re-signs the Swift helper binaries bundled in Resources/native/ with the
// same identity as the parent app and the project's entitlements file.
//
// Why this exists: electron-builder auto-signs the main .app and the
// Electron Helper variants, but its handling of arbitrary executables in
// extraResources is inconsistent across versions. Some helpers (nsfw-scan
// in particular) need specific entitlements embedded in their own
// signature - on macOS, spawned subprocesses do NOT inherit entitlements
// from the parent. Doing it ourselves here is explicit and bulletproof.

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const HELPERS = ['app-monitor', 'overlay-host', 'nsfw-scan', 'screen-capture']

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  const nativeDir = path.join(appPath, 'Contents', 'Resources', 'native')

  const identity = process.env.CSC_NAME
  if (!identity) {
    console.warn('[afterSign] CSC_NAME not set - skipping helper re-sign. ' +
      'Packaged build will not work with hardened runtime.')
    return
  }

  const entitlements = path.join(context.packager.info.projectDir, 'build', 'entitlements.mac.plist')
  if (!fs.existsSync(entitlements)) {
    throw new Error(`[afterSign] entitlements not found at ${entitlements}`)
  }

  for (const name of HELPERS) {
    const bin = path.join(nativeDir, name)
    if (!fs.existsSync(bin)) {
      console.warn(`[afterSign] helper not found, skipping: ${bin}`)
      continue
    }
    console.log(`[afterSign] signing ${name}`)
    execFileSync('codesign', [
      '--force',
      '--sign', identity,
      '--options', 'runtime',
      '--entitlements', entitlements,
      '--timestamp',
      bin,
    ], { stdio: 'inherit' })
  }

  console.log('[afterSign] all helpers signed')
}
