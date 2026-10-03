import React, { useState } from 'react';
import { X, ShieldCheck, FileText, Lock, AlertTriangle, Scale } from 'lucide-react';
import { LAB_METADATA } from '../../lib/constants';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface LegalModalProps {
  initialTab?: 'terms' | 'privacy';
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ initialTab = 'terms', onClose }) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Regulatory, governance and privacy framework"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs my-auto transition-colors duration-200">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-700 dark:text-cyan-400">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Regulatory, Governance & Privacy Framework
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                CLIA / CAP / ISO 15189:2022 Diagnostic Decision Support & HIPAA PHI Protection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/50 px-5 sm:px-6 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`pb-2.5 px-3 font-semibold text-xs border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'terms'
                ? 'border-cyan-700 dark:border-cyan-400 text-cyan-800 dark:text-cyan-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service & Clinical Decision Support</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`pb-2.5 px-3 font-semibold text-xs border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'border-cyan-700 dark:border-cyan-400 text-cyan-800 dark:text-cyan-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Privacy Policy & HIPAA De-Identification</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
          {activeTab === 'terms' ? (
            /* TERMS & CLINICAL DECISION SUPPORT */
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3.5 rounded-xl flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-950 dark:text-amber-100">
                    MANDATORY CLINICAL DECISION SUPPORT (CDS) NOTICE
                  </h4>
                  <p className="text-[11px] text-amber-900 dark:text-amber-200 mt-0.5">
                    RenziAI provides algorithmic computer-vision assistance. Under FDA CDS guidance, CLIA regulations, and ISO 15189:2022 standards, this system is NOT a fully autonomous diagnostic device. All identified morphologic features, object bounding boxes, and quantitative estimates must be reviewed, corroborated, and signed off by a certified medical laboratory technologist or pathologist prior to clinical patient disclosure.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">1. Intended Purpose & Clinical Scope</h3>
                <p>
                  RenziAI is designed for laboratory medicine professionals to aid in the examination of biological fluids, stool wet mounts, stained peripheral blood films, and urinary sediments. The integrated Roboflow serverless vision engine executes object detection for preliminary candidate classification.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">2. Technologist Verification & Supervision</h3>
                <p>
                  The attending laboratory professional retains sole legal and medical responsibility for diagnostic assertions. By using this system, you warrant that:
                </p>
                <ul className="list-disc pl-5 mt-1.5 space-y-1 text-slate-600 dark:text-slate-400">
                  <li>You possess the requisite licensure, certification (e.g. MLS(ASCP), FRCPath, or equivalent), and credentialing for clinical microscopic reporting.</li>
                  <li>All false positives or misclassifications identified during automated inference are promptly edited or rejected in the Technologist Review console.</li>
                  <li>Critical values (e.g. <em>Plasmodium</em> parasitemia, invasive trophozoites) are verbally communicated to the ordering clinician in accordance with standard critical-callout protocols.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">3. Optical Calibration & Quality Control Lot Protocol</h3>
                <p>
                  Laboratories must maintain documented daily Quality Control (QC) lot verification for optical systems (calibrated micrometer grids, objective nosepiece alignment, and field diaphragm Kohler illumination) to maintain quantitative accuracy.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">4. Roboflow Serverless Workflow Utilization</h3>
                <p>
                  Image inferences are transmitted via authenticated REST calls to the specified Roboflow workspace (<code>laurent-kashinje/workflows/labsight-vlabsight-3-yolo26m-t1-logic</code>). Users are responsible for maintaining valid API credentials and monitoring inference latency and availability.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">5. Limitation of Liability</h3>
                <p>
                  To the maximum extent permitted by applicable health governance law, the developers and distributors of RenziAI disclaim liability for indirect, punitive, or consequential damages resulting from improper optical calibration, hardware failure, unverified automated releases, or off-label specimen usage.
                </p>
              </div>
            </div>
          ) : (
            /* PRIVACY POLICY & HIPAA COMPLIANCE */
            <div className="space-y-4">
              <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 p-3.5 rounded-xl flex items-start gap-2.5 text-cyan-950 dark:text-cyan-200">
                <ShieldCheck className="w-4 h-4 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-cyan-950 dark:text-cyan-100">
                    HIPAA PROTECTED HEALTH INFORMATION (PHI) COMMITMENT
                  </h4>
                  <p className="text-[11px] text-cyan-900 dark:text-cyan-200 mt-0.5">
                    RenziAI enforces strict cryptographic in-transit protections and client-side de-identification. Specimen photomicrographs transmitted to cloud inference endpoints contain zero direct 18 HIPAA identifiers.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">1. De-Identification at the Optical Edge</h3>
                <p>
                  When slides are analyzed via the Roboflow vision endpoint, only raw image pixels and temporary pseudonymous slide identifiers (e.g. <code>SLD-49201</code>) are processed. Patient names, Medical Record Numbers (MRNs), dates of birth, and clinician identifiers remain strictly isolated within local browser storage or secure institutional EHR/LIS databases.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">2. Data Processing & Model Training Disclosures</h3>
                <p>
                  In accordance with medical ethical standards:
                </p>
                <ul className="list-disc pl-5 mt-1.5 space-y-1 text-slate-600 dark:text-slate-400">
                  <li><strong>Provider retention is outside this app's control:</strong> Specimen images are sent to the configured Roboflow endpoint. What that provider retains, and whether images contribute to training, is governed by the account holder's agreement with Roboflow, not by this application. Verify before sending any real specimen.</li>
                  <li><strong>Encrypted Transport:</strong> All data in transit uses TLS 1.3 cipher suites.</li>
                  <li><strong>Institutional Privacy:</strong> API credentials are stored locally in the authenticated workstation browser session and are never hardcoded in the application source.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">3. Comprehensive Audit Trail & Chain of Custody</h3>
                <p>
                  This build records the following events locally in the browser:
                </p>
                <ul className="list-disc pl-5 mt-1.5 space-y-1 text-slate-600 dark:text-slate-400">
                  <li>Specimen accession and barcode creation</li>
                  <li>Automated Roboflow inference execution and returned raw detection count</li>
                  <li>Manual technologist edits, additions, and false-positive rejections</li>
                  <li>Pathologist electronic signature and report verification timestamps</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">4. Data Retention & Electronic Health Record (EHR) Export</h3>
                <p>
                  Reports and findings can be exported as an HL7 FHIR R4 <code>DiagnosticReport</code> bundle, or as a
                  DICOM VL Whole Slide Microscopy attribute preview. The DICOM export is metadata only and is not a
                  conformant Part 10 file; it cannot be imported into a PACS without pixel data and a proper
                  file-meta header.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">5. Where the Record Is Kept</h3>
                <p>
                  Patient records are held in the RenziAI server's database, not in your browser.
                  Access requires an individual account, and every action is written to an
                  append-only audit trail whose integrity can be verified. Signing out ends your
                  session on this device.
                </p>
                <p className="mt-1.5">
                  Erasing data is a server-side operation performed by a Lab Director under the
                  laboratory's own retention and records-management policy. Contact the laboratory
                  director; it is not available from this screen.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">6. Contact & Data Protection Officer</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Data Protection Officer · {LAB_METADATA.name} Institute of Pathology<br />
                  Email: privacy@renziai.com · Legal: legal@renziai.com · Phone: {LAB_METADATA.contact}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            Document Version 2026.4
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
