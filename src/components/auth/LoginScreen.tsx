import React from 'react';
import { LoginPanel } from './LoginPanel';

interface LoginScreenProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<{ message: string }>;
}

export const LoginScreen: React.FC<LoginScreenProps> = props => (
  <div className="relative min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 overflow-hidden">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-green-100/70 via-transparent to-white dark:from-green-950/40 dark:via-transparent dark:to-transparent"
    />
    <div className="relative w-full max-w-md">
      <LoginPanel {...props} />
      <p className="mt-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
        LenziAI Diagnostic Systems Inc.
        <span className="block">Patient records are encrypted at rest on the laboratory server.</span>
      </p>
    </div>
  </div>
);
