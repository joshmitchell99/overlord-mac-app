//
// dailyUsageAggregation.js
//
// Port of DailyUsageAggregationService.swift
//
// Aggregates activity samples into { [appKey]: { totalSeconds, domain? } } for
// Firestore upload at users/{email}/Integrations/MacUsage/DailyData/{YYYY-MM-DD}.
//
// The Swift Mac app writes to the same Firestore doc, so key format must match.
// See DailyUsageAggregationService.swift for reference.
//

import { isBrowser, extractWebsite } from './websiteExtractor.js'

/**
 * Extract the hostname from a URL string, stripping a leading "www." prefix.
 * Returns null if the URL is malformed or has no host.
 *
 * Examples:
 *   "https://www.youtube.com/watch?v=xxx" -> "youtube.com"
 *   "https://x.com/home"                  -> "x.com"
 *   "reddit.com/r/bjj"                    -> "reddit.com"
 *   "not a url"                           -> null
 */
export function extractDomainFromURL(urlString) {
  if (!urlString || typeof urlString !== 'string') return null

  // Match Swift FaviconService.extractDomain: prepend https:// if no scheme.
  let normalized = urlString
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized
  }

  let host
  try {
    host = new URL(normalized).hostname
  } catch {
    return null
  }

  if (!host) return null

  if (host.startsWith('www.')) {
    host = host.slice(4)
  }

  return host.length === 0 ? null : host
}

/**
 * Build a display key from a URL's domain when extractWebsite can't help.
 * e.g. "example.com" -> "Example", "foo.co.uk" -> "Foo"
 *
 * Mirrors Swift FaviconService.extractDomainKey: takes the second-to-last
 * dot-separated part of the host and capitalizes its first letter.
 */
function domainKeyFromDomain(domain) {
  if (!domain) return null
  const parts = domain.split('.')
  let core
  if (parts.length >= 2) {
    core = parts[parts.length - 2]
  } else {
    core = domain
  }
  if (!core) return null
  return core.charAt(0).toUpperCase() + core.slice(1)
}

/**
 * Aggregate activity samples by app/website.
 *
 * Mirrors DailyUsageAggregationService.aggregateByAppWithDomains(entries:).
 *
 * For each sample:
 *   1. Skip if appName is "No Activity" (case-insensitive) or empty/null.
 *   2. If the app is a browser and the sample has a valid URL:
 *      - Parse the hostname (strip "www.") as the domain.
 *      - Prefer extractWebsite(appName, windowTitle) as the display key if it
 *        returns non-null; otherwise fall back to a capitalized form of the
 *        domain's main label (e.g. "example.com" -> "Example").
 *   3. Else if the app is a browser and there's no URL but has a windowTitle:
 *      - Use extractWebsite if non-null as the display key; no domain.
 *      - Otherwise fall back to appName; no domain.
 *   4. Else (native app): display key = appName; no domain.
 *
 * Multiple samples for the same key accumulate totalSeconds. If several samples
 * produce different domains for the same key, the first-seen domain is kept.
 *
 * @param {Array<{
 *   timestamp?: number,
 *   endTimestamp?: number,
 *   durationSeconds?: number,
 *   appName?: string,
 *   bundleId?: string|null,
 *   windowTitle?: string,
 *   url?: string|null
 * }>} samples
 * @returns {Object<string, {totalSeconds: number, domain?: string}>}
 */
export function aggregateByAppWithDomains(samples) {
  const result = {}
  if (!Array.isArray(samples)) return result

  for (const sample of samples) {
    if (!sample) continue

    const appName = sample.appName
    if (!appName || typeof appName !== 'string') continue
    if (appName.toLowerCase() === 'no activity') continue

    const windowTitle = sample.windowTitle || ''
    const url = sample.url || null
    const duration = Number.isFinite(sample.durationSeconds) ? sample.durationSeconds : 0

    const browser = isBrowser(appName)

    let key
    let domain = null

    if (browser && url) {
      const parsedDomain = extractDomainFromURL(url)
      if (parsedDomain) {
        domain = parsedDomain
        const extracted = extractWebsite(appName, windowTitle)
        if (extracted) {
          key = extracted
        } else {
          key = domainKeyFromDomain(parsedDomain) || parsedDomain
        }
      } else {
        // URL present but unparseable; treat like the no-URL browser case.
        const extracted = extractWebsite(appName, windowTitle)
        key = extracted || appName
      }
    } else if (browser) {
      const extracted = extractWebsite(appName, windowTitle)
      key = extracted || appName
    } else {
      key = appName
    }

    if (!result[key]) {
      result[key] = { totalSeconds: 0 }
    }
    result[key].totalSeconds += duration

    // Preserve the first-seen domain for this key.
    if (domain && !result[key].domain) {
      result[key].domain = domain
    }
  }

  return result
}

/**
 * Legacy projection: app-name -> total seconds, no domain info.
 * Equivalent to Swift's older aggregateByApp(entries:).
 *
 * @param {Array} samples
 * @returns {Object<string, number>}
 */
export function aggregateByApp(samples) {
  const aggregated = aggregateByAppWithDomains(samples)
  const out = {}
  for (const key of Object.keys(aggregated)) {
    out[key] = aggregated[key].totalSeconds
  }
  return out
}
