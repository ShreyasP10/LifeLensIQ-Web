import { useState } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  doc,
  setDoc,
} from '../firebase.js';

async function afterAuth(user) {
  await setDoc(
    doc(db, 'users', user.uid, 'settings', 'profile'),
    { email: user.email, createdAt: Date.now(), domainCategories: {}, updatedAt: Date.now() },
    { merge: true }
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cred =
        mode === 'login'
          ? await signInWithEmailAndPassword(auth, email.trim(), password)
          : await createUserWithEmailAndPassword(auth, email.trim(), password);
      await afterAuth(cred.user);
    } catch (err) {
      setError(err.message || 'Authentication failed');
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await afterAuth(cred.user);
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="panel login">
        <div className="brand" style={{ marginBottom: 12 }}>
          <span className="logo">LQ</span> LifeIQ
        </div>
        <h2>LifeIQ Dashboard</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Sign in with the same Firebase account used in the extension.
        </p>
        <form onSubmit={submit}>
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'} (email)
          </button>
        </form>
        <div className="btn-row">
          <button className="secondary" type="button" onClick={google} disabled={busy}>
            Continue with Google
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        </div>
        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
        <p className="hint">
          No Firebase keys? The dashboard runs in <b>demo mode</b> with sample data. To go live,
          fill <code>dashboard/.env</code> (see <code>.env.example</code> and README).
        </p>
      </div>
    </div>
  );
}
