/**
 * Resolve the correct HTTP base URL for server calls based on the user's
 * ngrok setting in Firestore (users/{email}/Settings/OverlordSettings.ngrok).
 *
 * Mirrors the WebSocket logic in useWebSocket.js - when ngrok is true,
 * requests go to the local Python server exposed via ngrok instead of Railway.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebaseService';

const HTTP_RAILWAY = 'https://overlordserver.up.railway.app';
const HTTP_NGROK_DEFAULT = 'https://overlord.ngrok.app';
const HTTP_NGROK_EDDIE = 'https://overlord1.ngrok.app';

let _cachedBase = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 1000; // 30s - cheap enough to re-check

export async function getServerHttpBase() {
  const now = Date.now();
  if (_cachedBase && now < _cacheExpiry) return _cachedBase;

  const user = auth.currentUser;
  if (!user) return HTTP_RAILWAY;

  try {
    const userId = user.email || user.uid;
    const ref = doc(db, 'users', userId, 'Settings', 'OverlordSettings');
    const snap = await getDoc(ref);
    const settings = snap.exists() ? snap.data() : {};

    const raw = settings?.ngrok ?? false;
    const useNgrok = raw === true || raw === 'true' || raw === 'True';

    let base = HTTP_RAILWAY;
    if (useNgrok) {
      base = (user.email === 'eddie@forfeit.app' || user.email === 'support@forfeit.app')
        ? HTTP_NGROK_EDDIE
        : HTTP_NGROK_DEFAULT;
    }

    _cachedBase = base;
    _cacheExpiry = now + CACHE_TTL_MS;
    return base;
  } catch {
    return HTTP_RAILWAY;
  }
}

/** Invalidate the cache - call this when the ngrok flag is toggled. */
export function invalidateServerUrlCache() {
  _cachedBase = null;
  _cacheExpiry = 0;
}
