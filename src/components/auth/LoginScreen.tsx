import React, { useState } from 'react';
import { Microscope, LogIn, AlertTriangle, ServerCrash, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { ApiError } from '../../services/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface LoginScreenProps {
  /**
   * Performs the sign-in. The store owns the session, so this screen does not
   * call the API itself: doing both would set the cookie here while leaving the
   * store unauthenticated, and the app would re-render this screen.
   *
   * Must reject on failure so the error can be surfaced.
   */
  onSubmit: (username: string, password: string) => Promise<void>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSubmit }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(true, () => {});

  const validate = () => {
    const next: { username?: string; password?: string } = {};
    if (!username.trim()) next.username = 'Enter your username.';
    if (!password) next.password = 'Enter your password.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    // Client-side validation only saves a round trip; the server is
    // authoritative and still rejects anything invalid.
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(username.trim(), password);
      // On success this component unmounts, because the store now has a user.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
      setPassword('');
      // Return focus to the field the operator needs to fix.
      if (err instanceof ApiError && err.status === 401) {
        document.getElementById('login-password')?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const serverUnreachable = error !== null && /Cannot reach the LabSight server/.test(error);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to LabSight"
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">LabSight</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Clinical microscopy review system
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
                serverUnreachable
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              }`}
            >
              {serverUnreachable ? (
                <ServerCrash className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Username
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? 'login-username-error' : undefined}
              value={username}
              onChange={e => {
                setUsername(e.target.value);
                if (fieldErrors.username) setFieldErrors(f => ({ ...f, username: undefined }));
              }}
              className={`w-full px-3 py-2.5 text-sm rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                fieldErrors.username
                  ? 'border-rose-400 focus:border-rose-500'
                  : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
              }`}
            />
            {fieldErrors.username && (
              <p id="login-username-error" className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors(f => ({ ...f, password: undefined }));
                }}
                className={`w-full pl-3 pr-10 py-2.5 text-sm rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  fieldErrors.password
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="login-password-error" className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 disabled:hover:bg-slate-300 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Accounts are created by a Lab Director. Access is granted per person, and every action
            is recorded in an append-only audit trail.
          </p>

          <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Patient records are stored encrypted on the laboratory server, not in this browser.
              Repeated failed attempts are temporarily blocked.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
