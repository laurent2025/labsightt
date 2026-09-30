import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  Patient,
  Sample,
  Analysis,
  LaboratoryReport,
  AIModelConfig,
  AuditLog,
  Detection,
  NewPatient
} from '../types';
import { DEFAULT_AI_MODELS, LAB_METADATA } from '../lib/constants';
import { quantifyDetections } from '../lib/quantification';
import { loadImageSource } from '../services/roboflow';
import {
  ApiError,
  SessionExpiredError,
  authApi,
  patientsApi,
  samplesApi,
  analysesApi,
  detectionsApi,
  reportsApi,
  auditApi,
  onSessionExpired,
  type SessionUser,
  type AuditEntry
} from '../services/api';

export interface UserSession {
  id: string;
  name: string;
}

export class ReportGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportGateError';
  }
}

export function toUserSession(user: SessionUser): UserSession {
  return {
    id: user.id,
    name: user.displayName
  };
}

export interface LabStoreValue {
  patients: Patient[];
  samples: Sample[];
  analyses: Analysis[];
  reports: LaboratoryReport[];
  models: AIModelConfig[];
  auditLogs: AuditLog[];

  user: UserSession | null;
  authChecked: boolean;
  loading: boolean;
  connectionError: string | null;
  storageIssue: string | null;
  loadError: string | null;
  /** Entity ids with an in-flight write, so controls can disable themselves. */
  pendingIds: Set<string>;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  refresh: () => Promise<void>;
  canVerifyReports: boolean;
  isSelf: (technologistId: string) => boolean;

  patientSearch: string;
  setPatientSearch: (term: string) => void;
  patientOffset: number;
  setPatientOffset: (offset: number) => void;
  patientTotal: number;

  updatePatient: (id: string, updates: Partial<Patient>) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;

  addPatient: (patient: NewPatient) => Promise<Patient>;
  addSample: (sample: Omit<Sample, 'id'>) => Promise<Sample>;
  createAndRunAnalysis: (
    patientId: string,
    sampleId: string,
    modelId: string,
    imageUrlOverride?: string
  ) => Promise<Analysis>;
  toggleDetectionConfirmation: (analysisId: string, detectionId: string) => Promise<void>;
  rejectDetection: (analysisId: string, detectionId: string) => Promise<void>;
  confirmAllDetections: (analysisId: string) => Promise<void>;
  addManualDetection: (analysisId: string, detection: Omit<Detection, 'id'>) => Promise<void>;
  updateAnalysisNotes: (analysisId: string, notes: string, impression: string) => void;
  updateModelConfig: (modelId: string, updates: Partial<AIModelConfig>) => void;
  generateReport: (analysisId: string) => Promise<LaboratoryReport>;
  updateReport: (
    reportId: string,
    updates: { technologistNotes?: string; clinicalImpression?: string }
  ) => Promise<void>;
  verifyReport: (reportId: string) => Promise<void>;
  deleteReport: (reportId: string) => Promise<void>;
}

const LabStoreContext = createContext<LabStoreValue | null>(null);

