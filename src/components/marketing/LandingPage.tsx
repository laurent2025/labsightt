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
  GitCommitVertical,
  Sparkles,
  Zap,
  Eye,
  Server,
  Users,
  Award,
  Globe2
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
    body: 'A serverless YOLO26m workflow flags candidate organisms, cells, and crystals across stool, blood, and urine pipelines — each model tuned per specimen type.',
    accent: 'from-cyan-500/10 to-emerald-500/10 dark:from-cyan-400/10 dark:to-emerald-400/10'
  },
  {
    icon: Crosshair,
    title: 'Optical stage workstation',
    body: 'Field-by-field navigation with magnification and stain metadata, on-screen measurements, and a split/enhanced view for reviewing every region of interest.',
    accent: 'from-violet-500/10 to-cyan-500/10 dark:from-violet-400/10 dark:to-cyan-400/10'
  },
  {
    icon: Camera,
    title: 'Direct camera capture',
    body: 'Capture straight from the microscope camera and run inference on the live frame. No manual uploads, no lost slides.',
    accent: 'from-amber-500/10 to-orange-500/10 dark:from-amber-400/10 dark:to-orange-400/10'
  },
  {
    icon: ClipboardCheck,
    title: 'Adjudication workflow',
    body: 'Confirm or reject each AI candidate, add manual findings, and the system quantifies findings per field before anything reaches a report.',
    accent: 'from-emerald-500/10 to-teal-500/10 dark:from-emerald-400/10 dark:to-teal-400/10'
  },
  {
    icon: ShieldCheck,
    title: 'Two-person verification',
    body: 'Reports can only be verified by a second operator. The technologist who originated the analysis cannot sign off on it alone.',
    accent: 'from-sky-500/10 to-blue-500/10 dark:from-sky-400/10 dark:to-blue-400/10'
  },
  {
    icon: Lock,
    title: 'Encrypted PHI & audit chain',
    body: 'Patient fields are encrypted at rest on the laboratory server, and every action lands in an append-only, hash-chained audit log.',
    accent: 'from-rose-500/10 to-pink-500/10 dark:from-rose-400/10 dark:to-pink-400/10'
  }
];

const WORKFLOW = [
  {
    step: '01',
    title: 'Accession the specimen',
    body: 'Patient record, slide label, stain, and magnification are captured once and travel with the analysis.',
    icon: Users
  },
  {
    step: '02',
    title: 'Run the AI scan',
    body: 'Inference runs on the server; the model credential never reaches the browser. Detections arrive with confidence scores.',
    icon: Zap
  },
  {
    step: '03',
    title: 'Adjudicate detections',
    body: 'Every AI candidate is confirmed, rejected, or superseded by a manual finding. The reviewer sees each one.',
    icon: Eye
  },
  {
    step: '04',
    title: 'Verify the report',
    body: 'A second operator reviews the completed analysis and verifies the draft report.',
    icon: FileCheck2
  },
  {
    step: '05',
    title: 'Release with sign-off',
    body: 'The released report carries both sign-offs and its full chain of custody.',
    icon: Award
  }
];

