import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminUser } from '../../services/api';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';
import {
  Loader2,
  Lock,
  SearchX,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Users
} from 'lucide-react';

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

/**
 * Administrative user management: view accounts, edit a role, remove an
 * account, and track each user's recorded activity. All actions are
 * server-authorized (403 for non-admins) and written to the audit chain.
 */
export const UsersAdminView: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { users: next } = await adminApi.listUsers();
      setUsers(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The user list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetRole = async (user: AdminUser) => {
    const nextRole = user.role === 'admin' ? 'member' : 'admin';
    setActingId(user.id);
    setActionError(null);
    try {
      await adminApi.setRole(user.id, nextRole);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The role change failed.');
    } finally {
      setActingId(null);
    }
  };

  const handleApprove = async (user: AdminUser) => {
    const label = user.displayName || user.username;
    if (!confirm(`Approve ${label}? They can sign in and use the laboratory immediately.`)) return;
    setActingId(user.id);
    setActionError(null);
    try {
      await adminApi.approveUser(user.id);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The account could not be approved.');
    } finally {
      setActingId(null);
    }
  };

  const handleRemove = async (user: AdminUser) => {
    const label = user.displayName || user.username;
    if (!confirm(`Revoke ${label}'s approval? They lose access immediately, but their clinical records and audit history are retained. You can approve them again later.`)) return;
    setActingId(user.id);
    setActionError(null);
    try {
      await adminApi.removeUser(user.id);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The approval could not be revoked.');
    } finally {
      setActingId(null);
    }
  };

  const term = search.trim().toLowerCase();
  const filtered = term
    ? users.filter(
        u =>
          u.displayName.toLowerCase().includes(term) ||
          u.username.toLowerCase().includes(term) ||
          (u.email ?? '').toLowerCase().includes(term)
      )
    : users;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
            <Users className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">User Access Administration</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Approve or revoke account access, assign administrator roles, and review recorded activity
            </p>
          </div>
        </div>
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search name, username, or email…"
            className="w-full sm:w-72 pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
          <SearchX className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {actionError && (
        <div role="alert" className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 p-3 rounded-xl text-xs">
          <span className="font-bold">Action failed:</span>
          <span className="flex-1">{actionError}</span>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchX className="w-5 h-5" />}
            title={users.length === 0 ? 'No accounts yet' : 'No matching accounts'}
            description={
              users.length === 0
                ? 'Accounts appear here as soon as a user signs up.'
                : 'No account matches the current search.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-4 font-semibold">User</th>
                  <th className="py-2.5 px-4 font-semibold">Role</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Created</th>
                  <th className="py-2.5 px-4 font-semibold">Last Sign-in</th>
                  <th className="py-2.5 px-4 font-semibold">Recorded Activity</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map(user => {
                  const isSelf = user.id === currentUserId;
                  const busy = actingId === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {user.displayName || user.username}
                          </span>
                          {isSelf && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                              you
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {user.email ?? user.username}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            user.role === 'admin'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            user.active
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {user.active ? 'Approved' : 'Pending approval'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(user.lastLoginAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-800 dark:text-slate-200">{user.auditCount} entries</div>
                        <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {user.lastAction ? `${user.lastAction} · ${formatDate(user.lastActionAt)}` : 'No recorded actions'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {!user.active && (
                            <button
                              type="button"
                              onClick={() => void handleApprove(user)}
                              disabled={busy}
                              title="Approve this account for access"
                              className="px-3 py-1.5 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                              <span>Approve</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleSetRole(user)}
                            disabled={busy}
                            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : user.role === 'admin' ? (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            ) : (
                              <UserCog className="w-3.5 h-3.5" />
                            )}
                            <span>{user.role === 'admin' ? 'Make member' : 'Make admin'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemove(user)}
                            disabled={busy || isSelf || !user.active}
                            title={isSelf ? 'You cannot revoke your own approval' : "Revoke this account's approval"}
                            className="px-3 py-1.5 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                            <span>Revoke</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
        <p>
          New accounts are created with <strong>pending approval</strong> after email confirmation: they cannot sign
          in until an administrator approves them. Revoking approval stops sign-in immediately but never erases
          clinical records: samples, reports, and audit entries keep their references so the laboratory history
          remains attributable. All approval, role, and revocation actions are written to the audit trail.
        </p>
      </div>
    </div>
  );
};