export function LabStoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [storageIssue, setStorageIssue] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Patient list paging and search, held here so the query is server-side and
  // survives navigation away from the list.
  const [patientSearch, setPatientSearchRaw] = useState('');
  const [patientOffset, setPatientOffset] = useState(0);
  const [patientTotal, setPatientTotal] = useState(0);
  const PAGE_SIZE = 50;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [reports, setReports] = useState<LaboratoryReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  // Model configuration is operator preference, not patient data. It stays on
  // the client; the model credential itself lives only on the server.
  const [models, setModels] = useState<AIModelConfig[]>(DEFAULT_AI_MODELS);

  const currentUser = user;

  const handleError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof SessionExpiredError) return;
    const message =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : fallback;
    setStorageIssue(message);
  }, []);

  /** Loads everything the signed-in user is allowed to see. */
  const refresh = useCallback(async () => {
    setLoading(true);
    setConnectionError(null);
    setLoadError(null);
    try {
      // Four independent reads run concurrently; a slow one no longer blocks
      // the others from rendering.
      const [p, s, a, r] = await Promise.all([
        patientsApi.list({ limit: PAGE_SIZE, offset: patientOffset, search: patientSearch || undefined }),
        samplesApi.list({ limit: 200 }),
        analysesApi.list({ limit: 200 }),
        reportsApi.list({ limit: 200 })
      ]);
      setPatients(p.patients);
      setPatientTotal(p.pagination.total);
      setSamples(s.samples);
      setAnalyses(a.analyses.map(row => hydrateAnalysis(row)));
      setReports(r.reports.map(report => ({ ...report, laboratoryInfo: LAB_INFO })));
      setStorageIssue(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setConnectionError(err.message);
      } else if (err instanceof SessionExpiredError) {
        // The listener already cleared the session; no banner needed.
      } else {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load laboratory data.');
      }
    } finally {
      setLoading(false);
    }
  }, [patientOffset, patientSearch]);

  /** Search changes reset to the first page, otherwise a filter can land past the end. */
  const setPatientSearch = useCallback((term: string) => {
    setPatientSearchRaw(term);
    setPatientOffset(0);
  }, []);

  useEffect(() => {
    if (!user) {
      setPatientSearchRaw('');
      setPatientOffset(0);
      setPatientTotal(0);
    }
  }, [user]);

  // Restore an existing session on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user: sessionUser } = await authApi.me();
        if (!cancelled) setUser(toUserSession(sessionUser));
      } catch (err) {
        if (!(err instanceof SessionExpiredError) && err instanceof ApiError && (err.status === 0 || err.status === 403)) {
          setConnectionError(err.status === 403
            ? 'Account profile could not be loaded. Please sign in again.'
            : err.message);
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onSessionExpired(() => setUser(null)), []);

  useEffect(() => {
    if (user) {
      void refresh();
    } else {
      setPatients([]);
      setSamples([]);
      setAnalyses([]);
      setReports([]);
      setAuditLogs([]);
    }
  }, [user, refresh]);
  useEffect(() => {
    if (!user) {
      setAuditLogs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { entries } = await auditApi.list(300);
        if (!cancelled) setAuditLogs(entries.map(toAuditLog));
      } catch {
        // A denied or failed audit read is not fatal to the workspace.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, analyses.length]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: sessionUser } = await authApi.login(email, password);
    setUser(toUserSession(sessionUser));
    setStorageIssue(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the call fails, drop local state so no PHI stays on screen.
    }
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword(currentPassword, newPassword);
  }, []);

  /**
   * Marks an entity as in-flight so the UI can disable its control and avoid
   * a double submit, which would otherwise write two adjudications.
   */
  const track = useCallback(async <T,>(key: string, work: () => Promise<T>): Promise<T> => {
    setPendingIds(prev => new Set(prev).add(key));
    try {
      return await work();
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const updatePatient = useCallback(
    async (id: string, updates: Partial<Patient>) => {
      try {
        const { patient } = await patientsApi.update(id, updates);
        setPatients(prev => prev.map(p => (p.id === id ? patient : p)));
        setStorageIssue(null);
      } catch (err) {
        handleError(err, 'Could not update the patient record.');
        throw err;
      }
    },
    [handleError]
  );

  const deletePatient = useCallback(
    async (id: string) => {
      try {
        await patientsApi.delete(id);
        const wasOnCurrentPage = patients.some(patient => patient.id === id);
        setPatients(prev => prev.filter(p => p.id !== id));
        if (wasOnCurrentPage) {
          setPatientTotal(prev => Math.max(0, prev - 1));
          if (patients.length === 1 && patientOffset > 0) {
            setPatientOffset(Math.max(0, patientOffset - PAGE_SIZE));
          }
        }
        setStorageIssue(null);
      } catch (err) {
        handleError(err, 'Could not delete the patient.');
        throw err;
      }
    },
    [handleError, patientOffset, patients, PAGE_SIZE]
  );

  const addPatient = useCallback(
    async (data: NewPatient): Promise<Patient> => {
      try {
        const { patient } = await patientsApi.create(data);
        setPatients(prev => [patient, ...prev]);
        return patient;
      } catch (err) {
        handleError(err, 'Could not register the patient.');
        throw err;
      }
    },
    [handleError]
  );

  const addSample = useCallback(
    async (data: Omit<Sample, 'id'>): Promise<Sample> => {
      try {
        const { sample } = await samplesApi.create(data);
        setSamples(prev => [sample, ...prev]);
        return sample;
      } catch (err) {
        handleError(err, 'Could not accession the specimen.');
        throw err;
      }
    },
    [handleError]
  );

  /**
   * Runs inference on the server. The image is uploaded to the API, which holds
   * the model credential, so the browser never sees or needs a key.
   */
  const createAndRunAnalysis = useCallback(
    async (
      patientId: string,
      sampleId: string,
      modelId: string,
      imageUrlOverride?: string
    ): Promise<Analysis> => {
      const sample = samples.find(s => s.id === sampleId);
      const model = models.find(m => m.id === modelId) || models[0];
      const imageUrl = imageUrlOverride || sample?.imageUrl;
      if (!imageUrl) throw new ReportGateError('Invalid specimen for analysis.');

      const source = await loadImageSource(imageUrl);
      const base64 =
        typeof source.base64 === 'string' && source.base64.startsWith('data:')
          ? source.base64
          : `data:image/png;base64,${source.base64}`;

      try {
        const { analysis } = await analysesApi.run(
          sampleId,
          base64,
          model?.confidenceThreshold ?? 0.5
        );
        const hydrated = hydrateAnalysis(analysis, patientId, model?.name ?? 'Server model');
        setAnalyses(prev => [hydrated, ...prev.filter(a => a.id !== hydrated.id)]);
        return hydrated;
      } catch (err) {
        handleError(err, 'Inference failed.');
        throw err;
      }
    },
    [samples, models, handleError]
  );

  const requantify = useCallback(
    (ana: Analysis, updatedDets: Detection[]): Analysis => {
      const sample = samples.find(s => s.id === ana.sampleId);
      return {
        ...ana,
        detections: updatedDets,
        findings: quantifyDetections(updatedDets, sample?.fieldsExamined || 10),
        totalDetections: updatedDets.filter(d => !d.rejected).length
      };
    },
    [samples]
  );

  const applyDetection = useCallback(
    async (analysisId: string, detectionId: string, decision: { confirmed?: boolean; rejected?: boolean }) => {
      // Guard against a double submit writing two adjudications for one click.
      if (pendingIds.has(detectionId)) return;

      await track(detectionId, async () => {
        try {
          await detectionsApi.adjudicate(detectionId, decision);
          setAnalyses(prev =>
            prev.map(ana => {
              if (ana.id !== analysisId) return ana;
              const updated = ana.detections.map(det =>
                det.id === detectionId ? { ...det, ...decision, rejected: decision.rejected ?? false } : det
              );
              return requantify(ana, updated);
            })
          );
          setStorageIssue(null);
        } catch (err) {
          handleError(err, 'Could not record the adjudication.');
          throw err;
        }
      });
    },
    [requantify, handleError, pendingIds, track]
  );

  const toggleDetectionConfirmation = useCallback(
    (analysisId: string, detectionId: string) => {
      const analysis = analyses.find(a => a.id === analysisId);
      const detection = analysis?.detections.find(d => d.id === detectionId);
      return applyDetection(analysisId, detectionId, { confirmed: !detection?.confirmed });
    },
    [analyses, applyDetection]
  );

  const rejectDetection = useCallback(
    (analysisId: string, detectionId: string) =>
      applyDetection(analysisId, detectionId, { confirmed: false, rejected: true }),
    [applyDetection]
  );

  const confirmAllDetections = useCallback(
    async (analysisId: string) => {
      const analysis = analyses.find(a => a.id === analysisId);
      if (!analysis) return;
      // Adjudicate sequentially so a mid-way failure leaves an honest state.
      for (const det of analysis.detections) {
        if (det.confirmed && !det.rejected) continue;
        await applyDetection(analysisId, det.id, { confirmed: true, rejected: false });
      }
    },
    [analyses, applyDetection]
  );

  const addManualDetection = useCallback(
    async (analysisId: string, det: Omit<Detection, 'id'>) => {
      // A manually recorded finding is a technologist assertion, not a model
      // proposal, so it must be confirmed and cannot be added to an analysis
      // the server has locked.
      setAnalyses(prev =>
        prev.map(ana => {
          if (ana.id !== analysisId) return ana;
          const created: Detection = {
            ...det,
            id: `det-manual-${Date.now()}`,
            confirmed: true,
            manual: true
          };
          return requantify(ana, [...ana.detections, created]);
        })
      );
      setStorageIssue(
        'Manual findings are recorded in this session only. The server does not yet accept ' +
          'technologist-added detections, so this will not survive a reload.'
      );
    },
    [requantify]
  );

  const updateAnalysisNotes = useCallback(
    (analysisId: string, technologistNotes: string, clinicalImpression: string) => {
      setAnalyses(prev =>
        prev.map(ana =>
          ana.id === analysisId
            ? { ...ana, technologistNotes, clinicalImpression, reviewedBy: currentUser?.name }
            : ana
        )
      );
    },
    [currentUser]
  );

  const generateReport = useCallback(
    async (analysisId: string): Promise<LaboratoryReport> => {
      const analysis = analyses.find(a => a.id === analysisId);
      if (!analysis) throw new ReportGateError('Analysis not found.');

      // Mirror of the server gate so the operator gets an immediate, specific
      // message. The server re-checks independently and is authoritative.
      const pending = analysis.detections.filter(d => !d.rejected && !d.confirmed);
      if (pending.length > 0) {
        throw new ReportGateError(
          `${pending.length} detection${pending.length === 1 ? '' : 's'} still require adjudication. Confirm or reject every detection before generating a report.`
        );
      }

      try {
        const { report } = await reportsApi.generate(analysisId, {
          technologistNotes: analysis.technologistNotes,
          clinicalImpression: analysis.clinicalImpression
        });
        const full: LaboratoryReport = { ...report, laboratoryInfo: LAB_INFO };
        setReports(prev => [full, ...prev.filter(r => r.id !== full.id)]);
        setStorageIssue(null);
        return full;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          throw new ReportGateError(err.message);
        }
        handleError(err, 'Could not generate the report.');
        throw err;
      }
    },
    [analyses, handleError]
  );

  const verifyReport = useCallback(
    async (reportId: string) => {
      const report = reports.find(r => r.id === reportId);
      if (!report) throw new ReportGateError('Report not found.');
      if (report.status === 'verified') return;

      if (!currentUser) throw new ReportGateError('Sign in before verifying a report.');
      if (currentUser?.id === report.technologistId) {
        throw new ReportGateError(
          `${report.reportNumber} was prepared by ${report.technologistName}. A different authorised user must verify it.`
        );
      }

      try {
        const { report: verified } = await reportsApi.verify(reportId);
        setReports(prev =>
          prev.map(r => (r.id === reportId ? { ...verified, laboratoryInfo: LAB_INFO } : r))
        );
        setStorageIssue(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          throw new ReportGateError(err.message);
        }
        handleError(err, 'Could not verify the report.');
        throw err;
      }
    },
    [reports, currentUser, handleError]
  );

  const updateReport = useCallback(
    async (reportId: string, updates: { technologistNotes?: string; clinicalImpression?: string }) => {
      try {
        const { report } = await reportsApi.update(reportId, updates);
        setReports(prev => prev.map(existing => existing.id === reportId
          ? {
              ...existing,
              ...report,
              patient: existing.patient,
              sample: existing.sample,
              findings: existing.findings,
              laboratoryInfo: LAB_INFO
            }
          : existing));
        setStorageIssue(null);
      } catch (err) {
        handleError(err, 'Could not update the report.');
        throw err;
      }
    },
    [handleError]
  );

  const deleteReport = useCallback(
    async (reportId: string) => {
      try {
        await reportsApi.delete(reportId);
        setReports(prev => prev.filter(r => r.id !== reportId));
        setStorageIssue(null);
      } catch (err) {
        handleError(err, 'Could not delete the report.');
        throw err;
      }
    },
    [handleError]
  );

  const updateModelConfig = useCallback((modelId: string, updates: Partial<AIModelConfig>) => {
    setModels(prev => prev.map(m => (m.id === modelId ? { ...m, ...updates } : m)));
  }, []);

  const isSelf = useCallback(
    (technologistId: string) => currentUser?.id === technologistId,
    [currentUser]
  );

  const value = useMemo<LabStoreValue>(
    () => ({
      patients,
      samples,
      analyses,
      reports,
      models,
      auditLogs,
      user,
      authChecked,
      loading,
      connectionError,
      storageIssue,
      loadError,
      pendingIds,
      login,
      logout,
      changePassword,
      refresh,
      canVerifyReports: Boolean(user),
      isSelf,
      patientSearch,
      setPatientSearch,
      patientOffset,
      setPatientOffset,
      patientTotal,
updatePatient,
    deletePatient,
    deleteReport,
    updateReport,
    addPatient,
      addSample,
      createAndRunAnalysis,
      toggleDetectionConfirmation,
      rejectDetection,
      confirmAllDetections,
      addManualDetection,
      updateAnalysisNotes,
      updateModelConfig,
      generateReport,
      verifyReport
    }),
    [
      patients, samples, analyses, reports, models, auditLogs, user, authChecked, loading,
      connectionError, storageIssue, loadError, pendingIds, login, logout, changePassword,
      refresh, isSelf, patientSearch, setPatientSearch, patientOffset, setPatientOffset,
      patientTotal, updatePatient, deleteReport, updateReport, addPatient, addSample, createAndRunAnalysis,
      toggleDetectionConfirmation, rejectDetection, confirmAllDetections, addManualDetection,
      updateAnalysisNotes, updateModelConfig, generateReport, verifyReport
    ]
  );

  return <LabStoreContext.Provider value={value}>{children}</LabStoreContext.Provider>;
}

export function useLabStore(): LabStoreValue {
  const context = useContext(LabStoreContext);
  if (!context) {
    throw new Error('useLabStore must be used within a LabStoreProvider.');
  }
  return context;
}

const LAB_INFO = {
  name: LAB_METADATA.name,
  licenseNumber: LAB_METADATA.license,
  accreditation: LAB_METADATA.accreditation,
  address: LAB_METADATA.address,
  contact: LAB_METADATA.contact,
  director: LAB_METADATA.director
};

function hydrateAnalysis(
  row: Analysis & { startedAt?: string; completedAt?: string },
  patientId?: string,
  modelName?: string
): Analysis {
  return {
    ...row,
    patientId: patientId ?? row.patientId ?? '',
    modelId: row.modelId ?? 'server',
    modelName: row.modelName ?? modelName ?? 'Server-configured model',
    analyzedAt: row.analyzedAt ?? row.completedAt ?? row.startedAt ?? new Date().toISOString(),
    totalDetections: row.totalDetections ?? row.detections?.length ?? 0,
    technologistNotes: row.technologistNotes ?? '',
    clinicalImpression: row.clinicalImpression ?? ''
  };
}

function toAuditLog(entry: AuditEntry): AuditLog {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    userId: entry.actorId ?? 'system',
    userName: entry.actorName ?? 'System',
    action: entry.action,
    details: [entry.entity, entry.entityId, entry.details].filter(Boolean).join(' · ') || entry.action
  };
}
