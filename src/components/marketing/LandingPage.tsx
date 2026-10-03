import React, { useState } from 'react';
import {
  Microscope,
  Sun,
  Moon,
  LogIn,
  UserPlus,
  Camera,
  Crosshair,
  ScanSearch,
  ClipboardCheck,
  ShieldCheck,
  Lock,
  ArrowRight,
  FlaskConical,
  FileCheck2,
  CheckCircle2,
  GitCommitVertical
} from 'lucide-react';
import { LAB_METADATA, SLIDE_ASSETS, DEFAULT_AI_MODELS } from '../../lib/constants';
import { useTheme } from '../../context/ThemeContext';
import { LoginPanel } from '../auth/LoginPanel';
import { LegalModal } from '../legal/LegalModal';

interface LandingPageProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<{ message: string }>;
}

const FEATURES = [
  {
    icon: ScanSearch,
    title: 'Automated morphology detection',
    body: 'A serverless YOLO26m workflow flags candidate organisms, cells, and crystals on every field — stool, blood, and urine pipelines, each tuned per specimen type.'
  },
  {
    icon: Crosshair,
    title: 'Optical stage workstation',
    body: 'Field-by-field navigation with magnification and stain metadata, on-screen measurements, and a split/enhanced view for reviewing every region of interest.'
  },
  {
    icon: Camera,
    title: 'Direct camera capture',
    body: 'Capture straight from the microscope camera and run inference on the live frame. No manual uploads, no lost slides.'
  },
  {
    icon: ClipboardCheck,
    title: 'Adjudication workflow',
    body: 'Confirm or reject each AI candidate, add manual findings, and the system quantifies findings per field before anything reaches a report.'
  },
  {
    icon: ShieldCheck,
    title: 'Two-person verification',
    body: 'A report can only be verified by a second operator — the technologist who originated it cannot sign off on it alone.'
  },
  {
    icon: Lock,
    title: 'Encrypted PHI & audit chain',
    body: 'Patient fields are encrypted at rest on the laboratory server, and every action lands in an append-only, hash-chained audit log.'
  }
];

