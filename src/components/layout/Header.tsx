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
      className={`no-print sticky top-0 z-40 safe-top transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl shadow-lg shadow-slate-900/5 dark:shadow-black/40 border-b border-slate-200 dark:border-slate-800'
          : 'bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-800/60'
      }`}
    >
      <div className="max-w-[1440px] mx-auto gutter-x h-14 md:h-16 xl:h-[72px] flex items-center justify-between gap-2 sm:gap-3">
        {/* Zone 1: Logo / wordmark */}
        <div className="flex items-center gap-2.5 lg:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className="flex items-center gap-2.5 group whitespace-nowrap cursor-pointer bg-transparent border-none p-0"
            aria-label="LenziAI Dashboard"
          >
            <div className="relative w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center shadow-md shadow-green-600/25 group-hover:shadow-lg group-hover:shadow-green-600/35 group-hover:scale-105 transition-all duration-300">
              <Microscope className="w-4 h-4 md:w-5 md:h-5 text-white" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-300 border-2 border-white dark:border-slate-950" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm md:text-base lg:text-lg font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-300 bg-clip-text text-transparent leading-tight">
                LenziAI
              </span>
              <span className="hidden sm:inline-block text-[9px] font-mono font-semibold text-green-700 dark:text-green-300 tracking-wider uppercase leading-tight">
                AI Clinical
              </span>
            </div>
          </button>
        </div>

        {/*
         * Zone 2: Desktop navigation.

         * Shown from lg up, but allowed to scroll horizontally inside its own
         * box: an administrator sees seven tabs, and at exactly 1024px those
         * plus the action cluster no longer fit beside the wordmark. Scrolling
         * degrades gracefully where shrinking or clipping would not.
         */}
        <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 text-sm font-bold min-w-0 flex-1 justify-center no-scrollbar overflow-x-auto py-1">
          {visibleTabs.map(tab => (
            <button
              key={tab.tab}
              type="button"
              onClick={() => handleTabClick(tab.tab)}
              aria-current={activeTab === tab.tab ? 'page' : undefined}
              className={`relative px-2.5 xl:px-3 py-2 min-h-[40px] rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === tab.tab
                  ? 'text-green-800 dark:text-green-200 bg-green-50 dark:bg-green-950/50 ring-1 ring-inset ring-green-200 dark:ring-green-900'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              {tab.label}
              {activeTab === tab.tab && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-green-600 to-green-800 dark:from-green-400 dark:to-green-600 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Account dropdown */}
          <div className="hidden sm:block relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen(open => !open)}
              aria-expanded={accountOpen}
              aria-label="Account menu"
              className="flex items-center gap-2 min-h-[44px] pl-2 pr-2.5 xl:pl-2.5 xl:pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-green-400 dark:hover:border-green-700 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex flex-col items-end leading-tight hidden xl:flex">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[140px] 2xl:max-w-[180px] truncate group-hover:text-green-900 dark:group-hover:text-green-100 transition-colors">
                  {operatorName}
                </span>
                <span className="text-[10px] font-mono flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <ShieldCheck className="w-3 h-3 text-green-700 dark:text-green-400" />
                  {isAdmin ? 'Administrator' : 'Member'}
                </span>
              </div>
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-950 border border-green-300 dark:border-green-800 text-green-900 dark:text-green-200 text-xs font-bold flex items-center justify-center group-hover:from-green-200 group-hover:to-green-300 dark:group-hover:from-green-800 dark:group-hover:to-green-900 transition-all">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </span>
              <ChevronDown className={`hidden xl:block w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${accountOpen ? 'rotate-180' : ''}`} />
            </button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setAccountOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-2 z-50 w-[min(18rem,calc(100vw-2rem))] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/50 p-4 space-y-3 animate-scale-in">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-950 border border-green-300 dark:border-green-800 text-green-900 dark:text-green-200 text-sm font-bold flex items-center justify-center">
                        {(operatorName || '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{operatorName}</div>
                        <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                          {operatorEmail || 'No email on file'}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase ${
                        isAdmin
                          ? 'bg-green-100 dark:bg-green-950 text-green-900 dark:text-green-200 border border-green-300 dark:border-green-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
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
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 shrink-0 rounded-lg bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 flex items-center justify-center">
                      <KeyRound className="w-3.5 h-3.5 text-green-700 dark:text-green-400" />
                    </div>
                    Change password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 shrink-0 rounded-lg bg-green-100 dark:bg-green-950/60 border border-green-300 dark:border-green-800 flex items-center justify-center">
                      <LogOut className="w-3.5 h-3.5 text-green-800 dark:text-green-300" />
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
            className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-green-800 dark:hover:text-green-300 hover:border-green-400 dark:hover:border-green-700 hover:bg-green-50/60 dark:hover:bg-green-950/40 transition-all duration-200 cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme (Microscopy Darkroom)'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-green-400" />
            ) : (
              <Moon className="w-4 h-4 text-green-700" />
            )}
          </button>

          {/* Accession button (md and up - labelled) */}
          <button
            type="button"
            onClick={onOpenNewPatient}
            className="hidden md:flex min-h-[44px] px-3.5 xl:px-4 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 dark:from-green-600 dark:to-green-800 dark:hover:from-green-500 dark:hover:to-green-700 text-white rounded-xl text-sm font-bold items-center gap-2 shadow-md shadow-slate-900/15 dark:shadow-green-950/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden lg:inline">Accession Specimen</span>
            <span className="lg:hidden">Accession</span>
          </button>

          {/* Accession button (below md - icon only) */}
          <button
            type="button"
            onClick={onOpenNewPatient}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 dark:from-green-600 dark:to-green-800 text-white shadow-md shadow-slate-900/15 dark:shadow-green-950/40 transition-transform active:scale-95"
            aria-label="Accession new specimen"
          >
            <UserPlus className="w-4 h-4" />
          </button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/*
       * Mobile Dropdown Navigation.

       * Capped at the available viewport height and scrollable: on a landscape
       * phone, or a small handset with the on-screen keyboard open, an
       * uncapped panel ran past the bottom of the screen and put the sign-out
       * button out of reach.
       */}
      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl gutter-x py-3 space-y-1 shadow-xl animate-slide-in max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain"
        >
          {/* Mobile account info */}
          <div className="pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-950 border border-green-300 dark:border-green-800 text-green-900 dark:text-green-200 text-sm font-bold flex items-center justify-center">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{operatorName}</div>
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                  {operatorEmail || 'No email'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-green-700" />
                )}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); onOpenLegal('privacy'); }}
                className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                aria-current={activeTab === tab.tab ? 'page' : undefined}
                className={`w-full text-left px-3.5 py-3 min-h-[48px] rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 flex items-center gap-3 ${
                  activeTab === tab.tab
                    ? 'bg-green-50 dark:bg-green-950/60 text-green-900 dark:text-green-200 font-semibold border border-green-300 dark:border-green-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
                }`}
              >
                {activeTab === tab.tab && (
                  <span className="w-1 h-5 shrink-0 rounded-full bg-gradient-to-b from-green-600 to-green-800 dark:from-green-400 dark:to-green-600" />
                )}
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onChangePassword(); }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Password
            </button>
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onLogout(); }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/40 text-sm font-semibold text-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-950/70 transition-colors cursor-pointer"
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
