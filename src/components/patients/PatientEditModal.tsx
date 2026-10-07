import React, { useState } from 'react';
import { Patient } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Save, X } from 'lucide-react';

type PatientUpdates = Pick<
  Patient,
  'patientNumber' | 'fullName' | 'age' | 'gender' | 'referringDoctor' | 'referringFacility' | 'clinicalNotes'
>;

interface PatientEditModalProps {
  patient: Patient;
  onClose: () => void;
  onSubmit: (updates: PatientUpdates) => Promise<void>;
}

export const PatientEditModal: React.FC<PatientEditModalProps> = ({ patient, onClose, onSubmit }) => {
  const panelRef = useFocusTrap<HTMLFormElement>(true, onClose);
  const [patientNumber, setPatientNumber] = useState(patient.patientNumber);
  const [fullName, setFullName] = useState(patient.fullName);
  const [age, setAge] = useState(String(patient.age));
  const [gender, setGender] = useState<Patient['gender']>(patient.gender);
  const [referringDoctor, setReferringDoctor] = useState(patient.referringDoctor || '');
  const [referringFacility, setReferringFacility] = useState(patient.referringFacility || '');
  const [clinicalNotes, setClinicalNotes] = useState(patient.clinicalNotes || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAge = Number(age);
    if (!patientNumber.trim() || !fullName.trim()) {
      setError('Please provide both the patient ID / MRN and the full patient name.');
      return;
    }
    if (!Number.isInteger(numericAge) || numericAge < 0 || numericAge > 130) {
      setError('Please enter a valid age between 0 and 130.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        patientNumber: patientNumber.trim(),
        fullName: fullName.trim(),
        age: numericAge,
        gender,
        referringDoctor: referringDoctor.trim(),
        referringFacility: referringFacility.trim(),
        clinicalNotes: clinicalNotes.trim()
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the patient record. Please try again or contact support if the problem continues.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
      <form
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-patient-title"
        onSubmit={handleSubmit}
        className="clinical-form my-auto w-full max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-patient-title" className="text-base font-semibold text-slate-900 dark:text-white">Edit patient</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Update demographics and referral details for {patient.patientNumber}.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close edit patient" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Patient ID / MRN
            <input value={patientNumber} onChange={event => setPatientNumber(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Full name
            <input value={fullName} onChange={event => setFullName(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Age
            <input type="number" min="0" max="130" step="1" value={age} onChange={event => setAge(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Gender
            <select value={gender} onChange={event => setGender(event.target.value as Patient['gender'])} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600">
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Referring doctor
            <input value={referringDoctor} onChange={event => setReferringDoctor(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Referring facility
            <input value={referringFacility} onChange={event => setReferringFacility(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100 sm:col-span-2">
            Clinical notes
            <textarea value={clinicalNotes} onChange={event => setClinicalNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950" />
          </label>
        </div>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm font-medium text-rose-800">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50 dark:border-slate-600">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save patient'}
          </button>
        </div>
      </form>
    </div>
  );
};