const STATS = [
  { value: 'AES-256', label: 'PHI encryption at rest' },
  { value: '2-person', label: 'Verification gate' },
  { value: 'Hash chain', label: 'Append-only audit' },
  { value: 'Server-side', label: 'Inference proxy' }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onSubmit, onSignup }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors duration-200 selection:bg-cyan-200 dark:selection:bg-cyan-800">
      {/* Marketing top bar */}
      <header className="no-print sticky top-0 z-40 safe-top bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1440px] mx-auto gutter-x h-14 md:h-16 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="relative w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center shadow-md shadow-green-600/25">
              <Microscope className="w-4 h-4 md:w-5 md:h-5 text-white" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-300 border-2 border-white dark:border-slate-950" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm md:text-base font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                LenziAI
              </span>
              <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[11px] font-mono bg-gradient-to-r from-green-100 to-green-200 dark:from-green-950 dark:to-green-900 text-green-900 dark:text-green-200 font-semibold border border-green-300 dark:border-green-800">
                AI CLINICAL
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-xs font-semibold text-slate-600 dark:text-slate-300 min-w-0">
            <a href="#features" className="group relative hover:text-slate-900 dark:hover:text-white transition">
              Features
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-green-600 dark:bg-green-400 transition-all group-hover:w-full" />
            </a>
            <a href="#workflow" className="group relative hover:text-slate-900 dark:hover:text-white transition">
              Workflow
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-green-600 dark:bg-green-400 transition-all group-hover:w-full" />
            </a>
            <a href="#governance" className="group relative hover:text-slate-900 dark:hover:text-white transition">
              Governance
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-green-600 dark:bg-green-400 transition-all group-hover:w-full" />
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-10 h-10 md:w-9 md:h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-green-400 dark:hover:border-green-700 transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-green-400" />
              ) : (
                <Moon className="w-4 h-4 text-green-700" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              className="h-10 md:h-9 px-3 sm:px-4 flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-green-600 dark:hover:bg-green-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-md shadow-slate-900/10 dark:shadow-green-950/40 hover:shadow-lg hover:-translate-y-0.5 whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Mobile section shortcuts. Offset matches the header height at each
            breakpoint so the strip parks directly under it instead of over it. */}
        <nav
          aria-label="Sections"
          className="md:hidden sticky top-14 z-30 bg-white/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200 dark:border-slate-800"
        >
          <div className="max-w-[1440px] mx-auto gutter-x py-2 flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { href: '#features', label: 'Features' },
              { href: '#workflow', label: 'Workflow' },
              { href: '#governance', label: 'Governance' }
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                className="shrink-0 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-green-500 hover:text-green-800 dark:hover:text-green-300 transition whitespace-nowrap"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Animated mesh gradient background */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.05),transparent_50%)]" />
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 dark:bg-cyan-400/5 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/5 dark:bg-emerald-400/5 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
            <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-teal-500/5 dark:bg-teal-400/5 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
          </div>

          <div className="relative max-w-[1440px] mx-auto gutter-x pt-14 pb-16 lg:pt-24 lg:pb-28 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left column - text */}
            <div className="animate-fade-in space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-50 to-emerald-50 dark:from-cyan-950/60 dark:to-emerald-950/60 border border-cyan-200 dark:border-cyan-800 text-xs font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                <Sparkles className="w-3.5 h-3.5" />
                AI ASSISTED CLINICAL MICROSCOPY
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-slate-900 dark:text-white">
                Every field scanned.
                <br />
                <span className="bg-gradient-to-r from-cyan-700 to-emerald-600 dark:from-cyan-400 dark:to-emerald-400 bg-clip-text text-transparent">Every finding verified.</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                LenziAI pairs automated computer vision detection with a disciplined laboratory
                workflow: accession the specimen, scan the slide, adjudicate every detection, and
                release a two-person verified report with an unbroken chain of custody.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="group px-5 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-slate-900/20 dark:hover:shadow-cyan-900/30 hover:-translate-y-0.5"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className="px-5 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:border-cyan-400 dark:hover:border-cyan-600 hover:shadow-md hover:-translate-y-0.5"
                >
                  <UserPlus className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                  Create account
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-green-700 dark:text-green-400" /> Encrypted patient data</span>
                <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-green-700 dark:text-green-400" /> Server-side inference</span>
                <span className="flex items-center gap-1.5"><GitCommitVertical className="w-3.5 h-3.5 text-green-700 dark:text-green-400" /> Hash-chained audit</span>
              </div>
            </div>

            {/* Right column - preview card */}
            <div className="relative animate-fade-in [animation-delay:120ms]">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 dark:from-cyan-400/20 dark:to-emerald-400/20 rounded-3xl blur-2xl opacity-60" />
              <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden">
                {/* Card header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <div className="relative">
                      <Microscope className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                      <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    Microscopy Optical Stage
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-[11px] font-mono text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                    400x · Lugol&apos;s Iodine
                  </span>
                </div>

                {/* Image with overlays */}
                <div className="relative bg-slate-950">
                  <img
                    src={SLIDE_ASSETS.stool}
                    alt="Example photomicrograph with detection overlays"
                    className="w-full aspect-[4/3] object-cover"
                  />
                  {/* Detection overlays with improved styling */}
                  <div className="absolute top-[18%] left-[12%] w-[26%] h-[22%] rounded-lg border-2 border-emerald-400 bg-emerald-400/10 backdrop-blur-sm">
                    <div className="absolute -top-6 left-0 px-2 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-mono whitespace-nowrap shadow-lg shadow-emerald-500/30 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Giardia lamblia cyst · 0.82
                    </div>
                  </div>
                  <div className="absolute bottom-[16%] right-[14%] w-[22%] h-[18%] rounded-lg border-2 border-amber-400 bg-amber-400/10 backdrop-blur-sm">
                    <div className="absolute -top-6 right-0 px-2 py-1 rounded-md bg-amber-500 text-white text-[11px] font-mono whitespace-nowrap shadow-lg shadow-amber-500/30 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Ascaris ovum · 0.71
                    </div>
                  </div>

                  {/* Live indicator */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/80 backdrop-blur-md border border-slate-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-mono text-slate-300">LIVE</span>
                  </div>
                </div>

                {/* Card footer */}
                <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
                  <span>Illustrative detection overlays — not an analysed slide</span>
                  <span className="flex items-center gap-1">
                    <Server className="w-3 h-3" />
                    {DEFAULT_AI_MODELS.length} detection model{DEFAULT_AI_MODELS.length !== 1 ? 's' : ''} configured
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-y border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm">
          <div className="max-w-[1440px] mx-auto gutter-x py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {STATS.map((stat, i) => (
                <div key={i} className="text-center space-y-1 group">
                  <div className="text-2xl font-bold bg-gradient-to-r from-cyan-700 to-emerald-600 dark:from-cyan-400 dark:to-emerald-400 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
                    {stat.value}
                  </div>
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20">
          <div className="max-w-[1440px] mx-auto gutter-x py-16 lg:py-24">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-xs font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                <FlaskConical className="w-3.5 h-3.5" />
                CORE CAPABILITIES
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                Built around the laboratory workflow
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Detection is the starting point. Everything after it — adjudication, quantification,
                verification, release — is built to survive review by a real laboratory team.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((feature, i) => (
                <div
                  key={feature.title}
                  className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-xl hover:shadow-cyan-500/5 dark:hover:shadow-cyan-900/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {/* Background gradient on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-50 to-emerald-50 dark:from-cyan-950/60 dark:to-emerald-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-sm">
                      <feature.icon className="w-6 h-6 text-cyan-700 dark:text-cyan-400" />
                    </div>
                    <h3 className="mt-5 text-base font-bold text-slate-900 dark:text-white group-hover:text-cyan-900 dark:group-hover:text-cyan-100 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                      {feature.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="scroll-mt-20 bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm border-y border-slate-200 dark:border-slate-800">
          <div className="max-w-[1440px] mx-auto gutter-x py-16 lg:py-24">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                <GitCommitVertical className="w-3.5 h-3.5" />
                WORKFLOW
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                From slide to signed report
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Every stage leaves a record. No report can be verified, let alone released, without
                the full chain of custody behind it.
              </p>
            </div>

            <ol className="mt-12 relative">
              {/* Connecting line */}
              <div className="hidden md:block absolute left-[28px] top-8 bottom-8 w-px bg-gradient-to-b from-cyan-300 via-cyan-200 to-emerald-300 dark:from-cyan-700 dark:via-cyan-800 dark:to-emerald-700" />

              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {WORKFLOW.map((item, index) => (
                  <li key={item.step} className="relative group">
                    <div className="flex items-start gap-4">
                      {/* Step indicator */}
                      <div className="relative z-10 flex flex-col items-center">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-xl group-hover:shadow-cyan-500/30 group-hover:scale-110 transition-all duration-300">
                          <item.icon className="w-6 h-6 text-white" />
                        </div>
                        {index < WORKFLOW.length - 1 && (
                          <div className="hidden md:flex mt-4 flex-col items-center">
                            <ArrowRight className="w-4 h-4 text-cyan-400 dark:text-cyan-600 rotate-90" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pt-1">
                        <span className="text-[11px] font-mono font-bold text-cyan-700 dark:text-cyan-400">
                          STEP {item.step}
                        </span>
                        <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white group-hover:text-cyan-900 dark:group-hover:text-cyan-100 transition-colors">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </div>
            </ol>
          </div>
        </section>

        {/* Governance */}
        <section id="governance" className="scroll-mt-20">
          <div className="max-w-[1440px] mx-auto gutter-x py-16 lg:py-24">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-xs font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                <FileCheck2 className="w-3.5 h-3.5" />
                GOVERNANCE
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                Built for audit-ready laboratories
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Security isn't a feature toggle. Every layer — from the database to the audit log to the verification gate — is designed to satisfy a real laboratory review.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-lg transition-all">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center mb-4">
                  <Lock className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Encryption at rest</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Patient-identifying fields are encrypted with AES-256-GCM before they touch disk. A stolen database file yields ciphertext, not a patient list. A blind index preserves exact-match search without storing plaintext.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-lg transition-all">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center mb-4">
                  <GitCommitVertical className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Append-only audit chain</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Every accession, inference run, detection adjudication, report verification, and role change is written to a hash-chained log. Any edit or deletion invalidates every subsequent entry — verified in one click from the admin console.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-lg transition-all">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Access control &amp; approval</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  New accounts are email-verified and held for administrator approval before first sign-in. Reports require a second operator to verify — the originating technologist cannot sign off alone. Admins can disable accounts instantly.
                </p>
              </div>
            </div>

            <div className="mt-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLegalTab('terms')}
                  className="group/btn text-left text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <div className="w-6 h-6 rounded-md bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                    <ArrowRight className="w-3 h-3 text-cyan-700 dark:text-cyan-400" />
                  </div>
                  Terms of Service &amp; Decision Support
                </button>
                <button
                  type="button"
                  onClick={() => setLegalTab('privacy')}
                  className="group/btn text-left text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <div className="w-6 h-6 rounded-md bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                    <ArrowRight className="w-3 h-3 text-cyan-700 dark:text-cyan-400" />
                  </div>
                  Privacy Policy &amp; HIPAA De-Identification
                </button>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 border-l-2 border-amber-400 dark:border-amber-600 pl-3 leading-relaxed">
                LenziAI provides automated morphology suggestions only. Pathologist or technologist sign-off is required prior to clinical release.
              </p>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="relative overflow-hidden border-t border-slate-200 dark:border-slate-800">
          {/* Background pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/30" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.08),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.05),transparent_70%)]" />

          <div className="relative max-w-[1440px] mx-auto gutter-x py-16 lg:py-20">
            <div className="max-w-3xl mx-auto text-center space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-xs font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                <Globe2 className="w-3.5 h-3.5" />
                GET STARTED
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                Ready to modernize your microscopy workflow?
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
                Create an account with your email, verify it, and sign in to the full laboratory workflow.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className="group px-6 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-xl hover:shadow-slate-900/20 dark:hover:shadow-cyan-900/30 hover:-translate-y-0.5"
                >
                  <UserPlus className="w-4 h-4" />
                  Create account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:border-cyan-400 dark:hover:border-cyan-600 hover:shadow-md hover:-translate-y-0.5"
                >
                  <LogIn className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                  Sign in
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Marketing footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm safe-bottom">
        <div className="max-w-[1440px] mx-auto gutter-x py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center">
              <Microscope className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs font-bold text-slate-900 dark:text-white">LenziAI</span>
            <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-green-100 dark:bg-green-950 text-green-900 dark:text-green-200 font-semibold border border-green-300 dark:border-green-800">
              AI CLINICAL
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span>&copy; {new Date().getFullYear()} {LAB_METADATA.license}. All rights reserved.</span>
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">&middot;</span>
            <button
              type="button"
              onClick={() => setLegalTab('privacy')}
              className="hover:text-green-800 dark:hover:text-green-300 underline underline-offset-2 cursor-pointer text-slate-600 dark:text-slate-400"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">&middot;</span>
            <button
              type="button"
              onClick={() => setLegalTab('terms')}
              className="hover:text-green-800 dark:hover:text-green-300 underline underline-offset-2 cursor-pointer text-slate-600 dark:text-slate-400"
            >
              Terms of Use
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400">Records encrypted at rest on the laboratory server</span>
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
