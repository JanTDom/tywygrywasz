'use client';

import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Building2,
  Briefcase,
  User,
  Users,
  ArrowRight,
  FileText,
  Clock,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import {
  Case,
  CaseInstitutionKind,
  CaseInstitutionRole,
  ProcedureType,
  OpponentType,
} from '../../domain/types';
import { ViewType } from '../Navigation';

interface CasesViewProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  onCreateCase: (newCase: Omit<Case, 'id' | 'folderName' | 'createdAt' | 'updatedAt' | 'status' | 'nextAction' | 'missingFacts'>) => void;
  onNavigate: (view: ViewType, caseId?: string) => void;
  documentCountByCase: Record<string, number>;
}

export function CasesView({
  cases,
  activeCaseId,
  onSelectCase,
  onCreateCase,
  onNavigate,
  documentCountByCase,
}: CasesViewProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [procedureType, setProcedureType] = useState<ProcedureType>('administrative');
  const [opponentType, setOpponentType] = useState<OpponentType>('public_authority');
  const [authorityJurisdictionReason, setAuthorityJurisdictionReason] = useState('');
  type InstitutionDraft = { name: string; role: CaseInstitutionRole; kind: CaseInstitutionKind };
  const [institutionDrafts, setInstitutionDrafts] = useState<InstitutionDraft[]>([
    { name: '', role: 'issuing_authority', kind: 'public_authority' },
  ]);

  const filteredCases = cases.filter((c) => {
    if (filterType === 'all') return true;
    return c.procedureType === filterType;
  });

  const handleSubmitNewCase = (e: React.FormEvent) => {
    e.preventDefault();
    const institutions = institutionDrafts
      .map((institution, index) => ({
        id: `institution-${Date.now()}-${index + 1}`,
        name: institution.name.trim(),
        roles: [institution.role],
        kind: institution.kind,
        isPrimary: index === 0,
      }))
      .filter((institution) => institution.name.length > 0);

    if (!title || institutions.length === 0) return;

    const primaryInstitution = institutions[0];

    onCreateCase({
      title,
      goalDescription,
      procedureType,
      opponentType,
      // Zachowujemy pole legacy dla starych analiz i kopii zapasowych. Wszystkie
      // instytucje są przechowywane w `institutions`.
      authorityOrOpponentName: primaryInstitution.name,
      authorityJurisdictionReason,
      institutions,
    });

    setTitle('');
    setGoalDescription('');
    setAuthorityJurisdictionReason('');
    setInstitutionDrafts([{ name: '', role: 'issuing_authority', kind: 'public_authority' }]);
    setIsModalOpen(false);
  };

  const addInstitutionDraft = () => {
    setInstitutionDrafts((current) => [
      ...current,
      { name: '', role: 'intermediary', kind: opponentType === 'institution' ? 'organization' : opponentType },
    ]);
  };

  const updateInstitutionDraft = (
    index: number,
    patch: Partial<InstitutionDraft>
  ) => {
    setInstitutionDrafts((current) =>
      current.map((institution, institutionIndex) =>
        institutionIndex === index ? { ...institution, ...patch } : institution
      )
    );
  };

  const removeInstitutionDraft = (index: number) => {
    setInstitutionDrafts((current) =>
      current.length <= 1 ? current : current.filter((_, institutionIndex) => institutionIndex !== index)
    );
  };

  const getOpponentIcon = (type: OpponentType) => {
    switch (type) {
      case 'public_authority':
        return <Building2 className="w-4 h-4 text-indigo-600" />;
      case 'company':
        return <Briefcase className="w-4 h-4 text-emerald-600" />;
      case 'individual':
        return <User className="w-4 h-4 text-amber-600" />;
      case 'institution':
        return <Users className="w-4 h-4 text-purple-600" />;
    }
  };

  const getProcedureLabel = (type: ProcedureType) => {
    switch (type) {
      case 'administrative':
        return 'Postępowanie administracyjne';
      case 'tax_dispute':
        return 'Spór podatkowy (Ordynacja)';
      case 'social_insurance':
        return 'Ubezpieczenia społeczne (ZUS)';
      case 'labor_dispute':
        return 'Spór pracowniczy (Kodeks pracy)';
      case 'consumer_dispute':
        return 'Spór konsumencki';
      case 'contract_dispute':
        return 'Spór z umowy cywilnej';
      case 'public_information':
        return 'Dostęp do informacji publicznej';
      case 'complaint_or_petition':
        return 'Skarga / petycja';
      case 'social_interest':
        return 'Działanie w interesie społecznym';
      default:
        return 'Inne postępowanie';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Moje sprawy
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Zestawienie spraw prowadzonych z urzędami, firmami, osobami fizycznymi oraz w interesie społecznym.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Utwórz nową sprawę</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-medium border-b border-slate-200">
        {[
          { id: 'all', label: 'Wszystkie sprawy' },
          { id: 'administrative', label: 'Administracyjne' },
          { id: 'tax_dispute', label: 'Podatkowe' },
          { id: 'social_insurance', label: 'ZUS' },
          { id: 'labor_dispute', label: 'Pracownicze' },
          { id: 'consumer_dispute', label: 'Konsumenckie' },
          { id: 'contract_dispute', label: 'Umowy cywilne' },
          { id: 'public_information', label: 'Informacja publiczna' },
          { id: 'social_interest', label: 'Interes społeczny' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterType(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              filterType === tab.id
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCases.map((c) => {
          const isSelected = activeCaseId === c.id;
          const docCount = documentCountByCase[c.id] || 0;

          return (
            <div
              key={c.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm transition-all flex flex-col justify-between ${
                isSelected
                  ? 'border-slate-900 ring-2 ring-slate-900/10'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {c.id}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {getProcedureLabel(c.procedureType)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    {getOpponentIcon(c.opponentType)}
                  </div>
                </div>

                <h2 className="text-base font-bold text-slate-900 mt-2.5 leading-snug">
                  {c.title}
                </h2>

                {(() => {
                  const institutions = c.institutions?.length
                    ? c.institutions
                    : [{
                        id: `${c.id}-legacy-institution`,
                        name: c.authorityOrOpponentName,
                        roles: ['issuing_authority' as const],
                        kind: c.opponentType,
                        isPrimary: true,
                      }];
                  const primaryInstitution = institutions.find((institution) => institution.isPrimary) || institutions[0];

                  return (
                    <div className="mt-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {institutions.length === 1 ? 'Druga strona: ' : `Instytucje (${institutions.length}): `}
                      </span>
                      <span>{primaryInstitution.name}</span>
                      {institutions.length > 1 && (
                        <span className="text-slate-500"> + {institutions.length - 1} kolejnych</span>
                      )}
                      {institutions.length > 1 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {institutions.map((institution) => (
                            <span
                              key={institution.id}
                              className="inline-flex items-center rounded-md border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
                            >
                              {institution.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                  <span className="font-semibold text-slate-800">Cel: </span>
                  <span>{c.goalDescription}</span>
                </div>

                {c.nextAction && (
                  <div className="mt-3 text-xs text-slate-600 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-800">Najbliższy krok: </strong>
                      {c.nextAction}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{docCount} {docCount === 1 ? 'dokument' : 'dokumentów'}</span>
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{c.folderName}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCase(c.id);
                      onNavigate('disk', c.id);
                    }}
                    className="font-semibold text-slate-900 hover:text-slate-700 inline-flex items-center gap-1 transition-colors"
                  >
                    <span>Otwórz</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredCases.length === 0 && (
          <div className="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200">
            <FolderKanban className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800 mt-2">Brak spraw w tej kategorii</h3>
            <p className="text-xs text-slate-500 mt-1">
              Dodaj nową sprawę lub wybierz &quot;Wszystkie sprawy&quot;.
            </p>
          </div>
        )}
      </div>

      {/* Modal: New Case */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">
              Tworzenie nowej sprawy
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Dla sprawy zostanie utworzony fizyczny katalog w folderze &quot;Moje_sprawy/&quot; wraz ze strukturą podkatalogów.
            </p>

            <form onSubmit={handleSubmitNewCase} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Tytuł sprawy
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. Odwołanie od odmowy pozwolenia na budowę"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Rodzaj procedury
                  </label>
                  <select
                    value={procedureType}
                    onChange={(e) => setProcedureType(e.target.value as ProcedureType)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="administrative">Administracyjna (KPA)</option>
                    <option value="tax_dispute">Podatkowa (Ordynacja podatkowa)</option>
                    <option value="social_insurance">Ubezpieczenia społeczne (ZUS)</option>
                    <option value="labor_dispute">Pracownicza (Kodeks pracy)</option>
                    <option value="consumer_dispute">Reklamacja / Konsumencka</option>
                    <option value="contract_dispute">Spór z umowy (KC)</option>
                    <option value="public_information">Dostęp do informacji publicznej</option>
                    <option value="complaint_or_petition">Skarga lub petycja</option>
                    <option value="social_interest">Działanie w interesie społecznym</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Typ drugiej strony
                  </label>
                  <select
                    value={opponentType}
                    onChange={(e) => {
                      const nextOpponentType = e.target.value as OpponentType;
                      setOpponentType(nextOpponentType);
                      updateInstitutionDraft(0, {
                        kind: nextOpponentType === 'institution' ? 'organization' : nextOpponentType,
                      });
                    }}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="public_authority">Organ publiczny / Urząd</option>
                    <option value="company">Firma / Przedsiębiorca</option>
                    <option value="individual">Osoba fizyczna</option>
                    <option value="institution">Instytucja / Organizacja</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Instytucje i strony w sprawie
                  </label>
                  <span className="text-[11px] text-slate-500">Możesz dodać kilka</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Dodaj organ prowadzący, organ odwoławczy, sąd lub inne podmioty. Pierwsza pozycja będzie głównym adresatem.
                </p>
                <div className="space-y-2">
                  {institutionDrafts.map((institution, index) => (
                    <div key={`institution-row-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            required={index === 0}
                            placeholder={index === 0 ? 'np. Prezydent m.st. Warszawy' : 'np. Samorządowe Kolegium Odwoławcze'}
                            value={institution.name}
                            onChange={(e) => updateInstitutionDraft(index, { name: e.target.value })}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              value={institution.role}
                              onChange={(e) => updateInstitutionDraft(index, { role: e.target.value as CaseInstitutionRole })}
                              aria-label="Rola instytucji w sprawie"
                              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                            >
                              <option value="issuing_authority">Organ prowadzący</option>
                              <option value="appeal_authority">Organ odwoławczy</option>
                              <option value="intermediary">Organ pośredniczący</option>
                              <option value="recipient">Adresat pisma</option>
                              <option value="opponent">Druga strona</option>
                              <option value="consulted">Instytucja konsultowana</option>
                              <option value="witness">Świadek</option>
                              <option value="expert">Ekspert</option>
                              <option value="other">Inna rola</option>
                            </select>
                            <select
                              value={institution.kind}
                              onChange={(e) => updateInstitutionDraft(index, { kind: e.target.value as CaseInstitutionKind })}
                              aria-label="Typ instytucji"
                              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                            >
                              <option value="public_authority">Organ publiczny</option>
                              <option value="office">Urząd</option>
                              <option value="court">Sąd</option>
                              <option value="company">Firma</option>
                              <option value="organization">Instytucja / organizacja</option>
                              <option value="other">Inny podmiot</option>
                            </select>
                          </div>
                        </div>
                        {institutionDrafts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeInstitutionDraft(index)}
                            className="mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600"
                            aria-label={`Usuń instytucję ${index + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addInstitutionDraft}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-500 hover:bg-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Dodaj kolejną instytucję
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Cel sprawy (co chcesz osiągnąć?)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="np. Uchylenie niekorzystnej decyzji i uzyskanie pozwolenia zamiennego"
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Uzasadnienie właściwości / rola strony
                </label>
                <input
                  type="text"
                  placeholder="np. Organ I instancji w sprawach architektoniczno-budowlanych"
                  value={authorityJurisdictionReason}
                  onChange={(e) => setAuthorityJurisdictionReason(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  Utwórz sprawę na dysku
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
