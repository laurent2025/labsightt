import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Microscope,
  FileCheck2,
  ShieldCheck,
  Settings2,
  Image as ImageIcon,
  UserPlus,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ChevronDown,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export type HeaderTab = 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'audit' | 'users' | 'scans';

export interface SidebarProps {
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
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenNewPatient,
  onOpenLegal,
  operatorName,
  operatorEmail,
  isAdmin,
  onLogout,
  onChangePassword,
  pendingReviewCount = 0,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile
}) => {
  const { theme, toggleTheme } = useTheme();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const navItems: { tab: HeaderTab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { tab: 'patients', label: 'Patients', icon: Users },
    { tab: 'microscopy', label: 'Microscopy', icon: Microscope },
    { tab: 'reports', label: 'Reports', icon: FileCheck2 },
    { tab: 'audit', label: 'Audit Log', icon: ShieldCheck, adminOnly: true },
    { tab: 'users', label: 'Users', icon: Settings2, adminOnly: true },
    { tab: 'scans', label: 'Saved Images', icon: ImageIcon, adminOnly: true }
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const handleItemClick = (tab: HeaderTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const renderNavContent = (isMobile = false) => {
    const isCollapsed = !isMobile && collapsed;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Top Header / Branding */}
        <div className={`flex items-center justify-between border-b border-slate-200 dark:border-slate-800 ${isCollapsed ? 'p-3 justify-center' : 'px-4 py-3.5'}`}>
          <button
            type="button"
            onClick={() => handleItemClick('dashboard')}
            className={`flex items-center gap-2.5 text-left transition ${isCollapsed ? 'justify-center' : ''}`}
            title="LenziAI Dashboard"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/40 bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-xs">
              <Microscope className="h-4.5 w-4.5" strokeWidth={2.2} />
            </span>
            {!isCollapsed && (
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">LenziAI</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="System Online" />
                </div>
              </div>
            )}
          </button>

          {isMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            !isCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Quick Action: Accession Specimen */}
        <div className={`p-2.5 ${isCollapsed ? 'flex justify-center' : ''}`}>
          <button
            type="button"
            onClick={() => {
              onOpenNewPatient();
              onCloseMobile();
            }}
            className={`flex items-center gap-2 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer ${
              isCollapsed
                ? 'h-9 w-9 justify-center'
                : 'w-full px-3 py-2 text-xs justify-center'
            }`}
            title="Accession New Specimen"
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Accession Specimen</span>}
          </button>
        </div>

        {/* Navigation List — Fully Scrollable */}
        <nav
          className="flex-1 overflow-y-auto overscroll-contain px-2 py-1 space-y-1 scrollbar-thin"
          role="navigation"
          aria-label="Sidebar navigation"
        >
          {visibleNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;

            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => handleItemClick(item.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center rounded-xl transition-all duration-150 cursor-pointer ${
                  isCollapsed
                    ? 'h-10 justify-center'
                    : 'px-3 py-2.5 gap-3 text-xs font-semibold'
                } ${
                  isActive
                    ? 'text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300/80 dark:border-emerald-800/80 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <div className="relative flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  {isCollapsed && item.tab === 'microscopy' && pendingReviewCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-1 rounded-full text-[9px] font-mono font-bold bg-amber-500 text-slate-950 flex items-center justify-center shadow-xs animate-pulse">
                      {pendingReviewCount}
                    </span>
                  )}
                </div>

                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.tab === 'microscopy' && pendingReviewCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shadow-2xs">
                        {pendingReviewCount}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Area of Sidebar */}
        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          {/* Active Model & Engine Status */}
          {!isCollapsed ? (
            <div className="flex justify-end px-2.5 py-1.5" title="System status" aria-label="System status: online">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          ) : (
            <div className="flex justify-center" title="System status">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          )}

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`w-full flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer ${
              isCollapsed ? 'h-9 justify-center' : 'px-2.5 py-2 text-xs font-semibold gap-2'
            }`}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            )}
            {!isCollapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          {/* Account Profile Card */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className={`w-full flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer ${
                isCollapsed ? 'h-10 justify-center' : 'p-2 gap-2 text-left'
              }`}
              title={isCollapsed ? `${operatorName} (${isAdmin ? 'Admin' : 'Tech'})` : undefined}
            >
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {(operatorName || '?').trim().charAt(0).toUpperCase()}
              </span>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{operatorName}</div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {isAdmin ? 'Administrator' : 'Clinical Technologist'}
                    </div>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            {accountMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setAccountMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className={`absolute z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2.5 space-y-1 ${
                    isCollapsed
                      ? 'left-full bottom-0 ml-2 w-56'
                      : 'bottom-full left-0 right-0 mb-1.5'
                  }`}
                >
                  <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{operatorName}</div>
                    <div className="font-mono text-[10px] truncate">{operatorEmail || 'No email registered'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onChangePassword();
                      onCloseMobile();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    <span>Change password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onOpenLegal('privacy');
                      onCloseMobile();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>HIPAA &amp; Privacy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onLogout();
                      onCloseMobile();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Desktop Maximize / Expand button when collapsed */}
          {!isMobile && isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-full flex items-center justify-center h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-screen sticky top-0 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md transition-all duration-200 z-30 select-none ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Sliding Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-slate-950 flex flex-col border-r border-slate-200 dark:border-slate-800 shadow-2xl z-10 animate-slide-in">
            {renderNavContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
