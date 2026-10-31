import React from 'react';
import { Menu, Microscope, UserPlus, Bell } from 'lucide-react';
import { HeaderTab } from './Sidebar';

interface TopBarProps {
  activeTab: HeaderTab;
  onOpenMobileSidebar: () => void;
  onOpenNewPatient: () => void;
  pendingReviewCount?: number;
}

const TAB_TITLES: Record<HeaderTab, string> = {
  dashboard: 'Clinical Dashboard',
  patients: 'Patient Directory',
  microscopy: 'Microscopy Workstation',
  reports: 'Diagnostic Reports',
  audit: 'System Audit Log',
  users: 'User & Access Governance',
  scans: 'Saved Image Registry'
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onOpenMobileSidebar,
  onOpenNewPatient,
  pendingReviewCount = 0
}) => {
  return (
    <header className="app-header relative no-print h-14 lg:h-12 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3 shrink-0 select-none z-20">
      {/* Left: Mobile hamburger or Desktop breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          aria-label="Open sidebar navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Mobile brand mark */}
        <div className="lg:hidden flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white shadow-2xs">
            <Microscope className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">LenziAI</span>
        </div>

        {/* Desktop breadcrumbs */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-400 dark:text-slate-500">LenziAI</span>
          <span>/</span>
          <span className="font-bold text-slate-800 dark:text-slate-200">{TAB_TITLES[activeTab] || 'Workspace'}</span>
          {activeTab === 'microscopy' && pendingReviewCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
              {pendingReviewCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Right: Quick Specimen Accession on Mobile */}
      <div className="flex items-center gap-2">
        {pendingReviewCount > 0 && (
          <div
            className="lg:hidden flex h-9 items-center gap-1.5 rounded-lg border border-amber-300/70 bg-amber-50 px-2 text-[11px] font-bold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
            aria-label={`${pendingReviewCount} microscopy review${pendingReviewCount === 1 ? '' : 's'} pending`}
            title={`${pendingReviewCount} microscopy review${pendingReviewCount === 1 ? '' : 's'} pending`}
          >
            <Bell className="h-3.5 w-3.5 shrink-0" />
            <span>{pendingReviewCount}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onOpenNewPatient}
          className="lg:hidden flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs"
          title="Accession New Specimen"
        >
          <UserPlus className="w-3 h-3" />
          <span>Accession</span>
        </button>
      </div>
    </header>
  );
};
