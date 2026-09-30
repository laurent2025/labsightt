import React, { useState } from 'react';
import { Microscope, LogIn, UserPlus, AlertTriangle, ServerCrash, Eye, EyeOff, ShieldCheck, MailCheck } from 'lucide-react';
import { ApiError } from '../../services/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface LoginScreenProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<{ message: string }>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSubmit, onSignup }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; displayName?: string; password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(true, () => {});

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (mode === 'signup' && displayName.trim().length < 2) next.displayName = 'Enter your full name.';
    if (!password) next.password = 'Enter your password.';
    if (mode === 'signup' && password.length < 12) next.password = 'Use at least 12 characters.';
    if (mode === 'signup' && confirmPassword !== password) next.confirmPassword = 'Passwords do not match.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const result = await onSignup(email.trim().toLowerCase(), password, displayName.trim());
        setSignupMessage(result.message);
        setPassword('');
        setConfirmPassword('');
      } else {
        await onSubmit(email.trim().toLowerCase(), password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${mode === 'signup' ? 'create your request' : 'sign in'}. Please try again.`);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const serverUnreachable = error !== null && /Cannot reach the LabSight server/.test(error);
  const changeMode = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    setError(null);
    setFieldErrors({});
    setSignupMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'signin' ? 'Sign in to LabSight' : 'Request a LabSight account'}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
      >
        <div className="px-6 pt-7 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">LabSight</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Laboratory microscopy workspace
              </p>
            </div>
          </div>
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {mode === 'signin' ? 'Welcome back' : 'Request access'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {mode === 'signin' ? 'Sign in with your verified email.' : 'Create an account using your email address.'}
            </p>
          </div>
        </div>

        {signupMessage ? (
          <div className="px-6 py-7 space-y-4">
            <div className="flex gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30">
              <MailCheck className="w-5 h-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Check your inbox</h3>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">{signupMessage}</p>
              </div>
            </div>
            <button type="button" onClick={() => changeMode('signin')} className="w-full py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-semibold">Return to sign in</button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" noValidate>
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => changeMode('signin')} className={`py-2 rounded-lg text-sm font-semibold transition ${mode === 'signin' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => changeMode('signup')} className={`py-2 rounded-lg text-sm font-semibold transition ${mode === 'signup' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Create account</button>
          </div>

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

          {mode === 'signup' && <div>
            <label htmlFor="login-display-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Full name</label>
            <input id="login-display-name" name="name" type="text" autoComplete="name" required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'login-name-error' : undefined} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            {fieldErrors.displayName && <p id="login-name-error" className="mt-1 text-[11px] text-rose-600">{fieldErrors.displayName}</p>}
          </div>}

          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Work email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors(f => ({ ...f, email: undefined }));
              }}
              className={`w-full px-3 py-2.5 text-sm rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                fieldErrors.email
                  ? 'border-rose-400 focus:border-rose-500'
                  : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
              }`}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                {fieldErrors.email}
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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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

          {mode === 'signup' && <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Use at least 12 characters. Verify your email before signing in.</p>
            <div>
              <label htmlFor="login-confirm-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Confirm password</label>
              <input id="login-confirm-password" name="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? 'login-confirm-error' : undefined} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
              {fieldErrors.confirmPassword && <p id="login-confirm-error" className="mt-1 text-[11px] text-rose-600">{fieldErrors.confirmPassword}</p>}
            </div>
          </>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 disabled:hover:bg-slate-300 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition"
          >
            {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? (mode === 'signin' ? 'Signing in...' : 'Submitting...') : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>

          {mode === 'signin' && <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">Create an account with any email address, verify it, then sign in. All accounts have the same access.</p>}

          <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Patient records are stored encrypted on the laboratory server, not in this browser.
              Repeated failed attempts are temporarily blocked.
            </span>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
