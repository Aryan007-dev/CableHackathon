import { useState } from 'react'
import { useAuth } from './AuthContext'
import styles from './AuthPanel.module.css'

type AuthPanelProps = {
  initialMode?: 'login' | 'signup'
  onClose: () => void
}

export default function AuthPanel({
  initialMode = 'login',
  onClose
}: AuthPanelProps) {
  const { signIn, signUp } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await signIn(email, password)
        onClose()
      } else {
        await signUp(email, password)
        alert('Check your email to confirm your account!')
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close"
        >
          ×
        </button>

        {/* Title */}
        <h2 className={styles.title}>
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>

        {/* Mode toggle tabs */}
        <div className={styles.modeTabs}>
          <button
            onClick={() => setMode('login')}
            className={`${styles.modeTab} ${mode === 'login' ? styles.active : styles.inactive}`}
          >
            Login
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`${styles.modeTab} ${mode === 'signup' ? styles.active : styles.inactive}`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Email field */}
          <div className={styles.formField}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
              placeholder="you@example.com"
            />
          </div>

          {/* Password field */}
          <div className={styles.formField}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={styles.input}
              placeholder="••••••••"
            />
            <small className={styles.helperText}>
              At least 6 characters
            </small>
          </div>

          {/* Error message */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Login' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  )
}
