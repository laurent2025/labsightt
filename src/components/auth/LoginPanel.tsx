import React, { useState, useEffect } from 'react';
import { Microscope, LogIn, UserPlus, AlertTriangle, ServerCrash, Eye, EyeOff, ShieldCheck, MailCheck, X, CheckCircle2 } from 'lucide-react';
import { ApiError } from '../../services/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { userFriendlyError } from '../../lib/userFriendlyError';

interface LoginPanelProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<{ message: string }>;
  initialMode?: 'signin' | 'signup';
  onClose?: () => void;
}

export const LoginPanel: React.FC<LoginPanelProps> = ({
  onSubmit,
  onSignup,
  initialMode = 'signin',
  onClose
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; displayName?: string; password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(true, () => {});

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Please enter a valid work email address.';
    if (mode === 'signup' && displayName.trim().length < 2) next.displayName = 'Please enter your full name (at least 2 characters).';
    if (!password) next.password = 'Please enter your password.';
    if (mode === 'signup' && password.length < 12) next.password = 'Password must be at least 12 characters long.';
    if (mode === 'signup' && confirmPassword !== password) next.confirmPassword = 'The passwords you entered do not match. Please re-type them.';
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
      if (err instanceof ApiError) {
        const notApproved = err.status === 403 && (err.payload as { code?: string })?.code === 'NOT_APPROVED';
        if (notApproved) {
          setError('Your account is awaiting administrator approval. Your email is verified — once an administrator approves your account you can sign in. No further action is needed from you.');
        } else if (err.status === 403) {
          setError(userFriendlyError(err, 'Your account is not authorized to access this system. Please contact your administrator for help.'));
        } else if (err.status === 429) {
          setError('Too many sign-in attempts. Please wait a minute and try again.');
        } else {
          setError(userFriendlyError(err, 'We could not complete sign in. Please check your details and try again.'));
        }
        if (err.status === 401 || err.status === 403) setPassword('');
      } else {
        setError(`Could not ${mode === 'signup' ? 'create your account request' : 'sign in'}. Please check your connection and try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const serverUnreachable = error !== null && /Cannot reach the LenziAI server/.test(error);
  const changeMode = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    setError(null);
    setFieldErrors({});
    setSignupMessage(null);
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role={onClose ? 'dialog' : undefined}
      aria-modal={onClose ? 'true' : undefined}
      aria-label={mode === 'signin' ? 'Sign in to LenziAI' : 'Request a LenziAI account'}
      className="auth-card relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-950/15 dark:shadow-black/50 overflow-hidden"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign in"
          className="absolute right-2.5 top-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer touch-target"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="auth-panel-header px-6 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-br from-green-50 via-white to-white dark:from-green-950/50 dark:via-slate-900 dark:to-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-600 to-green-800 border border-green-500/30 flex items-center justify-center shadow-lg shadow-green-900/20">
            <Microscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">LenziAI</h1>
              <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">Clinical</span>
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Laboratory intelligence workspace</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-green-700 dark:text-green-300">Secure laboratory access</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {mode === 'signin'
              ? 'Sign in with your verified email.'
              : 'Enter your details — a verification email unlocks sign-in.'}
          </p>
        </div>
      </div>

      {signupMessage ? (
        <div className="px-5 py-4 space-y-3" style={{
          opacity: isLoaded ? 1 : 0,
          transform: isLoaded ? 'translateY(0)' : 'translateY(12px)',
          animation: isLoaded ? 'fadeInUp 0.4s ease-out forwards' : 'none'
        }}>
          <div className="flex gap-2.5 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30">
            <MailCheck className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div>
              <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Check your inbox</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">{signupMessage}</p>
            </div>
          </div>
          <button type="button" onClick={() => changeMode('signin')} className="w-full py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold touch-target">Return to sign in</button>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="auth-panel-form px-6 py-5 space-y-4" noValidate style={{
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(12px)',
        animation: isLoaded ? 'fadeInUp 0.4s ease-out forwards' : 'none'
      }}>
        <div className="grid grid-cols-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => changeMode('signin')} className={`py-1.5 rounded-lg text-xs font-semibold transition touch-target ${mode === 'signin' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => changeMode('signup')} className={`py-1.5 rounded-lg text-xs font-semibold transition touch-target ${mode === 'signup' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Create account</button>
        </div>

        {error && (
          <div
            role="alert"
            className={`flex items-start gap-2 p-2.5 rounded-lg text-xs font-medium border ${
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
          <label htmlFor="login-display-name" className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">Full name</label>
          <input id="login-display-name" name="name" type="text" autoComplete="name" required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'login-name-error' : undefined} className={`auth-input w-full px-3 py-2.5 text-sm font-medium rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none ${fieldErrors.displayName ? 'is-invalid' : 'border-slate-300 dark:border-slate-700'}`} />
          {fieldErrors.displayName && <p id="login-name-error" className="mt-0.5 text-xs font-medium text-rose-600">{fieldErrors.displayName}</p>}
        </div>}

        <div>
          <label htmlFor="login-email" className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">Work email</label>
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
            className={`auth-input w-full px-3 py-2.5 text-sm font-medium rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none ${
              fieldErrors.email
                ? 'is-invalid'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          />
          {fieldErrors.email && (
            <p id="login-email-error" className="mt-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="login-password"
            className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1"
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
              className={`auth-input w-full pl-3 pr-10 py-2.5 text-sm font-medium rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none ${
                fieldErrors.password
                  ? 'is-invalid'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="auth-toggle absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 touch-target"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p id="login-password-error" className="mt-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {mode === 'signup' && <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Use at least 12 characters. Verify your email before signing in.</p>
            {password.length >= 12 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Meets minimum
              </span>
            ) : (
              <span className="text-[11px] font-semibold font-mono text-slate-500 dark:text-slate-400">
                {Math.max(0, 12 - password.length)} more
              </span>
            )}
          </div>
          <div>
            <label htmlFor="login-confirm-password" className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">Confirm password</label>
          <input id="login-confirm-password" name="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? 'login-confirm-error' : undefined} className={`auth-input w-full px-3 py-2.5 text-sm font-medium rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none ${fieldErrors.confirmPassword ? 'is-invalid' : 'border-slate-300 dark:border-slate-700'}`} />
            {fieldErrors.confirmPassword && <p id="login-confirm-error" className="mt-0.5 text-xs font-medium text-rose-600">{fieldErrors.confirmPassword}</p>}
          </div>
        </>}

        <button
          type="submit"
          disabled={submitting}
          className="auth-submit w-full py-3 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-800 hover:to-green-700 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-700 dark:disabled:to-slate-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-900/15 transition touch-target"
        >
          {submitting ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : mode === 'signin' ? (
            <LogIn className="w-4 h-4" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {submitting ? (mode === 'signin' ? 'Signing in...' : 'Creating account...') : (mode === 'signin' ? 'Sign in' : 'Create account')}
        </button>

        {mode === 'signin' && <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-relaxed">Create an account with any email address, verify it, then sign in. All accounts have the same access.</p>}

        <div className="flex items-start gap-2 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Patient records are stored encrypted on the laboratory server, not in this browser.
            Repeated failed attempts are temporarily blocked.
          </span>
        </div>
      </form>
      )}
    </div>
  );
};
