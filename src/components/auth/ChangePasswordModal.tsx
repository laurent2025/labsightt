import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useLabStore } from '../../store/labStore';
import { ApiError } from '../../services/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ChangePasswordModalProps {
  onClose: () => void;
}

/**
 * The server has enforced a password policy since the first release, but there
 * was no way to reach it from the UI — the only way to change a password was
 * an API call. The first-run bootstrap account especially needs this.
 */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const { changePassword } = useLabStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const requirements = [
    { label: 'At least 12 characters', met: next.length >= 12 },
    { label: 'No leading or trailing spaces', met: next.length > 0 && !/^\s|\s$/.test(next) }
  ];
  const matches = next.length > 0 && next === confirm;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!requirements.every(r => r.met)) {
      setError('The new password does not meet the requirements. Please check the policy below and adjust your password.');
      return;
    }
    if (!matches) {
      setError('The two passwords you entered do not match. Please re-type them to confirm.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password. Please check your current password and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
          </div>
          <h2 id="change-password-title" className="text-base font-bold text-slate-900 dark:text-white">
            Change your password
          </h2>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white mt-3">
              Password changed
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Your other sessions remain signed in. Contact a Lab Director if you need them revoked.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-sm font-bold"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3.5" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-lg text-sm font-medium bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="pw-current" className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">
                Current password
              </label>
              <input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={e => setCurrent(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>

            <div>
              <label htmlFor="pw-new" className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="pw-new"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  aria-describedby="pw-requirements"
                  className="w-full pl-3 pr-10 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <ul id="pw-requirements" className="space-y-1">
              {requirements.map(req => (
                <li
                  key={req.label}
                  className={`flex items-center gap-1.5 text-[11px] ${
                    req.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {req.met ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current" />}
                  {req.label}
                </li>
              ))}
              <li
                className={`flex items-center gap-1.5 text-[11px] ${
                  matches ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {matches ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current" />}
                Both entries match
              </li>
            </ul>

            <div>
              <label htmlFor="pw-confirm" className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">
                Confirm new password
              </label>
              <input
                id="pw-confirm"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting || !current || !requirements.every(r => r.met) || !matches}
                className="flex-1 px-4 py-2 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 disabled:hover:bg-slate-300 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:disabled:bg-slate-700 text-white rounded-lg text-sm font-bold transition"
              >
                {submitting ? 'Changing...' : 'Change password'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-bold transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
