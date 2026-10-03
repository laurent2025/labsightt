import React, { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  auditApi,
  type AdminUser,
  type AuditEntry,
  type ChainIntegrity
} from '../../services/api';
import { ArrowRight, ScrollText, ShieldAlert, ShieldCheck, Users } from 'lucide-react';

function formatTime(iso: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
}

/**
 * Administrative summary for the dashboard: account counts, hash-chain
 * integrity, and the newest recorded actions. Fetches through the admin
 * endpoints, which the server denies to non-admins.
 */
export const AdminOversight: React.FC<{ onNavigateTab: (tab: 'audit' | 'users') => void }> = ({
  onNavigateTab
}) => {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [integrity, setIntegrity] = useState<ChainIntegrity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [userResult, auditResult] = await Promise.all([
        adminApi.listUsers(),
        auditApi.list(20)
      ]);
      setUsers(userResult.users);
      setEntries(auditResult.entries);
      setIntegrity(auditResult.integrity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrative data could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adminCount = users?.filter(u => u.role === 'admin').length ?? 0;
  const pendingCount = users?.filter(u => !u.active).length ?? 0;
  const memberCount = (users?.length ?? 0) - adminCount - pendingCount;

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 p-3 rounded-xl text-xs"
      >
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Administrative overview unavailable</p>
          <p className="opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (!users || !entries) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" role="status" aria-busy="true">
        <div className="h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70" />
        <div className="h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70" />
        <div className="h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Accounts
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('users')}
            className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Manage</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-5 flex-1">
          <div>
            <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{adminCount}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Admins</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{Math.max(0, memberCount)}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Members</div>
          </div>
          <div>
            <div className={`text-2xl font-mono font-bold ${pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-600'}`}>
              {pendingCount}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Pending approval</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Audit Chain
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('audit')}
            className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Open trail</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-2.5 flex-1">
          {integrity?.intact ? (
            <ShieldCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-7 h-7 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <div className="space-y-0.5">
            <div className={`text-xs font-semibold ${integrity?.intact ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {integrity?.intact ? 'Integrity verified' : `Broken at entry #${integrity?.brokenAt ?? '?'}`}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {integrity?.total ?? 0} recorded entries
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Latest Activity
          </span>
          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
            newest {Math.min(5, entries.length)}
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 flex-1">No recorded actions yet.</p>
        ) : (
          <ul className="space-y-2 flex-1">
            {entries.slice(0, 5).map(entry => (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-[11px]">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{entry.action}</span>
                  <span className="text-slate-400 dark:text-slate-500"> · {entry.actorName || 'System'}</span>
                </div>
                <span className="font-mono text-slate-400 dark:text-slate-500 shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
