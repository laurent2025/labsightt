import React from 'react';
import { AIModelConfig } from '../../types';
import { CircleSlash, Cpu, Globe, ShieldCheck } from 'lucide-react';

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'Not configured';
  }
}

const CATEGORY_LABELS: Record<AIModelConfig['category'], string> = {
  stool: 'Stool Parasitology',
  blood: 'Blood Differential',
  urine: 'Urinary Sediment',
  csf: 'Cerebrospinal Fluid',
  other: 'Other Specimen'
};

/**
 * Administrative overview of the configured inference models. Read-only:
 * endpoints and credentials live on the server, and inference is proxied so
 * the model credential never reaches the browser.
 */
export const AIModelsView: React.FC<{ models: AIModelConfig[] }> = ({ models }) => (
  <div className="space-y-5 animate-fade-in">
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
        <Cpu className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
      </div>
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">AI Model Configuration</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Configured detection pipelines. Endpoints are called by the laboratory server only.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {models.map(model => (
        <div
          key={model.id}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{model.name}</h2>
              <p className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                {model.architecture} · {model.version}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                model.active
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {model.active ? <ShieldCheck className="w-3 h-3" /> : <CircleSlash className="w-3 h-3" />}
              {model.active ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 font-semibold">
              {CATEGORY_LABELS[model.category] ?? model.category}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              <Globe className="w-3 h-3" />
              {endpointHost(model.endpoint)}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              conf ≥ {model.confidenceThreshold}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              IoU ≥ {model.iouThreshold}
            </span>
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block mb-1.5">
              Detection Targets
            </span>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {model.classes.map(cls => (
                <span
                  key={cls}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md text-slate-800 dark:text-slate-200 italic"
                >
                  {cls}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
            Not clinically validated. No accuracy figure exists for this software; model output
            requires technologist review and two-person verification before release.
          </p>
        </div>
      ))}
    </div>
  </div>
);
