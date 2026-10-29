import React, { useEffect, useState } from 'react';
import { LoginPanel } from './LoginPanel';
import { Activity, Check, LockKeyhole, Microscope, ScanSearch, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<{ message: string }>;
}

export const LoginScreen: React.FC<LoginScreenProps> = props => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="auth-screen relative min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-5 lg:p-8 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 auth-screen-grid bg-gradient-to-br from-green-100/80 via-transparent to-white dark:from-green-950/40 dark:via-transparent dark:to-transparent"
      />
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border-[48px] border-green-200/40 dark:border-green-900/20" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full border-[48px] border-slate-200/70 dark:border-slate-800/40" />

      <div className="relative grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-16">
        <section className="hidden lg:block" aria-label="LenziAI laboratory access">
          <div className="max-w-xl">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-700 to-green-500 text-white shadow-xl shadow-green-900/20">
                <Microscope className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">LenziAI</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-700 dark:text-green-300">Clinical microscopy</p>
              </div>
            </div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
              <Activity className="h-3.5 w-3.5" /> Laboratory workspace
            </p>
            <h1 className="max-w-lg text-4xl font-black leading-[1.08] tracking-tight text-slate-950 dark:text-white xl:text-5xl">
              Make every field of view count.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 dark:text-slate-300">
              Review microscopy images, organise slide fields, and adjudicate computer-vision findings in one disciplined workflow.
            </p>
            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                [ScanSearch, 'Field-by-field review'],
                [ShieldCheck, 'Human sign-off'],
                [LockKeyhole, 'Encrypted records']
              ].map(([Icon, label]) => (
                <div key={label as string} className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-3 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-700 dark:bg-green-950/70 dark:text-green-300">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {label as string}
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Built for laboratory operators, not unattended clinical release
            </div>
          </div>
        </section>

        <div className="relative w-full max-w-md justify-self-center lg:justify-self-end" style={{
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(20px)',
        animation: isLoaded ? 'fadeInUp 0.6s ease-out forwards' : 'none'
      }}>
        <LoginPanel {...props} />
        </div>
        <p className="relative text-center text-[11px] font-medium leading-relaxed text-slate-500 dark:text-slate-400 lg:col-span-2">
          LenziAI Diagnostic Systems Inc. · Patient records are encrypted at rest on the laboratory server.
        </p>
      </div>
    </div>
  );
};