const WORKFLOW = [
  {
    step: '01',
    title: 'Accession the specimen',
    body: 'Patient record, slide label, stain, and magnification are captured once and travel with the analysis.'
  },
  {
    step: '02',
    title: 'Run the AI scan',
    body: 'Inference runs on the server; the model credential never reaches the browser. Detections arrive with confidence scores.'
  },
  {
    step: '03',
    title: 'Adjudicate detections',
    body: 'Every AI candidate is confirmed, rejected, or superseded by a manual finding — the reviewer sees each one.'
  },
  {
    step: '04',
    title: 'Verify the report',
    body: 'A second operator reviews the completed analysis and verifies the draft report.'
  },
  {
    step: '05',
    title: 'Release with sign-off',
    body: 'The released report carries both sign-offs and its full chain of custody.'
  }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onSubmit, onSignup }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors duration-200">
      {/* Marketing top bar */}
      <header className="no-print sticky top-0 z-40 bg-white/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight">RenziAI</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold">
                AI CLINICAL
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition">Features</a>
            <a href="#workflow" className="hover:text-slate-900 dark:hover:text-white transition">Workflow</a>
            <a href="#governance" className="hover:text-slate-900 dark:hover:text-white transition">Governance</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Mobile section shortcuts — the desktop nav hides below md, so
            mobile readers otherwise have no path to the lower sections. */}
        <nav aria-label="Sections" className="md:hidden sticky top-16 z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto">
            {[
              { href: '#features', label: 'Features' },
              { href: '#workflow', label: 'Workflow' },
              { href: '#governance', label: 'Governance' }
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                className="shrink-0 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-cyan-400 transition whitespace-nowrap"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(34,197,94,0.09),transparent)] dark:bg-[radial-gradient(55%_45%_at_50%_0%,rgba(34,197,94,0.07),transparent)]"
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-16 lg:pt-20 lg:pb-24 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="animate-fade-in">
              <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-[11px] font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                <FlaskConical className="w-3.5 h-3.5" />
                AI-ASSISTED CLINICAL MICROSCOPY
              </p>
              <h1 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight leading-tight text-slate-900 dark:text-white">
                Every field scanned.
                <br />
                Every finding verified.
              </h1>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                RenziAI pairs automated computer-vision detection with a disciplined laboratory
                workflow: accession the specimen, scan the slide, adjudicate every detection, and
                release a two-person verified report — with an unbroken chain of custody.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="px-5 py-3 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className="px-5 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <UserPlus className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                  Create account
                </button>
              </div>
              <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {LAB_METADATA.institution} · Medical Director: {LAB_METADATA.director}
              </p>
            </div>

            {/* Detection preview card */}
            <div className="relative animate-fade-in [animation-delay:120ms]">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Microscope className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                    Microscopy Optical Stage
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    400x · Lugol&apos;s Iodine
                  </span>
                </div>
                <div className="relative bg-slate-950">
                  <img
                    src={SLIDE_ASSETS.stool}
                    alt="Example photomicrograph with detection overlays"
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <div className="absolute top-[18%] left-[12%] w-[26%] h-[22%] rounded-lg border-2 border-emerald-400 bg-emerald-400/10">
                    <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-mono whitespace-nowrap">
                      Giardia lamblia cyst · 0.82
                    </span>
                  </div>
                  <div className="absolute bottom-[16%] right-[14%] w-[22%] h-[18%] rounded-lg border-2 border-amber-400 bg-amber-400/10">
                    <span className="absolute -top-5 right-0 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-mono whitespace-nowrap">
                      Ascaris ovum · 0.71
                    </span>
                  </div>
                </div>
                <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>EXAMPLE PREVIEW — detection overlays for illustration</span>
                  <span>{DEFAULT_AI_MODELS.length} detection models configured</span>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Built around the laboratory workflow, not just the model
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Detection is the starting point. Everything after it — adjudication, quantification,
                verification, release — is built to survive review by a real laboratory team.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(feature => (
                <div
                  key={feature.title}
                  className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-md transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <feature.icon className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="scroll-mt-20 bg-white dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">From slide to signed report</h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Every stage leaves a record. No report can be verified, let alone released, without
                the full chain of custody behind it.
              </p>
            </div>
            <ol className="mt-10 grid grid-cols-1 md:grid-cols-5 gap-5">
              {WORKFLOW.map((item, index) => (
                <li key={item.step} className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-cyan-300 dark:hover:border-cyan-800 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-cyan-700 dark:text-cyan-400">{item.step}</span>
                    <CheckCircle2 className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.body}</p>
                  {index < WORKFLOW.length - 1 && (
                    <ArrowRight className="hidden md:block absolute top-1/2 -right-4 w-4 h-4 text-slate-300 dark:text-slate-600 -translate-y-1/2" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Governance */}
        <section id="governance" className="scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <div className="flex items-center gap-2">
                  <GitCommitVertical className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                  <h2 className="text-base font-bold">Clinical decision support notice</h2>
                </div>
                <p className="mt-4 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {LAB_METADATA.legalDisclaimer}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {LAB_METADATA.institution}
                  </span>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                  <h2 className="text-base font-bold">Governance &amp; privacy</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setLegalTab('terms')}
                  className="text-left text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Terms of Service &amp; Decision Support
                </button>
                <button
                  type="button"
                  onClick={() => setLegalTab('privacy')}
                  className="text-left text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Privacy Policy &amp; HIPAA De-Identification
                </button>
                <div className="mt-auto pt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 border-l-2 border-amber-300 dark:border-amber-600/60 pl-3">
                  Software provides automated morphology suggestions only. Pathologist or
                  technologist sign-off is required prior to clinical release.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Try the workstation</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Create an account with your email, verify it, and sign in to the full laboratory workflow.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className="px-5 py-3 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Create account
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signin')}
                className="px-5 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-semibold transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Sign in
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Marketing footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Microscope className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
            <span className="font-bold text-slate-900 dark:text-white">RenziAI</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold">AI CLINICAL</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span>© {new Date().getFullYear()} {LAB_METADATA.name} Diagnostic Systems Inc. All rights reserved.</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setLegalTab('privacy')}
              className="hover:text-slate-700 dark:hover:text-slate-200 underline cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setLegalTab('terms')}
              className="hover:text-slate-700 dark:hover:text-slate-200 underline cursor-pointer"
            >
              Terms of Use
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="font-mono">Records encrypted at rest on the laboratory server</span>
          </div>
        </div>
      </footer>

      {/* Sign in / Create account modal */}
      {authMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="my-auto w-full flex justify-center animate-fade-in">
            <LoginPanel
              initialMode={authMode}
              onClose={() => setAuthMode(null)}
              onSubmit={onSubmit}
              onSignup={onSignup}
            />
          </div>
        </div>
      )}

      {/* Terms & Privacy modal */}
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
};
