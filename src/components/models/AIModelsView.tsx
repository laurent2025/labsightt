import React, { useEffect, useState } from 'react';
import { AIModelConfig } from '../../types';
import {
  Cpu,
  Key,
  ExternalLink,
  Info,
  Code
} from 'lucide-react';
import { ROBOFLOW_POPULAR_MODELS } from '../../services/integration';
import { systemApi, type SystemStatus } from '../../services/api';
import { useLabStore, roleRank } from '../../store/labStore';

interface AIModelsViewProps {
  models: AIModelConfig[];
  onUpdateModel: (modelId: string, updates: Partial<AIModelConfig>) => void;
}

export const AIModelsView: React.FC<AIModelsViewProps> = ({ models, onUpdateModel }) => {
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'models' | 'presets' | 'code'>('models');
  const [copiedCode, setCopiedCode] = useState(false);
  const [serverStatus, setServerStatus] = useState<SystemStatus | null>(null);
  const { user } = useLabStore();
  const isDirector = user && roleRank(user) >= 3;
  const isSupervisorOrAbove = user && roleRank(user) >= 2;

  // Read the server's inference configuration. The credential itself is never
  // returned to the browser, so there is nothing here to leak.
  useEffect(() => {
    let cancelled = false;
    systemApi
      .status()
      .then(status => !cancelled && setServerStatus(status))
      .catch(() => !cancelled && setServerStatus(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApplyPreset = (preset: typeof ROBOFLOW_POPULAR_MODELS[0]) => {
    const target = models.find(m => m.category === preset.category) || models[0];
    if (target) onUpdateModel(target.id, { name: preset.name });
  };

  const handleTestInference = async (model: AIModelConfig) => {
    setTestingModelId(model.id);
    setTestStatus('Checking server inference configuration...');

    try {
      const status = await systemApi.status();
      setServerStatus(status);

      if (!status.inference.configured) {
        setTestStatus(
          'Inference is not configured on the server. A Lab Director must set ROBOFLOW_ENDPOINT and ROBOFLOW_API_KEY in the server environment.'
        );
        return;
      }
      setTestStatus(
        `Server inference is configured for ${status.inference.endpoint}. Connectivity is verified when a specimen is analysed, not from this screen.`
      );
    } catch (err) {
      setTestStatus(
        `Could not reach the LabSight server: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setTimeout(() => {
        setTestingModelId(null);
        setTestStatus(null);
      }, 6000);
    }
  };

  const codeSnippet = `// Server-side Roboflow workflow integration.
//
// The credential lives ONLY in the server environment. It is never sent to the
// browser, so it cannot be read from devtools, copied, or exfiltrated from a
// client. The browser calls this API instead:
//
//   POST /api/analyses  { sampleId, imageBase64 }
//
// which is implemented in server/inference.js as:

// server/.env (or the process environment)
//   ROBOFLOW_ENDPOINT=https://serverless.roboflow.com/<workspace>/workflows/<id>
//   ROBOFLOW_API_KEY=<secret, never committed>

import { runInference } from './inference.js';

const WORKFLOW_URL = "https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-1-yolo26m-t1-logic";

export async function runLabSightWorkflow(imageFile: File) {
  const base64 = await fileToBase64(imageFile); // Pure base64 without prefix
  
  const response = await fetch(\`\${WORKFLOW_URL}?api_key=\${ROBOFLOW_API_KEY}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: {
          type: "base64",
          value: base64
        }
      }
    })
  });
  
  const result = await response.json();
  return result.outputs;
}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            AI Vision Models & Roboflow Integration
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Trained YOLO computer-vision pipelines, confidence thresholds, and Roboflow Universe presets
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'models'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Models
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'presets'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Roboflow Presets
          </button>
          {isDirector && (
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'code'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              REST API Code
            </button>
          )}
        </div>
      </div>

      {/* Roboflow API Key Configuration Card — directors only */}
      {isDirector && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-700" />
            <h2 className="text-sm font-bold text-slate-900">Roboflow Inference API Credentials</h2>
          </div>
          <a
            href="https://app.roboflow.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cyan-700 hover:text-cyan-800 font-medium inline-flex items-center gap-1"
          >
            <span>Roboflow Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-3">
          <div
            className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
              serverStatus?.inference.configured
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            <Key className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                {serverStatus?.inference.configured
                  ? 'Inference credential is held by the server'
                  : 'Inference is not configured'}
              </div>
              <div className="mt-0.5 opacity-90">
                {serverStatus?.inference.configured ? (
                  <>
                    Endpoint: <span className="font-mono">{serverStatus.inference.endpoint}</span>.
                    The credential is read from the server environment and is never transmitted to this
                    browser.
                  </>
                ) : (
                  <>
                    A Lab Director must set <span className="font-mono">ROBOFLOW_ENDPOINT</span> and{' '}
                    <span className="font-mono">ROBOFLOW_API_KEY</span> in the server environment.
                    Analysis will fail until then.
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              The credential is entered on the server, not in this app. That is deliberate: a key
              typed into a browser can always be extracted by anyone with access to the page, the
              machine, or the network path.
            </span>
          </div>
        </div>
        </div>
      )}

      {activeTab === 'presets' ? (
        /* Presets Tab */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ROBOFLOW_POPULAR_MODELS.map(preset => (
            <div key={preset.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-slate-900 text-sm">{preset.name}</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    v{preset.version}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{preset.description}</p>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] font-mono mb-4 space-y-1">
                  <div>Workspace: <span className="text-slate-800">{preset.workspace}</span></div>
                  <div>Project: <span className="text-slate-800 font-semibold">{preset.project}</span></div>
                </div>

                <div className="text-[11px] text-slate-500 mb-4">
                  <span className="font-semibold block mb-1">Target Classes:</span>
                  <div className="flex flex-wrap gap-1">
                    {preset.classes.map((c, i) => (
                      <span key={i} className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold transition"
              >
                Apply to {preset.category.toUpperCase()} Pipeline
              </button>
            </div>
          ))}
        </div>
      ) : activeTab === 'code' ? (
        /* Code Tab */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200 font-mono text-xs shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <span className="text-cyan-400 font-semibold flex items-center gap-2">
              <Code className="w-4 h-4" />
              Direct Browser REST Integration (TypeScript)
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(codeSnippet);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
            >
              {copiedCode ? '✓ Copied' : 'Copy Code'}
            </button>
          </div>
          <pre className="overflow-x-auto text-slate-300 leading-relaxed p-2">
            {codeSnippet}
          </pre>
        </div>
      ) : (
        /* Active Models Tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {models.map(model => (
            <div
              key={model.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{model.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5">
                      <span>{model.architecture}</span>
                      <span>·</span>
                      <span>{model.version}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                      model.active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {model.active ? 'Active' : 'Disabled'}
                  </span>
                </div>

                {/* Roboflow project info — directors only */}
                {isDirector && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 text-xs space-y-1">
                    {model.isWorkflow ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Workspace Slug:</span>
                          <span className="font-mono font-semibold text-slate-800">{model.roboflowWorkspace || 'laurent-kashinje'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Workflow Slug:</span>
                          <span className="font-mono font-semibold text-cyan-800">{model.roboflowWorkflowId || model.roboflowModel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Declared Input:</span>
                          <span className="font-mono text-slate-700">image (base64)</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Roboflow Model ID:</span>
                          <span className="font-mono font-semibold text-slate-800">{model.roboflowModel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Model Version:</span>
                          <span className="font-mono text-slate-700">v{model.roboflowVersion}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                </div>

                {/* Supported Classes */}
                <div className="mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    TARGET CLASSIFICATIONS ({model.classes.length})
                  </span>
                  <div className="flex flex-wrap gap-1 text-[11px] text-slate-600">
                    {model.classes.map((c, i) => (
                      <span key={i} className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sliders for Confidence & IoU */}
                <div className="space-y-3 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 font-medium">Confidence Cutoff:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {Math.round(model.confidenceThreshold * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.95"
                      step="0.05"
                      value={model.confidenceThreshold}
                      onChange={e =>
                        onUpdateModel(model.id, { confidenceThreshold: parseFloat(e.target.value) })
                      }
                      className="w-full accent-cyan-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 font-medium">NMS Overlap (IoU):</span>
                      <span className="font-mono font-bold text-slate-900">
                        {Math.round(model.iouThreshold * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.80"
                      step="0.05"
                      value={model.iouThreshold}
                      onChange={e =>
                        onUpdateModel(model.id, { iouThreshold: parseFloat(e.target.value) })
                      }
                      className="w-full accent-cyan-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Test action — supervisors and directors only */}
                {isSupervisorOrAbove && (
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    {testingModelId === model.id ? (
                      <div className="text-[11px] font-mono text-cyan-700 bg-cyan-50 p-2 rounded text-center animate-pulse">
                        {testStatus}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTestInference(model)}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Cpu className="w-3.5 h-3.5 text-slate-600" />
                        <span>Test Inference Pipeline</span>
                      </button>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
