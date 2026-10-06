'use client';

import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Copy,
  Printer,
  ShieldCheck,
  Plus,
  Send,
  Check,
} from 'lucide-react';
import { Case, LetterDraft, LetterType, getCaseInstitutions } from '../../domain/types';
import {
  createModularLetterDraft,
  formatLetterPlainText,
  exportLetterForPrinting,
} from '../../domain/letter-engine';
import { ElectronicGatewayConnector } from '../../domain/electronic-gateway';
import { printLetterText } from '../document/print-letter';

interface LettersViewProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  letters: LetterDraft[];
  onCreateLetter: (draft: LetterDraft) => void;
  onUpdateLetter: (draft: LetterDraft) => void;
  onRegisterReceipt: (letterId: string, receiptNumber: string, channel: string, date: string) => void;
}

export function LettersView({
  cases,
  activeCaseId,
  onSelectCase,
  letters,
  onCreateLetter,
  onUpdateLetter,
  onRegisterReceipt,
}: LettersViewProps) {
  const currentCaseId = activeCaseId || cases[0]?.id;
  const currentCase = cases.find((c) => c.id === currentCaseId);

  const [selectedLetterType, setSelectedLetterType] = useState<LetterType>('odwolanie');
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [draftingNotes, setDraftingNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  // Registration state
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptChannel, setReceiptChannel] = useState('Poczta Polska (polecony za zwrotnym potwierdzeniem)');
  const [submissionDate, setSubmissionDate] = useState('2026-09-25');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [purdeXml, setPurdeXml] = useState<string | null>(null);

  const caseLetters = letters.filter((l) => !currentCaseId || l.caseId === currentCaseId);
  const activeLetter = letters.find((l) => l.id === selectedLetterId) || caseLetters[0];

  const handleGenerateNew = () => {
    if (!currentCase) return;

    const institutions = getCaseInstitutions(currentCase);
    const primaryInstitution = institutions.find((institution) => institution.isPrimary) || institutions[0];
    const issuingInstitution = institutions.find((institution) => institution.roles.includes('issuing_authority') || institution.roles.includes('intermediary')) || primaryInstitution;
    const appealInstitution = institutions.find((institution) => institution.roles.includes('appeal_authority') || institution.roles.includes('recipient'));

    let title = 'Projekt pisma';
    let recipientName = primaryInstitution.name;
    let recipientAddress = primaryInstitution.addressOrChannel || 'Adres/kanał do uzupełnienia';
    let recipientInstitutionId = primaryInstitution.id;
    let demands: string[] = [currentCase.goalDescription];
    let factualBasis = `Działając w sprawie ${currentCase.title}, wnoszę o realizację uprawnień wynikających z przepisów prawa.`;
    let legalJustification = currentCase.authorityJurisdictionReason;
    let intermediaryAuthority: string | undefined;
    let intermediaryInstitutionId: string | undefined;

    if (selectedLetterType === 'odwolanie') {
      title = `Odwołanie od decyzji (${currentCase.title})`;
      recipientName = appealInstitution?.name || 'Samorządowe Kolegium Odwoławcze w Warszawie';
      recipientInstitutionId = appealInstitution?.id || recipientInstitutionId;
      intermediaryAuthority = issuingInstitution.name;
      intermediaryInstitutionId = issuingInstitution.id;
      recipientAddress = appealInstitution?.addressOrChannel || `za pośrednictwem: ${issuingInstitution.name}`;
      demands = [
        'Uchylenie zaskarżonej decyzji w całości i wydanie rozstrzygnięcia co do istoty sprawy',
        'Wstrzymanie natychmiastowego wykonania decyzji do czasu rozpatrzenia odwołania',
      ];
      factualBasis =
        'Organ I instancji błędnie ocenił zgodność projektu z Miejscowym Planem Zagospodarowania Przestrzennego.';
      legalJustification =
        'Art. 127 § 1 i 2 oraz art. 138 § 1 pkt 2 ustawy z dnia 14 czerwca 1960 r. - Kodeks postępowania administracyjnego.';
    } else if (selectedLetterType === 'wniosek_o_informacje') {
      title = `Wniosek o udostępnienie informacji publicznej`;
      demands = ['Udostępnienie kopii rejestru wydanych decyzji oraz korespondencji z inwestorem'];
      factualBasis = 'Wnoszę o udostępnienie informacji publicznej w postaci elektronicznej.';
      legalJustification = 'Art. 2 ust. 1 i art. 10 ust. 1 ustawy o dostępie do informacji publicznej.';
    } else if (selectedLetterType === 'ponaglenie') {
      title = `Ponaglenie na bezczynność organu`;
      demands = ['Stwierdzenie, że organ dopuścił się bezczynności i wyznaczenie terminu na załatwienie sprawy'];
      factualBasis = 'Od złożenia kompletnego wniosku upłynęło ponad 30 dni bez wydania decyzji.';
      legalJustification = 'Art. 37 § 1 pkt 1 i § 3 Kodeksu postępowania administracyjnego.';
    } else if (selectedLetterType === 'reklamacja_konsumencka') {
      title = `Reklamacja z tytułu braku zgodności towaru z umową`;
      recipientName = primaryInstitution.name;
      recipientInstitutionId = primaryInstitution.id;
      demands = ['Nieodpłatna naprawa towaru lub wymiana na nowy wolny od wad'];
      factualBasis = 'Zakupiony towar wykazuje wadę uniemożliwiającą normalne użytkowanie.';
      legalJustification = 'Art. 43d ust. 1 ustawy z dnia 30 maja 2014 r. o prawach konsumenta.';
    } else if (selectedLetterType === 'wezwanie_do_zaplaty') {
      title = `Przedsądowe wezwanie do zapłaty`;
      demands = ['Zapłata kwoty roszczenia głównego wraz z ustawowymi odsetkami w terminie 7 dni'];
      factualBasis = 'Zobowiązanie wynikające z zawartej umowy nie zostało uregulowane w terminie.';
      legalJustification = 'Art. 455 i art. 476 ustawy z dnia 23 kwietnia 1964 r. - Kodeks cywilny.';
    } else if (selectedLetterType === 'odwolanie_podatkowe') {
      title = `Odwołanie od decyzji podatkowej`;
      recipientName = appealInstitution?.name || 'Dyrektor Izby Administracji Skarbowej w Warszawie';
      recipientInstitutionId = appealInstitution?.id || recipientInstitutionId;
      intermediaryAuthority = issuingInstitution.name;
      intermediaryInstitutionId = issuingInstitution.id;
      recipientAddress = appealInstitution?.addressOrChannel || `za pośrednictwem: ${issuingInstitution.name}`;
      demands = ['Uchylenie zaskarżonej decyzji w całości i umorzenie postępowania podatkowego'];
      factualBasis = 'Organ podatkowy bezzasadnie zakwestionował koszty uzyskania przychodów oraz prawo do odliczenia VAT.';
      legalJustification = 'Art. 220 § 1 i art. 233 § 1 pkt 2 lit. a ustawy z dnia 29 sierpnia 1997 r. - Ordynacja podatkowa.';
    } else if (selectedLetterType === 'odwolanie_zus') {
      title = `Odwołanie od decyzji ZUS`;
      recipientName = appealInstitution?.name || 'Sąd Okręgowy w Warszawie - Sąd Pracy i Ubezpieczeń Społecznych';
      recipientInstitutionId = appealInstitution?.id || recipientInstitutionId;
      intermediaryAuthority = issuingInstitution.name;
      intermediaryInstitutionId = issuingInstitution.id;
      recipientAddress = appealInstitution?.addressOrChannel || `za pośrednictwem: ${issuingInstitution.name}`;
      demands = ['Zmiana zaskarżonej decyzji i przyznanie ubezpieczonemu prawa do świadczenia'];
      factualBasis = 'Ubezpieczony spełnił wszystkie przesłanki ustawowe warunkujące nabycie prawa do świadczenia.';
      legalJustification = 'Art. 83 ust. 2 ustawy o systemie ubezpieczeń społecznych w zw. z art. 477^9 Kodeksu postępowania cywilnego.';
    } else if (selectedLetterType === 'wezwanie_pracownicze') {
      title = `Wniosek o sprostowanie świadectwa pracy`;
      recipientName = primaryInstitution.name;
      recipientInstitutionId = primaryInstitution.id;
      demands = ['Sprostowanie treści świadectwa pracy w punkcie dotyczącym trybu rozwiązania stosunku pracy'];
      factualBasis = 'Pracodawca błędnie wskazał jednostronne rozwiązanie, pomijając zgodne porozumienie stron.';
      legalJustification = 'Art. 97 § 2^1 ustawy z dnia 26 czerwca 1974 r. - Kodeks pracy.';
    }

    const draft = createModularLetterDraft({
      caseId: currentCase.id,
      letterType: selectedLetterType,
      title,
      recipientName,
      recipientAddressOrChannel: recipientAddress,
      intermediaryAuthority,
      citizenName: '[Imię i nazwisko / wnioskodawca]',
      citizenAddress: '[Adres korespondencyjny / e-Doręczenia]',
      caseSignature: '',
      draftingNotes: draftingNotes.trim() || undefined,
      demands,
      factualBasis,
      legalJustification,
      attachments: [
        { id: 'att-1', title: 'Kopia zaskarżonej decyzji', included: true },
        { id: 'att-2', title: 'Żółta zwrotka pocztowa - dowód doręczenia', included: true },
        { id: 'att-3', title: 'Wypis i wyrys z rejestru gruntów', included: true },
      ],
    });

    // Zachowaj wybór ścieżki pisma w zaszyfrowanym sejfie: adresat i organ,
    // za którego pośrednictwem pismo jest składane, mogą być różnymi
    // instytucjami w tej samej sprawie.
    draft.recipient.institutionId = recipientInstitutionId;
    draft.recipient.intermediaryInstitutionId = intermediaryInstitutionId;

    onCreateLetter(draft);
    setSelectedLetterId(draft.id);
    setDraftingNotes('');
  };

  const handleToggleChecklist = (itemId: string) => {
    if (!activeLetter) return;
    const updatedChecklist = activeLetter.checklist.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    onUpdateLetter({ ...activeLetter, checklist: updatedChecklist });
  };

  const handleCopyText = async () => {
    if (!activeLetter) return;
    const plain = formatLetterPlainText(activeLetter);
    await navigator.clipboard.writeText(plain);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleExportPrint = async () => {
    if (!activeLetter) return;
    const exportResult = await exportLetterForPrinting(activeLetter);
    onUpdateLetter({
      ...activeLetter,
      exportSha256: exportResult.exportSha256,
      status: 'exported',
    });
    printLetterText(exportResult.formattedText);
  };

  const handleSaveReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLetter || !receiptNumber) return;

    onRegisterReceipt(activeLetter.id, receiptNumber, receiptChannel, submissionDate);
    setReceiptNumber('');
  };

  const handleGeneratePurdeEnvelope = async () => {
    if (!activeLetter || !currentCase) return;
    const connector = new ElectronicGatewayConnector();
    const plainText = formatLetterPlainText(activeLetter);
    const envelope = await connector.createPurdeEnvelope({
      senderName: activeLetter.sender?.placeholderName || '[Dane nadawcy do uzupełnienia]',
      recipientAdeAddress: '[Adres e-Doręczenia do uzupełnienia]',
      recipientName: activeLetter.recipient?.name || currentCase.authorityOrOpponentName,
      caseSignature: activeLetter.caseSignature || '[Znak sprawy do uzupełnienia]',
      subject: activeLetter.title,
      attachments: [
        {
          fileName: `${activeLetter.letterType}.txt`,
          content: plainText,
          mimeType: 'text/plain',
        },
      ],
    });
    setPurdeXml(envelope.xmlPayload);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Pisma, checklisty i dowód wykonania
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Projekty pism formalnych z checklistą wymagań, sumą kontrolną SHA-256 oraz rejestrem nadania.
          </p>
        </div>

        <select
          value={currentCaseId || ''}
          onChange={(e) => onSelectCase(e.target.value)}
          className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Generator Controls Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Generuj nowe pismo procesowe
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Wybierz rodzaj szablonu dopasowanego do polskiej procedury.
            </p>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <label htmlFor="letter-drafting-notes" className="block text-xs font-semibold text-indigo-950">
              Dodatkowe wskazówki do projektu <span className="font-normal text-indigo-700">(opcjonalnie)</span>
            </label>
            <textarea
              id="letter-drafting-notes"
              value={draftingNotes}
              onChange={(event) => setDraftingNotes(event.target.value)}
              maxLength={4000}
              rows={3}
              aria-describedby="letter-drafting-notes-help"
              placeholder="Np. podkreśl brak odpowiedzi organu i zostaw miejsce na datę doręczenia."
              className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p id="letter-drafting-notes-help" className="mt-1 text-[11px] leading-relaxed text-indigo-800">
              To prywatna notatka robocza dla Ciebie. Nie jest faktem prawnym i nie zostanie automatycznie dodana do eksportowanego pisma.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedLetterType}
              onChange={(e) => setSelectedLetterType(e.target.value as LetterType)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium"
            >
              <option value="odwolanie">Odwołanie od decyzji (KPA)</option>
              <option value="wniosek_o_informacje">Wniosek o informację publiczną (UDIP)</option>
              <option value="ponaglenie">Ponaglenie na bezczynność (KPA art. 37)</option>
              <option value="reklamacja_konsumencka">Reklamacja konsumencka (UPK)</option>
              <option value="wezwanie_do_zaplaty">Przedsądowe wezwanie do zapłaty (KC)</option>
              <option value="odwolanie_podatkowe">Odwołanie od decyzji podatkowej (Ordynacja podatkowa)</option>
              <option value="odwolanie_zus">Odwołanie od decyzji ZUS (Sąd Pracy i US)</option>
              <option value="wezwanie_pracownicze">Sprostowanie świadectwa pracy (Kodeks pracy)</option>
            </select>

            <button
              type="button"
              onClick={handleGenerateNew}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Utwórz projekt pisma</span>
            </button>
          </div>
        </div>

        {/* Existing letters in active case */}
        {caseLetters.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-500 font-medium">Wygenerowane pisma:</span>
            {caseLetters.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedLetterId(l.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
                  activeLetter?.id === l.id
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {l.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeLetter ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Letter text & Print preview (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {activeLetter.title}
                  </h2>
                  <span className="text-xs text-slate-500 font-mono">
                    Status: {activeLetter.status}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copyFeedback ? 'Skopiowano!' : 'Kopiuj'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportPrint}
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Drukuj / Eksportuj</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGeneratePurdeEnvelope}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Pakiet PURDE XML</span>
                  </button>
                </div>
              </div>

              {/* PURDE XML Preview Box */}
              {purdeXml && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                    <span>Ustrukturyzowana koperta e-Doręczenia (standard PURDE)</span>
                    <button
                      type="button"
                      onClick={() => setPurdeXml(null)}
                      className="text-[11px] text-indigo-700 hover:text-indigo-900"
                    >
                      Ukryj XML
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-900 text-slate-200 font-mono text-[10px] rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {purdeXml}
                  </div>
                </div>
              )}

              {/* SHA-256 seal badge if exported */}
              {activeLetter.exportSha256 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-950 font-semibold">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                    <span>Suma kontrolna (SHA-256) wydruku:</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-800 break-all">
                    {activeLetter.exportSha256}
                  </span>
                </div>
              )}

              {/* Formatted Letter Paper View */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-6 font-serif text-xs text-slate-900 leading-relaxed whitespace-pre-wrap shadow-inner max-h-[500px] overflow-y-auto">
                {formatLetterPlainText(activeLetter)}
              </div>

              <div className="no-print rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">Wskazówki robocze</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-900">Notatka pozostaje w prywatnym sejfie i nie trafia do treści pisma ani wydruku.</p>
                  </div>
                  {!isEditingNotes && <button type="button" onClick={() => { setNotesDraft(activeLetter.draftingNotes || ''); setIsEditingNotes(true); }} className="shrink-0 text-[11px] font-semibold text-amber-800 hover:text-amber-950">{activeLetter.draftingNotes ? 'Edytuj' : 'Dodaj'}</button>}
                </div>
                {isEditingNotes ? (
                  <div className="mt-2 space-y-2">
                    <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} maxLength={4000} rows={3} className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300" aria-label="Wskazówki robocze pisma" />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setIsEditingNotes(false)} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-amber-50">Anuluj</button>
                      <button type="button" onClick={() => { onUpdateLetter({ ...activeLetter, draftingNotes: notesDraft.trim() || undefined }); setIsEditingNotes(false); }} className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-800">Zapisz wskazówki</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-amber-950">{activeLetter.draftingNotes || 'Brak dodatkowych wskazówek.'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Pre-submission Checklist & Delivery Registration (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Interactive Checklist */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Checklista wymagań formalnych
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Wymogi niezbędne do uznania pisma za skuteczne prawnie.
                </p>
              </div>

              <div className="space-y-2.5">
                {activeLetter.checklist.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleToggleChecklist(item.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      item.checked
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : item.isMandatory
                        ? 'bg-rose-50/30 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center flex-shrink-0 border ${
                          item.checked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-400 bg-white'
                        }`}
                      >
                        {item.checked && <Check className="w-3 h-3" />}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-semibold ${
                              item.checked ? 'text-emerald-950' : 'text-slate-900'
                            }`}
                          >
                            {item.item}
                          </span>
                          {item.isMandatory && (
                            <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                              Wymóg
                            </span>
                          )}
                        </div>

                        {item.verificationDetail && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            {item.verificationDetail}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Proof of Delivery / Submission Registration */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Rejestracja nadania i UPO
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Udokumentuj nadanie na poczcie lub złożenie przez ePUAP/e-Doręczenia.
                </p>
              </div>

              {activeLetter.deliveryReceiptNumber ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Zarejestrowano dowód nadania</span>
                  </div>
                  <div className="text-emerald-900">
                    <strong>Nr przesyłki: </strong>
                    <span className="font-mono">{activeLetter.deliveryReceiptNumber}</span>
                  </div>
                  <div className="text-emerald-800 text-[11px]">
                    Kanał: {activeLetter.deliveryProofOrigin} | Data: {activeLetter.deliveryDate}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveReceipt} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Numer przesyłki / identyfikator UPO
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="np. (00)359007733445566778"
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Kanał doręczenia
                    </label>
                    <select
                      value={receiptChannel}
                      onChange={(e) => setReceiptChannel(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                    >
                      <option value="Poczta Polska (polecony za zwrotnym potwierdzeniem)">
                        Poczta Polska (polecony ze zwrotką)
                      </option>
                      <option value="ePUAP (Elektroniczna Skrzynka Podawcza)">
                        ePUAP (Elektroniczna Skrzynka Podawcza)
                      </option>
                      <option value="e-Doręczenia (PURDE)">e-Doręczenia (PURDE)</option>
                      <option value="Biuro podawcze organu (osobiście)">
                        Biuro podawcze (osobiście)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Data nadania / złożenia
                    </label>
                    <input
                      type="date"
                      required
                      value={submissionDate}
                      onChange={(e) => setSubmissionDate(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Zarejestruj potwierdzenie nadania
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-sm font-bold text-slate-800 mt-2">
            Brak pism dla wybranej sprawy
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Wybierz powyżej rodzaj szablonu i kliknij &quot;Utwórz projekt pisma&quot;.
          </p>
        </div>
      )}
    </div>
  );
}
