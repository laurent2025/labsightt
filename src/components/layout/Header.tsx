import React, { useState } from 'react';
import { UserPlus, Menu, X, Sun, Moon, LogOut, ShieldCheck, KeyRound, ChevronDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

type HeaderTab = 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'audit' | 'models' | 'users';

interface HeaderProps {
  activeTab: HeaderTab;
  onSelectTab: (tab: HeaderTab) => void;
  onOpenNewPatient: () => void;
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
  operatorName: string;
  operatorEmail?: string | null;
  isAdmin: boolean;
  onLogout: () => void;
  onChangePassword: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenNewPatient,
  onOpenLegal,
  operatorName,
  operatorEmail,
  isAdmin,
  onLogout,
  onChangePassword
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleTabClick = (tab: HeaderTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
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
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
              activeTab === 'dashboard'
                ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dashboard
            {activeTab === 'dashboard' && (
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('patients')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
              activeTab === 'patients'
                ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Patients
            {activeTab === 'patients' && (
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('microscopy')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
              activeTab === 'microscopy'
                ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Microscopy
            {activeTab === 'microscopy' && (
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('reports')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
              activeTab === 'reports'
                ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Reports
            {activeTab === 'reports' && (
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
            )}
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => handleTabClick('models')}
                className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
                  activeTab === 'models'
                    ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Models
                {activeTab === 'models' && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('audit')}
                className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
                  activeTab === 'audit'
                    ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Audit
                {activeTab === 'audit' && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('users')}
                className={`py-1 transition-colors whitespace-nowrap cursor-pointer relative ${
                  activeTab === 'users'
                    ? 'text-cyan-700 dark:text-cyan-400 font-bold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Users
                {activeTab === 'users' && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-cyan-600 dark:bg-cyan-400 rounded-full" />
                )}
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Primary actions & operator badge */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Signed-in identity and account actions. This is the authenticated
              session, not a display name the user can change at will. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen(open => !open)}
              aria-expanded={accountOpen}
              aria-label="Account menu"
              className="flex items-center gap-2 min-h-[44px] pl-2 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <span className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[150px] truncate">
                  {operatorName}
                </span>
                <span
                  className={`text-[10px] font-mono flex items-center gap-1 ${
                    isAdmin
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {isAdmin ? 'Administrator' : 'Member'}
                </span>
              </span>
              <span className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-xs font-bold flex items-center justify-center">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setAccountOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-3 space-y-2">
                  <div className="pb-2.5 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{operatorName}</div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {operatorEmail || 'No email on file'}
                    </div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        isAdmin
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {isAdmin ? 'Admin' : 'Member'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onChangePassword();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-slate-400" />
                    <span>Change password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            )}
          </div>

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
              <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
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
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('patients')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'patients'
                ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Patients
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('microscopy')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'microscopy'
                ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Microscopy
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('reports')}
            className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'reports'
                ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Reports
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => handleTabClick('models')}
                className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'models'
                    ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                AI Models
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('audit')}
                className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'audit'
                    ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                Audit Log
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('users')}
                className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'users'
                    ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                User Administration
              </button>
            </>
          )}

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
              Privacy &amp; HIPAA
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
