import { useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'

import { useAuth } from './AuthContext'
import AuthPanel from './AuthPanel'
import styles from './Toolbar.module.css'

const ICON = { size: 18, strokeWidth: 1.75 } as const

// Account controls for the right end of the toolbar: log in / sign up when
// signed out, email + log out when signed in.
export default function AccountButtons() {
  const { user, signOut } = useAuth()
  // Which auth modal is open, if any.
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null)

  return (
    <>
      {user ? (
        <>
          <span className={styles.email} title={user.email}>{user.email}</span>
          <div className={styles.group}>
            <button type="button" className={styles.btn} onClick={() => signOut()}>
              <LogOut {...ICON} /> Log out
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.group}>
            <button type="button" className={styles.btn} onClick={() => setAuthMode('login')} title="Log in">
              <LogIn {...ICON} /> <span className={styles.label}>Log in</span>
            </button>
          </div>
          <button type="button" className={styles.primary} onClick={() => setAuthMode('signup')}>
            Sign up
          </button>
        </>
      )}

      {authMode && (
        <AuthPanel initialMode={authMode} onClose={() => setAuthMode(null)} />
      )}
    </>
  )
}
