import React, { useState, useRef, useEffect } from 'react';
import {
  UserPlus,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ShieldCheck,
  KeyRound,
  ChevronDown,
  Microscope
} from 'lucide-react';
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
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const accountRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabClick = (tab: HeaderTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
    setAccountOpen(false);
  };

  const tabs: { tab: HeaderTab; label: string; adminOnly?: boolean }[] = [
    { tab: 'dashboard', label: 'Dashboard' },
    { tab: 'patients', label: 'Patients' },
    { tab: 'microscopy', label: 'Microscopy' },
    { tab: 'reports', label: 'Reports' },
    { tab: 'models', label: 'AI Models', adminOnly: true },
    { tab: 'audit', label: 'Audit Log', adminOnly: true },
    { tab: 'users', label: 'Users', adminOnly: true }
  ];

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <header
      className={`no-print sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl shadow-lg shadow-slate-900/5 dark:shadow-cyan-900/5 border-b border-slate-200/80 dark:border-slate-800/80'
          : 'bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-800/60'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 h-16 lg:h-[72px] flex items-center justify-between gap-3">
        {/* Zone 1: Logo / wordmark */}
        <div className="flex items-center gap-2.5 lg:gap-3">
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className="flex items-center gap-2.5 group whitespace-nowrap cursor-pointer bg-transparent border-none p-0"
            aria-label="LenziAI Dashboard"
          >
            <div className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-emerald-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-xl group-hover:shadow-cyan-500/30 group-hover:scale-105 transition-all duration-300">
              <Microscope className="w-5 h-5 lg:w-5.5 lg:h-5.5 text-white" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-950 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-base lg:text-lg font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-300 bg-clip-text text-transparent leading-tight">
                LenziAI
              </span>
              <span className="hidden sm:inline-block text-[9px] font-mono font-semibold text-cyan-700 dark:text-cyan-400 tracking-wider uppercase leading-tight">
                AI Clinical
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Desktop navigation */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs font-semibold">
          {visibleTabs.map(tab => (
            <button
              key={tab.tab}
              type="button"
              onClick={() => handleTabClick(tab.tab)}
              className={`relative px-3 py-2 min-h-[40px] rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${
                activeTab === tab.tab
                  ? 'text-cyan-700 dark:text-cyan-400 bg-cyan-50/80 dark:bg-cyan-950/40'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
              {activeTab === tab.tab && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-cyan-600 to-emerald-600 dark:from-cyan-400 dark:to-emerald-400 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Account dropdown */}
          <div className="hidden sm:block relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen(open => !open)}
              aria-expanded={accountOpen}
              aria-label="Account menu"
              className="flex items-center gap-2.5 min-h-[44px] pl-2.5 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-cyan-300 dark:hover:border-cyan-700 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex flex-col items-end leading-tight hidden md:flex">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[120px] xl:max-w-[160px] truncate group-hover:text-cyan-900 dark:group-hover:text-cyan-100 transition-colors">
                  {operatorName}
                </span>
                <span className="text-[10px] font-mono flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3 h-3" />
                  {isAdmin ? 'Administrator' : 'Member'}
                </span>
              </div>
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-100 to-emerald-100 dark:from-cyan-950 dark:to-emerald-950 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-xs font-bold flex items-center justify-center group-hover:from-cyan-200 group-hover:to-emerald-200 dark:group-hover:from-cyan-900 dark:group-hover:to-emerald-900 transition-all">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${accountOpen ? 'rotate-180' : ''}`} />
            </button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setAccountOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-cyan-900/10 p-4 space-y-3 animate-scale-in">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-100 to-emerald-100 dark:from-cyan-950 dark:to-emerald-950 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-sm font-bold flex items-center justify-center">
                        {(operatorName || '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{operatorName}</div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {operatorEmail || 'No email on file'}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase ${
                        isAdmin
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isAdmin ? 'Administrator' : 'Member'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onChangePassword();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
                      <KeyRound className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
                    </div>
                    Change password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center">
                      <LogOut className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                    </div>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-400 hover:border-cyan-300 dark:hover:border-cyan-700 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30 transition-all duration-200 cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme (Microscopy Darkroom)'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Accession button (desktop) */}
          <button
            type="button"
            onClick={onOpenNewPatient}
            className="hidden md:flex min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 dark:from-cyan-600 dark:to-emerald-600 dark:hover:from-cyan-500 dark:hover:to-emerald-500 text-white rounded-xl text-xs font-semibold items-center gap-2 shadow-md shadow-slate-900/15 dark:shadow-cyan-900/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Accession Specimen</span>
          </button>

          {/* Accession button (mobile - icon only) */}
          <button
            type="button"
            onClick={onOpenNewPatient}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 dark:from-cyan-600 dark:to-emerald-600 text-white shadow-md"
            aria-label="Accession new specimen"
          >
            <UserPlus className="w-4 h-4" />
          </button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div ref={mobileMenuRef} className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl px-4 py-3 space-y-1 shadow-xl animate-slide-in">
          {/* Mobile account info */}
          <div className="pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-100 to-emerald-100 dark:from-cyan-950 dark:to-emerald-950 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-sm font-bold flex items-center justify-center">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{operatorName}</div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {operatorEmail || 'No email'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); onOpenLegal('privacy'); }}
                className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Privacy
              </button>
            </div>
          </div>

          <nav className="space-y-0.5">
            {visibleTabs.map(tab => (
              <button
                key={tab.tab}
                type="button"
                onClick={() => handleTabClick(tab.tab)}
                className={`w-full text-left px-3.5 py-3 min-h-[48px] rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 flex items-center gap-3 ${
                  activeTab === tab.tab
                    ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 font-semibold border border-cyan-200 dark:border-cyan-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
                }`}
              >
                {activeTab === tab.tab && (
                  <span className="w-1 h-5 rounded-full bg-gradient-to-b from-cyan-600 to-emerald-600 dark:from-cyan-400 dark:to-emerald-400" />
                )}
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onChangePassword(); }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Password
            </button>
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onLogout(); }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
