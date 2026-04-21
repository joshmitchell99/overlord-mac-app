import React, { useState } from 'react'
import { Shield, AlertCircle, Apple, Chrome, Loader2 } from 'lucide-react'
import {
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  sendPasswordReset,
} from '../services/firebaseService'

// Translate Firebase auth error codes / messages into friendly copy.
function humanizeAuthError(err) {
  if (!err) return 'Something went wrong. Please try again.'
  const code = err.code || ''
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.'
    case 'auth/missing-password':
      return 'Please enter a password.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/email-already-in-use':
      return 'An account with that email already exists. Try signing in.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/popup-blocked':
      return 'Popup was blocked by the browser. Please allow popups and retry.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    default:
      return err.message || 'Sign-in failed. Please try again.'
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  // loadingMethod: null | 'email' | 'google' | 'apple' | 'reset'
  const [loadingMethod, setLoadingMethod] = useState(null)

  const isBusy = loadingMethod !== null
  const emailDisabled = isBusy || !email.trim() || !password.trim()

  function clearMessages() {
    setError(null)
    setInfo(null)
  }

  async function handleEmailSubmit(e) {
    if (e) e.preventDefault()
    clearMessages()
    setLoadingMethod('email')
    try {
      await signInWithEmail(email.trim(), password)
    } catch (err) {
      console.error('[LoginScreen] Email auth failed:', err)
      setError(humanizeAuthError(err))
    } finally {
      setLoadingMethod(null)
    }
  }

  async function handleGoogle() {
    clearMessages()
    setLoadingMethod('google')
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('[LoginScreen] Google sign-in failed:', err)
      setError(humanizeAuthError(err))
    } finally {
      setLoadingMethod(null)
    }
  }

  async function handleApple() {
    clearMessages()
    setLoadingMethod('apple')
    try {
      await signInWithApple()
    } catch (err) {
      console.error('[LoginScreen] Apple sign-in failed:', err)
      setError(humanizeAuthError(err))
    } finally {
      setLoadingMethod(null)
    }
  }

  async function handleForgotPassword() {
    clearMessages()
    if (!email.trim()) {
      setError('Enter your email above, then tap Forgot password.')
      return
    }
    setLoadingMethod('reset')
    try {
      await sendPasswordReset(email.trim())
      setInfo('Password reset email sent. Check your inbox.')
    } catch (err) {
      console.error('[LoginScreen] Password reset failed:', err)
      setError(humanizeAuthError(err))
    } finally {
      setLoadingMethod(null)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <Shield size={40} strokeWidth={1.5} />
        </div>
        <h1 className="login-title">Sign in to Overlord</h1>
        <p className="login-subtitle">Sign in to sync your blocking settings</p>

        <form onSubmit={handleEmailSubmit} className="login-form">
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="login-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isBusy}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBusy}
            />
            <button
              type="button"
              className="login-forgot-link"
              onClick={handleForgotPassword}
              disabled={isBusy}
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          {info && !error && (
            <div className="login-info">
              <span>{info}</span>
            </div>
          )}

          <button
            type="submit"
            className="login-primary-btn"
            disabled={emailDisabled}
          >
            {loadingMethod === 'email' ? (
              <>
                <Loader2 size={14} className="login-spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in with Email</span>
            )}
          </button>
        </form>

        <div className="login-divider">
          <span className="login-divider-line" />
          <span className="login-divider-label">or</span>
          <span className="login-divider-line" />
        </div>

        <button
          type="button"
          className="login-provider-btn login-provider-google"
          onClick={handleGoogle}
          disabled={isBusy}
        >
          {loadingMethod === 'google' ? (
            <>
              <Loader2 size={16} className="login-spinner" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <Chrome size={16} strokeWidth={1.8} />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="login-provider-btn login-provider-apple"
          onClick={handleApple}
          disabled={isBusy}
        >
          {loadingMethod === 'apple' ? (
            <>
              <Loader2 size={16} className="login-spinner" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <Apple size={16} strokeWidth={1.8} />
              <span>Continue with Apple</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
