import React, { useState } from 'react';
import { UserPlus, Menu, X, Sun, Moon, LogOut, ShieldCheck, KeyRound } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLabStore, roleRank } from '../../store/labStore';

interface HeaderProps {
  activeTab: 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'models' | 'audit';
  onSelectTab: (tab: 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'models' | 'audit') => void;
  onOpenNewPatient: () => void;
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
  operatorName: string;
  operatorRole: string;
  onLogout: () => void;
  onChangePassword: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenNewPatient,
  onOpenLegal,
  operatorName,
  operatorRole,
  onLogout,
  onChangePassword
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const user = useLabStore(s => s.user);

  const handleTabClick = (tab: 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'models' | 'audit') => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className="text-base font-bold tracking-tight text-slate-900 dark:text-white hover:text-cyan-800 dark:hover:text-cyan-400 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
          >
            <span>LabSight</span>
            <span className="hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold border border-transparent dark:border-cyan-800">
              AI CLINICAL
            </span>
          </button>
        </div>

        {/* Zone 2: Clean text navigation links (Desktop) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-700 dark:border-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('patients')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'patients'
                ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-700 dark:border-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Patients
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('microscopy')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'microscopy'
                ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-700 dark:border-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Microscopy
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('reports')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'reports'
                ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-700 dark:border-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Reports
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('models')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'models'
                ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-700 dark:border-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            AI Models
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('audit')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'audit'
                ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-700 dark:border-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Audit Trail
          </button>
        </nav>

        {/* Zone 3: Primary actions & operator badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Model Status Indicator — directors and supervisors only */}
          {user && roleRank(user) >= 2 && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[11px] font-mono text-emerald-800 dark:text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Roboflow YOLO26m</span>
            </div>
          )}

          {/* Signed-in identity. This is the authenticated session, not a
              display name the user can change at will. */}
          <div className="hidden xl:flex flex-col items-end leading-tight">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[190px] truncate">
              {operatorName}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              {operatorRole}
            </span>
          </div>

          <button
            type="button"
            onClick={onChangePassword}
            title="Change your password"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span className="sr-only">Change your password</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="sr-only">Sign out</span>
          </button>

          {/* Dark / Light Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme (Microscopy Darkroom)'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNewPatient}
            className="px-3.5 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 dark:bg-green-600 dark:hover:bg-green-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition whitespace-nowrap cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Accession Specimen</span>
            <span className="sm:hidden">New</span>
          </button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 space-y-1 shadow-lg">
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('patients')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer ${
              activeTab === 'patients'
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Patients & Accessions
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('microscopy')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer ${
              activeTab === 'microscopy'
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Microscopy Workstation
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('reports')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Diagnostic Reports
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('models')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer ${
              activeTab === 'models'
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            AI Models & Roboflow
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('audit')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Audit Trail
          </button>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenLegal('terms');
              }}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Terms of Use
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenLegal('privacy');
              }}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Privacy & HIPAA
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
