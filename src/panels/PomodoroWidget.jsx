import React, { useState, useEffect, useCallback } from 'react'
import { Timer, Play, Square } from 'lucide-react'
import { pomodoro } from '../services/pomodoroService'

const PRESETS = [
  { label: '15m', minutes: 15 },
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
  { label: '60m', minutes: 60 },
]

export default function PomodoroWidget() {
  const [state, setState] = useState(pomodoro.getState())
  const [selectedMinutes, setSelectedMinutes] = useState(25)
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  useEffect(() => {
    pomodoro.onStateChange = (s) => setState({ ...s })
    pomodoro.onTick = () => setState({ ...pomodoro.getState() })
    pomodoro.onComplete = () => setState({ ...pomodoro.getState() })

    return () => {
      pomodoro.onStateChange = null
      pomodoro.onTick = null
      pomodoro.onComplete = null
    }
  }, [])

  const handleStart = useCallback(() => {
    pomodoro.startFocusSession(selectedMinutes)
  }, [selectedMinutes])

  const handleStop = useCallback(() => {
    pomodoro.stopSession()
  }, [])

  const handleCustomSubmit = useCallback(() => {
    const val = parseInt(customInput, 10)
    if (val > 0 && val <= 180) {
      setSelectedMinutes(val)
      setShowCustom(false)
      setCustomInput('')
    }
  }, [customInput])

  // Progress for SVG circle (0 to 1)
  const progress = state.isActive && state.duration > 0
    ? state.remaining / state.duration
    : 0

  const circumference = 2 * Math.PI * 36 // radius = 36
  const strokeOffset = circumference * (1 - progress)

  return (
    <div className="pomodoro-widget">
      <div className="pomodoro-header">
        <Timer size={14} />
        <span className="pomodoro-label">Focus Session</span>
      </div>

      {/* Timer circle */}
      <div className="pomodoro-circle-wrap">
        <svg width="88" height="88" viewBox="0 0 88 88">
          {/* Background circle */}
          <circle
            cx="44" cy="44" r="36"
            fill="none"
            stroke="var(--border)"
            strokeWidth="4"
          />
          {/* Progress circle */}
          {state.isActive && (
            <circle
              cx="44" cy="44" r="36"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              transform="rotate(-90 44 44)"
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          )}
        </svg>
        <div className="pomodoro-time">
          {state.isActive
            ? pomodoro.formatTime(state.remaining)
            : pomodoro.formatTime(selectedMinutes * 60)
          }
        </div>
      </div>

      {/* Controls */}
      {!state.isActive ? (
        <>
          {/* Duration presets */}
          <div className="pomodoro-presets">
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                className={`pomodoro-preset ${selectedMinutes === p.minutes ? 'active' : ''}`}
                onClick={() => { setSelectedMinutes(p.minutes); setShowCustom(false) }}
              >
                {p.label}
              </button>
            ))}
            <button
              className={`pomodoro-preset ${showCustom ? 'active' : ''}`}
              onClick={() => setShowCustom(!showCustom)}
            >
              ...
            </button>
          </div>

          {/* Custom input */}
          {showCustom && (
            <div className="pomodoro-custom">
              <input
                type="number"
                className="input pomodoro-custom-input"
                placeholder="Min"
                min="1"
                max="180"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              />
              <button className="btn btn-primary pomodoro-custom-btn" onClick={handleCustomSubmit}>
                Set
              </button>
            </div>
          )}

          {/* Start button */}
          <button className="btn btn-primary pomodoro-start" onClick={handleStart}>
            <Play size={14} />
            Start
          </button>
        </>
      ) : (
        <button className="btn btn-danger pomodoro-stop" onClick={handleStop}>
          <Square size={14} />
          Stop
        </button>
      )}
    </div>
  )
}
