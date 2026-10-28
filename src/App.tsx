/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useState, useEffect } from 'react';
import { useLabStore } from './store/labStore';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { PatientFormModal } from './components/patients/PatientFormModal';
import { PatientEditModal } from './components/patients/PatientEditModal';
import { LegalModal } from './components/legal/LegalModal';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import { Skeleton } from './components/ui/States';
import { Microscope } from 'lucide-react';
import type { LaboratoryReport, NewPatient, Patient, Sample } from './types';
import { ApiError, authApi, samplesApi } from './services/api';

/** Eager: the default view after sign-in. */
import { DashboardOverview } from './components/dashboard/DashboardOverview';

/** Lazy-loaded: only fetched when the operator navigates to that tab. */
const PatientListView = lazy(() => import('./components/patients/PatientListView').then(m => ({ default: m.PatientListView })));
const MicroscopyWorkspace = lazy(() => import('./components/microscopy/MicroscopyWorkspace').then(m => ({ default: m.MicroscopyWorkspace })));
const ReportsListView = lazy(() => import('./components/reports/ReportsListView').then(m => ({ default: m.ReportsListView })));
const AuditLogView = lazy(() => import('./components/admin/AuditLogView').then(m => ({ default: m.AuditLogView })));
const UsersAdminView = lazy(() => import('./components/admin/UsersAdminView').then(m => ({ default: m.UsersAdminView })));
const SavedScansView = lazy(() => import('./components/admin/SavedScansView').then(m => ({ default: m.SavedScansView })));

/** Lazy-loaded: only needed when an operator opens a report. */
const LaboratoryReportModal = lazy(() =>
  import('./components/reports/LaboratoryReportModal').then(m => ({ default: m.LaboratoryReportModal }))
);

/** Lazy-loaded: only rendered before sign-in. */
const LandingPage = lazy(() => import('./components/marketing/LandingPage').then(m => ({ default: m.LandingPage })));

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading laboratory overview...</span>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 sm:w-64" />
          <Skeleton className="h-3 w-56 sm:w-80" />
        </div>
        <Skeleton className="h-10 w-40 self-stretch sm:self-auto" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/** Lightweight placeholder shown while a lazy-loaded tab is being fetched. */
function TabSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading {label}…</span>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-10 w-full max-w-xs" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const {
    patients,
    samples,
    analyses,
    reports,
    models,
    user,
    authChecked,
    connectionError,
    storageIssue,
    loading,
    loadError,
    login,
    logout,
    addPatient,
    addSample,
    createAndRunAnalysis,
    toggleDetectionConfirmation,
    rejectDetection,
    confirmAllDetections,
    addManualDetection,
    updateAnalysisNotes,
    generateReport,
    verifyReport,
    updatePatient,
    deletePatient,
    updateReport,
    deleteReport
  } = useLabStore();

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'patients' | 'microscopy' | 'reports' | 'audit' | 'users' | 'scans'
  >('dashboard');

  const [microscopyBrowseFilter, setMicroscopyBrowseFilter] = useState<string | null>(null);
  const [reportsBrowseFilter, setReportsBrowseFilter] = useState<'all' | 'verified' | 'pending_verification'>('all');
  /** The patient awaiting archive, shown in an inline dialog instead of a
   *  browser confirm() so the action is keyboard-reachable and styled like the
   *  rest of the interface. */
  const [pendingDeletePatient, setPendingDeletePatient] = useState<Patient | null>(null);

  const switchTab = (tab: 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'audit' | 'users' | 'scans', filter?: string | null) => {
    setActiveTab(tab);
    setMicroscopyBrowseFilter(filter ?? null);
    setReportsBrowseFilter(
      tab === 'reports' && (filter === 'verified' || filter === 'pending_verification')
        ? filter
        : 'all'
    );
    setSelectedAnalysisId(null);
  };

  // Administrative tabs exist in state for both roles; a non-admin who lands
  // on one (stale state, back button) is redirected to the dashboard.
  const effectiveTab =
    (activeTab === 'audit' || activeTab === 'users' || activeTab === 'scans') && !user?.isAdmin
      ? 'dashboard'
      : activeTab;

  // Keep the URL hash in sync with the active tab so the current page is
  // reflected in the address bar (shareable, back/forward, refresh-safe).
  useEffect(() => {
    const tabToHash: Record<string, string> = {
      dashboard: '#dashboard',
      patients: '#patients',
      microscopy: '#microscopy',
      reports: '#reports',
      audit: '#audit',
      users: '#users',
      scans: '#scans'
    };
    const hash = tabToHash[effectiveTab];
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, [effectiveTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hashToTab: Record<string, 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'audit' | 'users' | 'scans'> = {
      '#dashboard': 'dashboard',
      '#patients': 'patients',
      '#microscopy': 'microscopy',
      '#reports': 'reports',
      '#audit': 'audit',
      '#users': 'users',
      '#scans': 'scans'
    };
    const handleHashChange = () => {
      const hash = window.location.hash;
      const tab = hashToTab[hash];
      if (tab) {
        setActiveTab(tab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [activeReportModal, setActiveReportModal] = useState<LaboratoryReport | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [pendingMicroscopy, setPendingMicroscopy] = useState<{
    patientId: string;
    sampleId: string;
    error: string;
    scanning: boolean;
  } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Legal & Privacy modal state
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy'>('terms');
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const handleOpenLegal = (tab: 'terms' | 'privacy') => {
    setLegalModalTab(tab);
    setIsLegalModalOpen(true);
  };

  // Quick action from patient table or dashboard
  const handleSelectPatientForAnalysis = async (patientId: string, sampleId?: string) => {
    // Scope to the requested specimen where one is supplied, so a patient with
    // multiple slides reopens the slide they actually clicked.
    const existingAna = analyses.find(
      a => a.patientId === patientId && (!sampleId || a.sampleId === sampleId)
    );
    if (existingAna) {
      setPendingMicroscopy(null);
      setSelectedAnalysisId(existingAna.id);
      setActiveTab('microscopy');
      return;
    }

    // Never fall back to samples[0]: that would run one patient's specimen
    // against another patient's record.
    const sample =
      samples.find(s => s.id === sampleId) || samples.find(s => s.patientId === patientId);

    if (!sample) {
      setPendingMicroscopy(null);
      setActiveTab('patients');
      return;
    }

    const defaultModel =
      models.find(m => m.category === sample.sampleType) || models[0];

    try {
      const newAna = await createAndRunAnalysis(patientId, sample.id, defaultModel.id);
      setPendingMicroscopy(null);
      setSelectedAnalysisId(newAna.id);
      setActiveTab('microscopy');
    } catch (err) {
      console.error(err);
      // Keep the selected patient visible when inference fails so the operator
      // can inspect the specimen, replace the image, or retry.
      setPendingMicroscopy({
        patientId,
        sampleId: sample.id,
        error: err instanceof Error ? err.message : 'Analysis could not be completed.',
        scanning: false
      });
      setSelectedAnalysisId(null);
      setActiveTab('microscopy');
    }
  };

  const handleCreatePatientAndSample = async (
    patientData: NewPatient,
    sampleData: Omit<Sample, 'id'> & { additionalSlides: { name: string; imageData: string }[] }
  ) => {
    const { additionalSlides, ...sampleRecord } = sampleData;
    let newPat: Patient;
    let newSmp: Sample;
    try {
      newPat = await addPatient(patientData);
      newSmp = await addSample({ ...sampleRecord, patientId: newPat.id });
    } catch (err) {
      console.error('Accession failed:', err);
      throw err;
    }

    setIsNewPatientModalOpen(false);

    const matchedModel = models.find(m => m.category === newSmp.sampleType) || models[0];

    const slideResults = await Promise.allSettled(
      additionalSlides.map(slide => samplesApi.addSlide(newSmp.id, slide))
    );
    const savedSlides: { id: string; name: string; imageData: string }[] = [];
    const slideErrors: string[] = [];
    slideResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        savedSlides.push(result.value.slide);
      } else {
        const slide = additionalSlides[index];
        slideErrors.push(`${slide.name}: ${result.reason instanceof Error ? result.reason.message : 'upload failed'}`);
      }
    });

    if (slideErrors.length > 0) {
      setSelectedAnalysisId(null);
      setPendingMicroscopy({
        patientId: newPat.id,
        sampleId: newSmp.id,
        error: `The specimen was saved, but some additional images were not saved: ${slideErrors.join('; ')}. Upload those images again before scanning.`,
        scanning: false
      });
      setActiveTab('microscopy');
      return;
    }

    setSelectedAnalysisId(null);
    setPendingMicroscopy({
      patientId: newPat.id,
      sampleId: newSmp.id,
      error: '',
      scanning: true
    });
    setActiveTab('microscopy');

    try {
      let newAna = await createAndRunAnalysis(
        newPat.id,
        newSmp.id,
        matchedModel.id,
        newSmp.imageUrl,
        'primary'
      );
      for (const slide of savedSlides) {
        newAna = await createAndRunAnalysis(
          newPat.id,
          newSmp.id,
          matchedModel.id,
          slide.imageData,
          slide.id
        );
      }
      setSelectedAnalysisId(newAna.id);
      setPendingMicroscopy(null);
    } catch (e) {
      console.error('Auto analysis launch error:', e);
      setPendingMicroscopy({
        patientId: newPat.id,
        sampleId: newSmp.id,
        error: e instanceof ApiError && e.status === 402
          ? ''
          : e instanceof Error ? e.message : String(e),
        scanning: false
      });
    }
  };

  const handleDeleteReport = async (report: LaboratoryReport) => {
    await deleteReport(report.id);
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
  };

  const handleDeletePatient = async (patient: Patient) => {
    setPendingDeletePatient(patient);
  };

  const confirmDeletePatient = async () => {
    const patient = pendingDeletePatient;
    setPendingDeletePatient(null);
    if (!patient) return;
    try {
      await deletePatient(patient.id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const cancelDeletePatient = () => {
    setPendingDeletePatient(null);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
            <Microscope className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-900 dark:text-white">LenziAI</div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">AI CLINICAL</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-cyan-600 animate-spin motion-reduce:animate-none" />
          <span>Restoring your session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // The store owns the session. The auth panel only collects credentials and
    // surfaces the failure; it must not call the API itself, or the cookie
    // would be set while the store stayed unauthenticated and the app would
    // bounce straight back to this screen.
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading LenziAI…</span>
          </div>
        }
      >
        <LandingPage onSubmit={login} onSignup={authApi.signup} />
      </Suspense>
    );
  }

    return (
    <div className="app-shell min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-cyan-100 dark:selection:bg-cyan-900/60 selection:text-cyan-900 dark:selection:text-cyan-200 antialiased transition-colors duration-200">
      {/* Top Application Header */}
      <Header
        activeTab={effectiveTab}
        onSelectTab={tab => switchTab(tab)}
        onOpenNewPatient={() => setIsNewPatientModalOpen(true)}
        onOpenLegal={handleOpenLegal}
        operatorName={user.name}
        operatorEmail={user.email}
        isAdmin={Boolean(user.isAdmin)}
        onLogout={() => void logout()}
        onChangePassword={() => setIsChangePasswordOpen(true)}
      />

      {/* Main Clinical Content Body. Shares the header's max width and gutter
          so the content edges line up with the nav instead of sitting inset. */}
      <main className="app-main no-print flex-1 max-w-[1440px] w-full mx-auto gutter-x py-5 sm:py-6 lg:py-8">
        {connectionError && (
          <div role="alert" className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-xs">
            <span className="font-bold">Server unavailable:</span>
            <span className="flex-1">{connectionError}</span>
          </div>
        )}

        {loadError && (
          <div role="alert" className="mb-4 flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 p-3 rounded-xl text-xs">
            <span className="font-bold">Could not load data:</span>
            <span className="flex-1">{loadError}</span>
          </div>
        )}

        {storageIssue && (
          <div role="alert" className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-300 text-rose-900 p-3 rounded-xl text-xs">
            <span className="font-bold">Not saved:</span>
            <span className="flex-1">{storageIssue}</span>
          </div>
        )}

        {effectiveTab === 'dashboard' && (
          <ErrorBoundary resetKey="dashboard">
            {loading ? (
              <DashboardSkeleton />
            ) : (
              <DashboardOverview
              patients={patients}
              analyses={analyses}
              reports={reports}
              samples={samples}
              onNavigateTab={(tab, filter) => switchTab(tab, filter)}
              onSelectAnalysis={anaId => {
                setSelectedAnalysisId(anaId);
                setMicroscopyBrowseFilter(null);
                setActiveTab('microscopy');
              }}
              onOpenReport={report => setActiveReportModal(report)}
              onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
            />
            )}
          </ErrorBoundary>
        )}

        {effectiveTab === 'patients' && (
          <ErrorBoundary resetKey="patients">
            <Suspense fallback={<TabSkeleton label="patient directory" />}>
              <PatientListView
                patients={patients}
                samples={samples}
                onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
                onSelectPatientForAnalysis={handleSelectPatientForAnalysis}
                onEditPatient={patient => handleEditPatient(patient)}
                onDeletePatient={(patient) => handleDeletePatient(patient)}
                canDeletePatients
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {effectiveTab === 'microscopy' && (
          <ErrorBoundary resetKey={`microscopy-${selectedAnalysisId ?? 'none'}`}>
            <Suspense fallback={<TabSkeleton label="microscopy optical stage" />}>
              <MicroscopyWorkspace
            patients={patients}
            samples={samples}
            analyses={analyses}
            models={models}
            currentAnalysisId={selectedAnalysisId}
            pendingPatientId={pendingMicroscopy?.patientId}
            pendingSampleId={pendingMicroscopy?.sampleId}
            pendingInferenceError={pendingMicroscopy?.error}
            pendingInferenceActive={pendingMicroscopy?.scanning ?? false}
            onRunAnalysis={async (patientId, sampleId, modelId, imageUrl, imageRef, scanToken) => {
              const analysis = await createAndRunAnalysis(patientId, sampleId, modelId, imageUrl, imageRef, scanToken);
              if (pendingMicroscopy?.sampleId === sampleId) setPendingMicroscopy(null);
              return analysis;
            }}
            onToggleConfirmDetection={toggleDetectionConfirmation}
            onRejectDetection={rejectDetection}
            onConfirmAllDetections={confirmAllDetections}
            onAddManualDetection={addManualDetection}
            onSaveAnalysisNotes={updateAnalysisNotes}
            onGenerateReport={generateReport}
            onOpenReportModal={report => setActiveReportModal(report)}
            onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
            onSwitchPatient={(patientId, sampleId) => {
              // Selecting an accession from the microscopy patient list must
              // move the operator into the selected patient's workspace even
              // when the current tab was opened from another workflow.
              setActiveTab('microscopy');
              setMicroscopyBrowseFilter(null);
              const existing = analyses.find(a => a.sampleId === sampleId);
              if (existing) {
                setPendingMicroscopy(null);
                setSelectedAnalysisId(existing.id);
              } else {
                setPendingMicroscopy({ patientId, sampleId, error: '', scanning: false });
                setSelectedAnalysisId(null);
              }
            }}
            onSelectAnalysis={setSelectedAnalysisId}
            browseFilter={microscopyBrowseFilter}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {effectiveTab === 'reports' && (
          <ErrorBoundary resetKey="reports">
            <Suspense fallback={<TabSkeleton label="reports" />}>
              <ReportsListView
                reports={reports}
                initialStatusFilter={reportsBrowseFilter}
                currentUserName={user.name}
                currentUserId={user.id}
                canManageReports
                canDeleteReports
                onOpenReport={report => setActiveReportModal(report)}
                onVerifyReport={verifyReport}
                onEditReport={updateReport}
                onDeleteReport={handleDeleteReport}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {effectiveTab === 'audit' && user.isAdmin && (
          <ErrorBoundary resetKey="audit">
            <Suspense fallback={<TabSkeleton label="audit log" />}>
              <AuditLogView />
            </Suspense>
          </ErrorBoundary>
        )}

        {effectiveTab === 'users' && user.isAdmin && (
          <ErrorBoundary resetKey="users">
            <Suspense fallback={<TabSkeleton label="user administration" />}>
              <UsersAdminView currentUserId={user.id} />
            </Suspense>
          </ErrorBoundary>
        )}

        {effectiveTab === 'scans' && user.isAdmin && (
          <ErrorBoundary resetKey="scans">
            <Suspense fallback={<TabSkeleton label="saved images" />}>
              <SavedScansView />
            </Suspense>
          </ErrorBoundary>
        )}

      </main>

      {/* High-Elegance Clinical Footer */}
      <Footer onOpenLegal={handleOpenLegal} />

      {/* Accession Patient Modal */}
      {isNewPatientModalOpen && (
        <PatientFormModal
          onClose={() => setIsNewPatientModalOpen(false)}
          onSubmit={handleCreatePatientAndSample}
        />
      )}

      {editingPatient && (
        <PatientEditModal
          patient={editingPatient}
          onClose={() => setEditingPatient(null)}
          onSubmit={async updates => {
            await updatePatient(editingPatient.id, updates);
            setEditingPatient(null);
          }}
        />
      )}

      {/* Printable Clinical Laboratory Diagnostic Report Modal */}
      {activeReportModal && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl">
                <span className="sr-only">Loading report…</span>
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-green-600 animate-spin" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading report…</span>
              </div>
            </div>
          }
        >
          <LaboratoryReportModal
            report={activeReportModal}
            onClose={() => setActiveReportModal(null)}
            onVerify={async reportId => {
              setVerifyError(null);
              try {
                await verifyReport(reportId);
                setActiveReportModal(prev => (prev ? { ...prev, status: 'verified' } : null));
              } catch (err) {
                setVerifyError(err instanceof Error ? err.message : String(err));
              }
            }}
            verifyError={verifyError}
          />
        </Suspense>
      )}

      {/* Regulatory, Terms & Privacy Modal */}
      {isLegalModalOpen && (
        <LegalModal
          initialTab={legalModalTab}
          onClose={() => setIsLegalModalOpen(false)}
        />
      )}

      {isChangePasswordOpen && (
        <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
      )}

      {pendingDeletePatient && (
        <ConfirmDialog
          open
          title="Archive patient record"
          description={
            <>
              Archive <strong className="text-slate-900 dark:text-slate-100">{pendingDeletePatient.fullName}</strong> (
              {pendingDeletePatient.patientNumber})? They will be hidden from active lists, with audit history retained.
            </>
          }
          confirmLabel="Archive"
          cancelLabel="Keep"
          onConfirm={confirmDeletePatient}
          onCancel={cancelDeletePatient}
        />
      )}
    </div>
  );
}
