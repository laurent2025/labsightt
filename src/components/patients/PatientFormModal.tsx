import React, { useState } from 'react';
import { NewPatient, Sample, SampleType, MicroscopeObjective, EyepieceMagnification } from '../../types';
import { SLIDE_ASSETS } from '../../lib/constants';
import { fileToDataUrl } from '../../services/roboflow';
import { X, Upload, Microscope, UserPlus, Camera, Video, RotateCcw } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMicroscopeCamera } from '../../hooks/useMicroscopeCamera';

interface PatientFormModalProps {
  onClose: () => void;
  onSubmit: (
    patient: NewPatient,
    sample: Omit<Sample, 'id'> & { additionalSlides: { name: string; imageData: string }[] }
  ) => void | Promise<void>;
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
  const [referringDoctor, setReferringDoctor] = useState('');
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

  // Camera capture from microscope (shared hook)
  const camera = useMicroscopeCamera();
  const [uploadedImages, setUploadedImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);

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
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      const images = await Promise.all(
        files.map(async file => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: await fileToDataUrl(file)
        }))
      );
      setUploadedImages(prev => [...prev, ...images]);
      setCustomImage(images[0].dataUrl);
    } catch (err) {
      console.error("Failed reading file", err);
      setSubmitError('Failed to read one or more images.');
    }
  };

  const selectImage = (dataUrl: string) => {
    setCustomImage(dataUrl);
  };

  const removeImage = (id: string) => {
    setUploadedImages(prev => prev.filter(i => i.id !== id));
  };

  // Camera capture from the connected microscope (shared hook).
  const switchCamera = () => {
    if (camera.devices.length < 2) return;
    const current = camera.devices.findIndex(d => d.deviceId === camera.deviceId);
    const next = camera.devices[(current + 1) % camera.devices.length];
    camera.switchDevice(next.deviceId);
  };

  const captureFrame = () => {
    const dataUrl = camera.capture();
    if (!dataUrl) return;
    camera.close();
    setCustomImage(dataUrl);
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

    const sampleData: Omit<Sample, 'id'> & { additionalSlides: { name: string; imageData: string }[] } = {
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
      notes: clinicalNotes,
      additionalSlides: uploadedImages
        .filter(image => image.dataUrl !== activeImage)
        .map(image => ({ name: image.name, imageData: image.dataUrl }))
    };

    setSubmitting(true);
    try {
      await onSubmit(patientData, sampleData);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save the patient and specimen. Please check the details and try again.');
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
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-sm my-auto">
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-cyan-700" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Accession New Patient & Microscope Specimen
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="clinical-form p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Section 1: Patient Demographics */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-3">
              1. Patient Demographics & Clinical Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Patient ID / MRN</label>
                <input
                  type="text"
                  required
                  value={patientNumber}
                  onChange={e => setPatientNumber(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg font-mono text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Full Patient Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amina Makena"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Age (Years)</label>
                <input
                  type="number"
                  min={0}
                  max={125}
                  value={age}
                  onChange={e => setAge(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Gender</label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value as any)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Referring Physician</label>
                <input
                  type="text"
                  value={referringDoctor}
                  onChange={e => setReferringDoctor(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Referring Facility</label>
                <input
                  type="text"
                  value={referringFacility}
                  onChange={e => setReferringFacility(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Collection Date</label>
                <input
                  type="date"
                  value={collectionDate}
                  onChange={e => setCollectionDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg font-mono text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Collection Time</label>
                <input
                  type="time"
                  value={collectionTime}
                  onChange={e => setCollectionTime(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg font-mono text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">
                Clinical Indication / Symptoms
              </label>
              <input
                type="text"
                placeholder="e.g. Diarrhea for 1 week, abdominal cramps, travel history"
                value={clinicalNotes}
                onChange={e => setClinicalNotes(e.target.value)}
                className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Section 2: Specimen & Microscopy Collection */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-3">
              2. Specimen & Optical Microscopy Configuration
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Specimen Type</label>
                <select
                  value={sampleType}
                  onChange={e => handleSampleTypeChange(e.target.value as SampleType)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-semibold text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="stool">Stool Microscopy</option>
                  <option value="blood">Peripheral Blood Film</option>
                  <option value="urine">Urine Sediment</option>
                  <option value="csf">CSF / Fluid</option>
                  <option value="other">Other Specimen</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Objective Lens</label>
                <select
                  value={objective}
                  onChange={e => setObjective(e.target.value as MicroscopeObjective)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="10x">10x (Low Power)</option>
                  <option value="40x">40x (High Dry)</option>
                  <option value="100x_oil">100x (Oil Immersion)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Stain / Prep</label>
                <input
                  type="text"
                  value={stainMethod}
                  onChange={e => setStainMethod(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Eyepiece / Ocular</label>
                <select
                  value={eyepiece}
                  onChange={e => setEyepiece(e.target.value as EyepieceMagnification)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="10x">10x</option>
                  <option value="15x">15x</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Fields Examined</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={fieldsExamined}
                  onChange={e => setFieldsExamined(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg font-mono text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Slide Label</label>
                <input
                  type="text"
                  value={slideLabel}
                  onChange={e => setSlideLabel(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-white rounded-lg font-mono text-sm font-medium text-slate-900 dark:text-white dark:border-slate-600 dark:bg-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Microscope Slide Image Source */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-2">
              3. Microscope Photomicrograph Slide Image
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Reference Slides */}
              <div className="space-y-2">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">
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
                          setUploadedImages([]);
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
                        <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[11px] text-white p-1 text-center truncate">
                          {slide.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Upload Custom Camera / Microscope File */}
              <div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block mb-2">
                  Or Upload Specimen Photo:
                </span>
                <label className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-cyan-500 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer transition h-20 bg-slate-50 dark:bg-slate-950 hover:bg-cyan-50/30 dark:hover:bg-cyan-950/30">
                  <Upload className="w-4 h-4 text-slate-400 mb-1" />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {customImage ? 'Custom Image Loaded' : 'Upload Microscope Image'}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    one or more photos — pick the active one below
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {uploadedImages.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 overflow-x-auto no-scrollbar">
                    {uploadedImages.map((img, index) => {
                      const isActive = customImage === img.dataUrl;
                      return (
                        <div key={img.id} className="shrink-0">
                          <button
                            type="button"
                            onClick={() => selectImage(img.dataUrl)}
                            title={`Use ${img.name}`}
                            className={`block w-14 h-10 overflow-hidden rounded border-2 transition cursor-pointer ${
                              isActive
                                ? 'border-cyan-600 ring-2 ring-cyan-200'
                                : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
                            }`}
                          >
                            <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                          </button>
                          <div className="relative w-14 mt-0.5">
                            <span className="block text-[9px] text-slate-500 dark:text-slate-400 text-center truncate">
                              {index + 1}. {img.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeImage(img.id)}
                              aria-label={`Remove ${img.name}`}
                              className="absolute top-0 right-0 w-3.5 h-3.5 bg-slate-700 hover:bg-red-600 text-white rounded-full flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Capture from Microscope Camera */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void camera.openCamera()}
                  className="w-full border-2 border-emerald-300 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 dark:border-emerald-700 dark:hover:border-emerald-600 text-emerald-700 dark:text-emerald-300 rounded-lg p-3 flex items-center justify-center gap-2 font-semibold text-sm cursor-pointer transition"
                >
                  <Camera className="w-5 h-5" />
                  <span>Capture from Microscope Camera</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            {submitError && (
              <div role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {submitError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-bold text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 disabled:bg-slate-600 dark:disabled:bg-cyan-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition"
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

      {/* Camera Capture Modal */}
      {camera.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-slate-100">Microscope Camera Capture</span>
                <span className="text-[11px] px-2 py-0.5 bg-emerald-900/50 text-emerald-300 rounded font-mono">
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={switchCamera}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition cursor-pointer"
                  title="Switch camera"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="ml-1 hidden sm:inline">Switch</span>
                </button>
                <button
                  type="button"
                  onClick={camera.close}
                  className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition cursor-pointer"
                  aria-label="Close camera"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {camera.devices.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/40 flex items-center gap-2 text-xs">
                <span className="text-slate-400 shrink-0">Camera source:</span>
                <select
                  value={camera.deviceId}
                  onChange={event => camera.switchDevice(event.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600 cursor-pointer"
                >
                  {camera.devices.map(d => (
                    <option key={d.deviceId || d.groupId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId ? d.deviceId.slice(0, 8) : '(requesting access)'}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {camera.error ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-slate-300">{camera.error}</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void camera.openCamera()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={camera.close}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : camera.starting ? (
              <div className="p-10 text-center text-sm text-slate-400">Opening camera…</div>
            ) : (
            <div className="relative bg-black p-2">
              <video
                ref={camera.videoRef}
                autoPlay
                playsInline
                onLoadedMetadata={() => {
                  const video = camera.videoRef.current;
                  if (video) {
                    const res = document.getElementById('cameraResolution');
                    if (res) res.textContent = `${video.videoWidth} x ${video.videoHeight}`;
                  }
                }}
                className="w-full aspect-video object-contain bg-black"
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-lg text-xs text-slate-300 font-mono">
                  <span>Resolution:</span>
                  <span id="cameraResolution">-- x --</span>
                </div>
                <button
                  type="button"
                  onClick={captureFrame}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-lg transition cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>Capture Frame</span>
                </button>
              </div>
            </div>
            )}
            <div className="p-3 border-t border-slate-700 bg-slate-800/50 text-xs text-slate-400 text-center">
              Position the specimen in the field of view, then click <strong>Capture Frame</strong> to save the image.
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
