import React, { useState } from 'react';
import { Patient, Sample, SampleType } from '../../types';
import { Search, UserPlus, Microscope, Filter, X, Pencil, Trash2 } from 'lucide-react';
import { useLabStore } from '../../store/labStore';
import { useDebounced } from '../../hooks/useDebounced';
import { TableSkeleton, EmptyState, NoResultsState, ErrorState, Pagination } from '../ui/States';

interface PatientListViewProps {
  patients: Patient[];
  samples: Sample[];
  onOpenNewPatientModal: () => void;
  onSelectPatientForAnalysis: (patientId: string, sampleId?: string) => void;
  onEditPatient: (patient: Patient, sample: Sample | undefined) => void;
  onDeletePatient: (patient: Patient) => void;
  canDeletePatients: boolean;
}

export const PatientListView: React.FC<PatientListViewProps> = ({
  patients,
  samples,
  onOpenNewPatientModal,
  onSelectPatientForAnalysis,
  onEditPatient,
  onDeletePatient,
  canDeletePatients
}) => {
  const [sampleFilter, setSampleFilter] = useState<string>('all');
  const {
    patientSearch,
    setPatientSearch,
    patientOffset,
    setPatientOffset,
    patientTotal,
    loading,
    loadError,
    refresh
  } = useLabStore();

  // The query runs on the server; this only throttles how often we ask for it.
  const [searchInput, setSearchInput] = useState(patientSearch);
  const debouncedSearch = useDebounced(searchInput, 300);

  React.useEffect(() => {
    if (debouncedSearch !== patientSearch) setPatientSearch(debouncedSearch);
  }, [debouncedSearch, patientSearch, setPatientSearch]);

  // The specimen filter is a property of the loaded page, not of the whole
  // result set, so it stays local rather than becoming a server round trip.
  // A patient matches if any of their specimens is of the selected type.
  const filteredPatients = patients.filter(
    p => sampleFilter === 'all' || (p.sampleTypes || []).includes(sampleFilter as SampleType)
  );

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Patient & Specimen Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Accession records held by the laboratory server
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewPatientModal}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-green-600 dark:hover:bg-green-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition whitespace-nowrap self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Accession New Patient</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="search"
            aria-label="Search patients by number or full name"
            placeholder="Patient number, or exact full name..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-950 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-2 top-2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs overflow-x-auto">
            {['all', 'stool', 'blood', 'urine'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setSampleFilter(t)}
                aria-pressed={sampleFilter === t}
                className={`px-3 py-1 rounded-md capitalize font-medium transition whitespace-nowrap ${
                  sampleFilter === t
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Patient Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => void refresh()} />
        ) : filteredPatients.length === 0 ? (
          patientSearch ? (
            <NoResultsState term={patientSearch} onClear={() => setSearchInput('')} />
          ) : (
            <EmptyState
              title="No patients accessioned yet"
              description="Register the first patient and specimen to begin a microscopy worklist."
              action={
                <button
                  type="button"
                  onClick={onOpenNewPatientModal}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white"
                >
                  Accession New Patient
                </button>
              }
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[620px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th scope="col" className="py-3 px-4 font-semibold">Patient MRN & Name</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Age / Gender</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Specimen Type</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Referring Provider</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Accessioned</th>
                    <th scope="col" className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredPatients.map(pat => {
                    const patientSample = samples.find(s => s.patientId === pat.id);

                    return (
                      <tr
                        key={pat.id}
                        tabIndex={0}
                        aria-label={`Open patient details for ${pat.fullName}`}
                        onClick={event => {
                          if ((event.target as HTMLElement).closest('button')) return;
                          onEditPatient(pat, patientSample);
                        }}
                        onKeyDown={event => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onEditPatient(pat, patientSample);
                          }
                        }}
                        className="cursor-pointer hover:bg-cyan-50/70 dark:hover:bg-cyan-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm">
                            {pat.fullName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">{pat.patientNumber}</div>
                        </td>

                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          <span className="font-mono">{pat.age}y</span> · {pat.gender}
                        </td>

                        <td className="py-3 px-4">
                          {(pat.sampleTypes || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(pat.sampleTypes || []).map(type => (
                                <span
                                  key={type}
                                  className="inline-block px-2.5 py-0.5 rounded text-[11px] font-medium capitalize bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                >
                                  {type} Microscopy
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No specimen</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {pat.referringDoctor || '—'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">
                            {pat.referringFacility}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                          {new Date(pat.createdAt).toLocaleDateString()}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectPatientForAnalysis(pat.id, patientSample?.id)}
                              disabled={!patientSample}
                              title={patientSample ? undefined : 'No specimen accessioned for this patient'}
                              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-300 disabled:hover:bg-slate-300 dark:bg-green-600 dark:hover:bg-green-500 dark:disabled:bg-slate-700 text-white rounded-lg font-medium text-xs inline-flex items-center gap-1.5 shadow-xs transition disabled:cursor-not-allowed"
                            >
                              <Microscope className="w-3.5 h-3.5" />
                              <span>{patientSample ? 'Run Microscopy' : 'No specimen'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onEditPatient(pat, patientSample)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium inline-flex items-center gap-1 shadow-xs transition"
                              title="Edit patient"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {canDeletePatients && (
                              <button
                                type="button"
                                onClick={() => onDeletePatient(pat)}
                                className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-800 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-medium inline-flex items-center gap-1 shadow-xs transition"
                                title="Archive patient"
                                aria-label={`Archive ${pat.fullName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              total={patientTotal}
              limit={50}
              offset={patientOffset}
              onChange={setPatientOffset}
              label="patients"
            />
          </>
        )}
      </div>
    </div>
  );
};
