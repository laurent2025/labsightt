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

type HeaderTab = 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'audit' | 'users' | 'scans';

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
  pendingReviewCount?: number;
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
  onChangePassword,
  pendingReviewCount = 0
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
    { tab: 'audit', label: 'Audit Log', adminOnly: true },
    { tab: 'users', label: 'Users', adminOnly: true },
    { tab: 'scans', label: 'Saved Images', adminOnly: true }
  ];

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <header
      className={`app-header no-print sticky top-0 z-40 safe-top transition-all duration-200 ${
        scrolled
          ? 'bg-white/95 dark:bg-slate-950/95 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800'
          : 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200/70 dark:border-slate-800/70'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 h-13 sm:h-14 flex items-center justify-between gap-2">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className="flex items-center gap-2 group whitespace-nowrap cursor-pointer bg-transparent border-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
            aria-label="LenziAI Dashboard"
          >
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/40 bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-xs">
              <Microscope className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  LenziAI
                </span>
                <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="System Online" />
              </div>
              <span className="hidden sm:inline-block text-[9px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mt-0.5">
                Clinical
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Compact Desktop navigation */}
        <nav
          className="hidden lg:flex items-center gap-0.5 sm:gap-1 text-xs font-semibold shrink-0"
          role="navigation"
          aria-label="Main navigation"
        >
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.tab;
            return (
              <button
                key={tab.tab}
                type="button"
                onClick={() => handleTabClick(tab.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative px-2.5 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                  isActive
                    ? 'text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 ring-1 ring-emerald-300 dark:ring-emerald-800'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{tab.label}</span>
                {tab.tab === 'microscopy' && pendingReviewCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-amber-500 text-slate-950 shadow-2xs">
                    {pendingReviewCount}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-emerald-600 dark:bg-emerald-400 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Compact Actions Cluster */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quick Accession button */}
          <button
            type="button"
            onClick={onOpenNewPatient}
            className="flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-2xs hover:shadow-xs transition cursor-pointer whitespace-nowrap"
            title="Accession New Specimen"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Accession</span>
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" />
            )}
          </button>

          {/* Compact Account dropdown */}
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen(open => !open)}
              aria-expanded={accountOpen}
              aria-label="Account menu"
              className="flex items-center gap-1.5 h-8 pl-1.5 pr-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer group"
            >
              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-[10px] font-bold flex items-center justify-center">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="hidden xl:flex flex-col items-start leading-none text-left">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[85px] truncate">
                  {operatorName}
                </span>
                <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
                  {isAdmin ? 'Admin' : 'Tech'}
                </span>
              </div>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${accountOpen ? 'rotate-180' : ''}`} />
            </button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setAccountOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 space-y-2.5 animate-scale-in">
                  <div className="pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-xs font-bold flex items-center justify-center">
                        {(operatorName || '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{operatorName}</div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {operatorEmail || 'Clinical Operator'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        {isAdmin ? 'Administrator' : 'Laboratory Staff'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onChangePassword();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Change password</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl px-4 py-3 space-y-2 shadow-xl animate-slide-in max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain"
        >
          {/* Mobile account info */}
          <div className="pb-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-xs font-bold flex items-center justify-center">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">{operatorName}</div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  {isAdmin ? 'Administrator' : 'Laboratory Staff'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onOpenLegal('privacy'); }}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline"
            >
              Privacy &amp; Terms
            </button>
          </div>

          <nav className="space-y-1">
            {visibleTabs.map(tab => (
              <button
                key={tab.tab}
                type="button"
                onClick={() => handleTabClick(tab.tab)}
                aria-current={activeTab === tab.tab ? 'page' : undefined}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center justify-between ${
                  activeTab === tab.tab
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.tab === 'microscopy' && pendingReviewCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                    {pendingReviewCount} pending
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onChangePassword(); }}
              className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Password</span>
            </button>
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onLogout(); }}
              className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
