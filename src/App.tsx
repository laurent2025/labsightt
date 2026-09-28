/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useLabStore } from './store/labStore';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { PatientListView } from './components/patients/PatientListView';
import { PatientFormModal } from './components/patients/PatientFormModal';
import { MicroscopyWorkspace } from './components/microscopy/MicroscopyWorkspace';
import { ReportsListView } from './components/reports/ReportsListView';
import { LaboratoryReportModal } from './components/reports/LaboratoryReportModal';
import { AIModelsView } from './components/models/AIModelsView';
import { AuditLogView } from './components/audit/AuditLogView';
import { LegalModal } from './components/legal/LegalModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/auth/LoginScreen';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import { Skeleton } from './components/ui/States';

/** Matches the dashboard's layout so content does not jump when it arrives. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading laboratory overview...</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
import { LaboratoryReport, NewPatient, Patient, Sample } from './types';

export default function App() {
  const {
    patients,
    samples,
    analyses,
    reports,
    models,
    auditLogs,
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
    updateModelConfig,
    generateReport,
    verifyReport
  } = useLabStore();

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'patients' | 'microscopy' | 'reports' | 'models' | 'audit'
  >('dashboard');

  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [activeReportModal, setActiveReportModal] = useState<LaboratoryReport | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
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
      setSelectedAnalysisId(existingAna.id);
      setActiveTab('microscopy');
      return;
    }

    // Never fall back to samples[0]: that would run one patient's specimen
    // against another patient's record.
    const sample =
      samples.find(s => s.id === sampleId) || samples.find(s => s.patientId === patientId);

    if (!sample) {
      setActiveTab('patients');
      return;
    }

    const defaultModel =
      models.find(m => m.category === sample.sampleType) || models[0];

    try {
      const newAna = await createAndRunAnalysis(patientId, sample.id, defaultModel.id);
      setSelectedAnalysisId(newAna.id);
      setActiveTab('microscopy');
    } catch (err) {
      console.error(err);
      setActiveTab('microscopy');
    }
  };

  const handleCreatePatientAndSample = async (
    patientData: NewPatient,
    sampleData: Omit<Sample, 'id'>
  ) => {
    let newPat: Patient;
    let newSmp: Sample;
    try {
      newPat = await addPatient(patientData);
      newSmp = await addSample({ ...sampleData, patientId: newPat.id });
    } catch (err) {
      // The store has already surfaced the reason; keep the modal open so the
      // operator can correct the input rather than losing what they typed.
      console.error('Accession failed:', err);
      return;
    }

    setIsNewPatientModalOpen(false);

    const matchedModel = models.find(m => m.category === newSmp.sampleType) || models[0];

    try {
      const newAna = await createAndRunAnalysis(newPat.id, newSmp.id, matchedModel.id);
      setSelectedAnalysisId(newAna.id);
      setActiveTab('microscopy');
    } catch (e) {
      console.error('Auto analysis launch error:', e);
      setActiveTab('microscopy');
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Restoring session...</p>
      </div>
    );
  }

  if (!user) {
    // The store owns the session. LoginScreen only collects credentials and
    // surfaces the failure; it must not call the API itself, or the cookie
    // would be set while the store stayed unauthenticated and the app would
    // bounce straight back to this screen.
    return <LoginScreen onSubmit={login} />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-cyan-100 dark:selection:bg-cyan-900/60 selection:text-cyan-900 dark:selection:text-cyan-200 antialiased transition-colors duration-200">
      {/* Top Application Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewPatient={() => setIsNewPatientModalOpen(true)}
        onOpenLegal={handleOpenLegal}
        operatorName={user.name}
        operatorRole={user.role}
        onLogout={() => void logout()}
        onChangePassword={() => setIsChangePasswordOpen(true)}
      />

      {/* Main Clinical Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {connectionError && (
          <div role="alert" className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-xs">
            <span className="font-bold">Server unavailable:</span>
            <span className="flex-1">{connectionError}</span>
          </div>
        )}

        {loadError && (
          <div role="alert" className="mb-4 flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 p-3 rounded-xl text-xs">
            <span className="font-bold">Could not load:</span>
            <span className="flex-1">{loadError}</span>
          </div>
        )}

        {storageIssue && (
          <div role="alert" className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-300 text-rose-900 p-3 rounded-xl text-xs">
            <span className="font-bold">Not saved:</span>
            <span className="flex-1">{storageIssue}</span>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <ErrorBoundary resetKey="dashboard">
            {loading ? (
              <DashboardSkeleton />
            ) : (
              <DashboardOverview
              patients={patients}
              analyses={analyses}
              reports={reports}
              samples={samples}
              onNavigateTab={tab => setActiveTab(tab)}
              onSelectAnalysis={anaId => {
                setSelectedAnalysisId(anaId);
                setActiveTab('microscopy');
              }}
              onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
            />
            )}
          </ErrorBoundary>
        )}

        {activeTab === 'patients' && (
          <PatientListView
            patients={patients}
            samples={samples}
            onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
            onSelectPatientForAnalysis={handleSelectPatientForAnalysis}
          />
        )}

        {activeTab === 'microscopy' && (
          <ErrorBoundary resetKey={`microscopy-${selectedAnalysisId ?? 'none'}`}>
            <MicroscopyWorkspace
            patients={patients}
            samples={samples}
            analyses={analyses}
            models={models}
            currentAnalysisId={selectedAnalysisId}
            onRunAnalysis={createAndRunAnalysis}
            onToggleConfirmDetection={toggleDetectionConfirmation}
            onRejectDetection={rejectDetection}
            onConfirmAllDetections={confirmAllDetections}
            onAddManualDetection={addManualDetection}
            onSaveAnalysisNotes={updateAnalysisNotes}
            onGenerateReport={generateReport}
            onOpenReportModal={report => setActiveReportModal(report)}
            onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'reports' && (
          <ReportsListView
            reports={reports}
            currentUserName={user.name}
            onOpenReport={report => setActiveReportModal(report)}
            onVerifyReport={verifyReport}
          />
        )}

        {activeTab === 'models' && (
          <AIModelsView
            models={models}
            onUpdateModel={updateModelConfig}
          />
        )}

        {activeTab === 'audit' && <AuditLogView logs={auditLogs} />}
      </main>

      {/* High-Elegance Clinical Footer */}
      <Footer onOpenLegal={handleOpenLegal} onSelectTab={setActiveTab} />

      {/* Accession Patient Modal */}
      {isNewPatientModalOpen && (
        <PatientFormModal
          onClose={() => setIsNewPatientModalOpen(false)}
          onSubmit={handleCreatePatientAndSample}
        />
      )}

      {/* Printable Clinical Laboratory Diagnostic Report Modal */}
      {activeReportModal && (
        <LaboratoryReportModal
          report={activeReportModal}
          onClose={() => setActiveReportModal(null)}
          onVerify={reportId => {
            setVerifyError(null);
            try {
              verifyReport(reportId);
              setActiveReportModal(prev => (prev ? { ...prev, status: 'verified' } : null));
            } catch (err) {
              setVerifyError(err instanceof Error ? err.message : String(err));
            }
          }}
          verifyError={verifyError}
        />
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
    </div>
  );
}
