import React, { useState } from 'react';
import { NewPatient, Sample, SampleType, MicroscopeObjective, EyepieceMagnification } from '../../types';
import { SLIDE_ASSETS } from '../../lib/constants';
import { fileToDataUrl } from '../../services/roboflow';
import { X, Upload, Microscope, UserPlus } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface PatientFormModalProps {
  onClose: () => void;
  onSubmit: (patient: NewPatient, sample: Omit<Sample, 'id'>) => void;
}

export const PatientFormModal: React.FC<PatientFormModalProps> = ({ onClose, onSubmit }) => {
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [patientNumber, setPatientNumber] = useState(
    `PT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
  );
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<number>(30);
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [referringDoctor, setReferringDoctor] = useState('Dr. L. K. Laurent, MD');
  const [referringFacility, setReferringFacility] = useState('Regional Medical Center - OPD');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [sampleType, setSampleType] = useState<SampleType>('stool');
  const [collectionDate, setCollectionDate] = useState(() => {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
  });
  const [collectionTime, setCollectionTime] = useState('08:30');
  const [objective, setObjective] = useState<MicroscopeObjective>('40x');
  const [eyepiece, setEyepiece] = useState<EyepieceMagnification>('10x');
  const [fieldsExamined, setFieldsExamined] = useState<number>(10);
  const [stainMethod, setStainMethod] = useState("Lugol's Iodine Stain");
  const [slideLabel, setSlideLabel] = useState(`SLD-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedPresetImage, setSelectedPresetImage] = useState<string>(SLIDE_ASSETS.stool);
  const [customImage, setCustomImage] = useState<string | null>(null);

  // Auto-tune default stain and preset image when sample type changes
  const handleSampleTypeChange = (type: SampleType) => {
    setSampleType(type);
    if (type === 'stool') {
      setStainMethod("Lugol's Iodine Wet Mount");
      setObjective('40x');
      setSelectedPresetImage(SLIDE_ASSETS.stool);
    } else if (type === 'blood') {
      setStainMethod("Giemsa Thin Blood Film");
      setObjective('100x_oil');
      setSelectedPresetImage(SLIDE_ASSETS.blood);
    } else if (type === 'urine') {
      setStainMethod("Unstained Centrifuged Sediment");
      setObjective('40x');
      setSelectedPresetImage(SLIDE_ASSETS.urine);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setCustomImage(dataUrl);
    } catch (err) {
      console.error("Failed reading file", err);
    }
  };

  // Local wall-clock time, not UTC. Appending a 'Z' to a value the operator
  // typed as local time shifted every specimen by their UTC offset.
  const toLocalIso = (date: string, time: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if ([y, m, d, hh, mm].some(n => Number.isNaN(n))) return new Date().toISOString();
    return new Date(y, m - 1, d, hh, mm).toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!fullName.trim()) return;
    if (submitting) return;

    const totalMag = objective === '100x_oil' ? '1000x' : objective === '40x' ? '400x' : '100x';
    const activeImage = customImage || selectedPresetImage;

    const patientData: NewPatient = {
      patientNumber,
      fullName: fullName.trim(),
      age: Number(age),
      gender,
      referringDoctor,
      referringFacility,
      clinicalNotes
    };

    const sampleData: Omit<Sample, 'id'> = {
      patientId: '',
      sampleType,
      collectionDatetime: toLocalIso(collectionDate, collectionTime),
      objective,
      eyepiece,
      totalMagnification: totalMag,
      fieldsExamined: Number(fieldsExamined),
      fieldAreaMm2: objective === '40x' ? 0.159 : objective === '100x_oil' ? 0.025 : 2.54,
      imageUrl: activeImage,
      stainMethod,
      slideLabel,
      notes: clinicalNotes
    };

    setSubmitting(true);
    try {
      await onSubmit(patientData, sampleData);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Accession new patient specimen"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs my-auto">
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-cyan-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Accession New Patient & Microscope Specimen
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Section 1: Patient Demographics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              1. Patient Demographics & Clinical Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Patient ID / MRN</label>
                <input
                  type="text"
                  required
                  value={patientNumber}
                  onChange={e => setPatientNumber(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-medium mb-1">Full Patient Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amina Makena"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Age (Years)</label>
                <input
                  type="number"
                  min={0}
                  max={125}
                  value={age}
                  onChange={e => setAge(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value as any)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Referring Physician</label>
                <input
                  type="text"
                  value={referringDoctor}
                  onChange={e => setReferringDoctor(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Referring Facility</label>
                <input
                  type="text"
                  value={referringFacility}
                  onChange={e => setReferringFacility(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Collection Date</label>
                <input
                  type="date"
                  value={collectionDate}
                  onChange={e => setCollectionDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Collection Time</label>
                <input
                  type="time"
                  value={collectionTime}
                  onChange={e => setCollectionTime(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-slate-700 font-medium mb-1">
                Clinical Indication / Symptoms
              </label>
              <input
                type="text"
                placeholder="e.g. Diarrhea for 1 week, abdominal cramps, travel history"
                value={clinicalNotes}
                onChange={e => setClinicalNotes(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Section 2: Specimen & Microscopy Collection */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              2. Specimen & Optical Microscopy Configuration
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Specimen Type</label>
                <select
                  value={sampleType}
                  onChange={e => handleSampleTypeChange(e.target.value as SampleType)}
                  className="w-full p-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="stool">Stool Microscopy</option>
                  <option value="blood">Peripheral Blood Film</option>
                  <option value="urine">Urine Sediment</option>
                  <option value="csf">CSF / Fluid</option>
                  <option value="other">Other Specimen</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Objective Lens</label>
                <select
                  value={objective}
                  onChange={e => setObjective(e.target.value as MicroscopeObjective)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="10x">10x (Low Power)</option>
                  <option value="40x">40x (High Dry)</option>
                  <option value="100x_oil">100x (Oil Immersion)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Stain / Prep</label>
                <input
                  type="text"
                  value={stainMethod}
                  onChange={e => setStainMethod(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Eyepiece / Ocular</label>
                <select
                  value={eyepiece}
                  onChange={e => setEyepiece(e.target.value as EyepieceMagnification)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="10x">10x</option>
                  <option value="15x">15x</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Fields Examined</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={fieldsExamined}
                  onChange={e => setFieldsExamined(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Slide Label</label>
                <input
                  type="text"
                  value={slideLabel}
                  onChange={e => setSlideLabel(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Microscope Slide Image Source */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              3. Microscope Photomicrograph Slide Image
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Reference Slides */}
              <div className="space-y-2">
                <span className="text-[11px] text-slate-600 block">
                  Select Calibrated Clinical Reference Slide:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'stool', src: SLIDE_ASSETS.stool, alt: 'Stool wet mount slide', label: 'Stool / Giardia' },
                    { key: 'blood', src: SLIDE_ASSETS.blood, alt: 'Giemsa-stained blood film', label: 'Blood Smear' },
                    { key: 'urine', src: SLIDE_ASSETS.urine, alt: 'Urine sediment slide', label: 'Urine Sediment' }
                  ] as const).map(slide => {
                    const isActive = !customImage && selectedPresetImage === slide.src;
                    return (
                      <button
                        key={slide.key}
                        type="button"
                        onClick={() => {
                          setSelectedPresetImage(slide.src);
                          setCustomImage(null);
                          handleSampleTypeChange(slide.key);
                        }}
                        aria-pressed={isActive}
                        className={`relative rounded-lg overflow-hidden border-2 h-20 group focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          isActive
                            ? 'border-cyan-600 ring-2 ring-cyan-200'
                            : 'border-slate-200 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={slide.src}
                          alt={slide.alt}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[10px] text-white p-1 text-center truncate">
                          {slide.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Upload Custom Camera / Microscope File */}
              <div>
                <span className="text-[11px] text-slate-600 block mb-2">
                  Or Upload Specimen Photo:
                </span>
                <label className="border-2 border-dashed border-slate-300 hover:border-cyan-500 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer transition h-20 bg-slate-50 hover:bg-cyan-50/30">
                  <Upload className="w-4 h-4 text-slate-400 mb-1" />
                  <span className="text-[11px] text-slate-600 font-medium">
                    {customImage ? 'Custom Image Loaded' : 'Upload Microscope Image'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            {submitError && (
              <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {submitError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold flex items-center gap-2 shadow-sm transition"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Launching…</span>
                  </>
                ) : (
                  <>
                    <Microscope className="w-4 h-4" />
                    <span>Save &amp; Launch AI Microscopy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
