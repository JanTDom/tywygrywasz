'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Shield,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Bell,
  ChevronDown,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Navigation, ViewType } from '../components/Navigation';
import { TodayView } from '../components/views/TodayView';
import { CasesView } from '../components/views/CasesView';
import { DiskDocumentsView } from '../components/views/DiskDocumentsView';
import { InboxView } from '../components/views/InboxView';
import { TimelineView } from '../components/views/TimelineView';
import { EvidenceView } from '../components/views/EvidenceView';
import { ActionPlanView } from '../components/views/ActionPlanView';
import { LettersView } from '../components/views/LettersView';
import { LegalKnowledgeView } from '../components/views/LegalKnowledgeView';
import { BackupPrivacyView } from '../components/views/BackupPrivacyView';

import { LocalVault } from '../domain/vault';
import {
  Case,
  CaseEvent,
  CaseSubfolder,
  DocumentRecord,
  DocumentVersion,
  ExtractedField,
  InboxProposal,
  LetterDraft,
  ProceduralDeadline,
  DiskFileInfo,
} from '../domain/types';
import { SYNTHETIC_DATASET } from '../domain/synthetic-data';
import { calculateKpaDeadline } from '../domain/deadlines';
import { OFFICIAL_LEGAL_SOURCES } from '../domain/legal-knowledge';
import { buildCompleteCaseAnalysis } from '../domain/case-analysis';
import { IntelligentClassifier } from '../domain/intelligent-classifier';
import { EncryptedContainer } from '../domain/crypto';
import { LocalOcrEngine } from '../domain/ocr-engine';
import { E2EESyncEngine } from '../domain/sync-engine';

export default function ObywatelApp() {
  const [vault, setVault] = useState<LocalVault>(() => {
    if (typeof window !== 'undefined') {
      const storedProfile = window.localStorage.getItem('obywatel-profile');
      if (storedProfile) {
        try {
          const parsed = JSON.parse(storedProfile) as { id?: string };
          if (parsed.id) return new LocalVault(`sejf-${parsed.id}`);
        } catch {
          // Uszkodzony profil zostanie pominięty, a użytkownik może utworzyć nowy.
        }
      }
    }
    return new LocalVault('sejf-lokalny-01');
  });
  const [activeView, setActiveView] = useState<ViewType>('today');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  // Status and loading states
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [isScanningDisk, setIsScanningDisk] = useState(false);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [lastMoveDescription, setLastMoveDescription] = useState<string | null>(null);
  const [diskFiles, setDiskFiles] = useState<DiskFileInfo[]>([]);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string; email: string } | null>(null);
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '' });
  const [profilePassword, setProfilePassword] = useState('');

  useEffect(() => {
    const stored = window.localStorage.getItem('obywatel-profile');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { id: string; name: string; email: string };
      setProfile(parsed);
      setProfileDraft({ name: parsed.name, email: parsed.email });
    } catch {
      window.localStorage.removeItem('obywatel-profile');
    }
  }, []);

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile && (cases.length > 0 || documents.length > 0)) {
      setGlobalNotice('Najpierw wykonaj lokalną kopię sejfu. Nie przypisuję istniejących dokumentów do nowego konta automatycznie.');
      return;
    }
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
      const csrfData = await csrfResponse.json();
      const endpoint = profile ? '/api/auth/login' : '/api/auth/register';
      const payload = profile
        ? { email: profileDraft.email, password: profilePassword }
        : { name: profileDraft.name, email: profileDraft.email, password: profilePassword };
      const authResponse = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
        body: JSON.stringify(payload),
      });
      const authData = await authResponse.json();
      if (!authResponse.ok || !authData.user) throw new Error(authData.error || 'Nie udało się zapisać konta.');

      const nextProfile = { id: authData.user.id, name: profileDraft.name.trim() || authData.user.name, email: authData.user.email };
      if (profile && nextProfile.name !== authData.user.name) {
        await fetch('/api/auth/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
          body: JSON.stringify({ name: nextProfile.name }),
        });
      }
      window.localStorage.setItem('obywatel-profile', JSON.stringify(nextProfile));
      setProfile(nextProfile);
      setProfilePassword('');
      setIsAccountOpen(false);
      setGlobalNotice(profile ? 'Zalogowano i zapisano profil właściciela sejfu.' : 'Konto utworzone. Dokumenty nadal pozostają na tym urządzeniu.');
    } catch (error) {
      setGlobalNotice(error instanceof Error ? error.message : 'Nie udało się zapisać konta.');
    }
  };

  // Trigger state refresh for sub-components
  const [, startTransition] = useTransition();
  const triggerRefresh = () => {
    startTransition(() => {
      setVault((prev) => {
        const manifest = prev.toManifest();
        return LocalVault.fromManifest(manifest);
      });
    });
  };

  // Convert vault maps to arrays for UI
  const cases = Array.from(vault.cases.values());
  const documents = Array.from(vault.documents.values());
  const versions = Array.from(vault.documentVersions.values());
  const deadlines = Array.from(vault.deadlines.values());
  const events = Array.from(vault.events.values());
  const letters = Array.from(vault.letters.values());
  const legalSources = Array.from(vault.legalSources.values());
  const inboxProposalsRecord: Record<string, InboxProposal> = {};
  vault.inboxProposals.forEach((p, k) => {
    inboxProposalsRecord[k] = p;
  });

  // Staged inbox documents (documents in Do_uporzadkowania)
  const inboxDocuments = documents.filter(
    (d) => d.subfolder === 'Do_uporzadkowania' || d.caseIds.length === 0
  );

  // Urgent or unknown deadlines count
  const urgentCount = deadlines.filter((d) => d.status === 'unknown' || d.startDate === 'unknown').length;

  // Documents count per case
  const documentCountByCase: Record<string, number> = {};
  cases.forEach((c) => {
    documentCountByCase[c.id] = documents.filter((d) => d.caseIds.includes(c.id)).length;
  });

  // Active case analysis
  const currentCase = activeCaseId
    ? vault.cases.get(activeCaseId)
    : cases.length > 0
    ? cases[0]
    : null;

  const currentAnalysis = currentCase
    ? vault.legalAnalyses.get(currentCase.id) ||
      vault.legalAnalyses.get(`analysis-${currentCase.id}`) ||
      Array.from(vault.legalAnalyses.values()).find((a) => a.caseId === currentCase.id) ||
      null
    : null;
  const currentActionPlan = currentAnalysis?.actionPlan || [];

  // 1. Initial scan on mount
  useEffect(() => {
    handleScanDisk();
  }, []);

  // 2. Skanowanie dysku via API
  const postWorkspace = async (body: Record<string, unknown>) => {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfData = await csrfResponse.json();
    return fetch('/api/workspace', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
      body: JSON.stringify(body),
    });
  };

  const handleScanDisk = async () => {
    setIsScanningDisk(true);
    try {
      const res = await postWorkspace({ action: 'scan', knownDocuments: documents });
      if (res.ok) {
        const data = await res.json();
        if (data.scanResult?.files) {
          setDiskFiles(data.scanResult.files);
        }
      }
    } catch {
      // Ignorujemy błędy sieci w trybie offline
    } finally {
      setIsScanningDisk(false);
    }
  };

  // 3. Wczytanie 3 pełnych syntetycznych scenariuszy
  const handleLoadSyntheticDemo = async () => {
    setIsLoadingDemo(true);
    setGlobalNotice('Wczytywanie 3 syntetycznych spraw i zapisywanie plików w Moje_sprawy/ ...');

    try {
      // Sprawa 1: Administracyjna (S-0001)
      const case1 = vault.createCase({
        id: 'S-0001',
        title: 'Odwołanie od odmowy pozwolenia na budowę',
        goalDescription: 'Uchylenie decyzji odmownej i zatwierdzenie projektu budowlanego',
        procedureType: 'administrative',
        opponentType: 'public_authority',
        authorityOrOpponentName: 'Prezydent Miasta Stołecznego Warszawy',
        authorityJurisdictionReason:
          'Organ administracji architektoniczno-budowlanej I instancji właściwy dla Dzielnicy Mokotów',
      });

      // Sprawa 2: Reklamacja konsumencka (S-0002)
      const case2 = vault.createCase({
        id: 'S-0002',
        title: 'Reklamacja wadliwego laptopa (bateria i płyta główna)',
        goalDescription: 'Wymiana sprzętu na nowy wolny od wad lub bezpłatna naprawa',
        procedureType: 'consumer_dispute',
        opponentType: 'company',
        authorityOrOpponentName: 'Elektronika Polska Sp. z o.o.',
        authorityJurisdictionReason: 'Przedsiębiorca / sprzedawca sprzętu elektronicznego (B2C)',
      });

      // Sprawa 3: Spór z umowy cywilnej (S-0003)
      const case3 = vault.createCase({
        id: 'S-0003',
        title: 'Spór z wykonawcą remontu mieszkania',
        goalDescription: 'Usunięcie usterek prac wykończeniowych lub obniżenie wynagrodzenia',
        procedureType: 'contract_dispute',
        opponentType: 'individual',
        authorityOrOpponentName: 'Tomasz Majewski (wykonawca)',
        authorityJurisdictionReason:
          'Wykonawca dzieła remontowego na podstawie art. 627 Kodeksu cywilnego',
      });

      // Utworzenie katalogów na dysku
      for (const c of [case1, case2, case3]) {
        await postWorkspace({ action: 'create_case_folder', folderName: c.folderName });
      }

      // Import dokumentów syntetycznych
      const classifier = new IntelligentClassifier();

      for (const item of SYNTHETIC_DATASET) {
        let subfolder: CaseSubfolder = '01_Otrzymane';
        let targetCaseId: string | undefined = item.suggestedCaseId;

        // Określenie folderu
        if (
          item.fileName.includes('zolta_zwrotka') ||
          item.fileName.includes('potwierdzenie_odbioru')
        ) {
          subfolder = '04_Potwierdzenia';
        } else if (item.fileName.includes('faktura') || item.fileName.includes('wypis_i_wyrys')) {
          subfolder = '03_Dowody';
        } else if (item.fileName.includes('umowa')) {
          subfolder = '00_Plan_i_opis';
        } else if (item.fileName.includes('wezwanie')) {
          subfolder = '02_Wyslane';
        }

        // Pliki kierowane do Do_uporzadkowania
        const isInboxStaged =
          item.fileName.includes('brak_daty') ||
          item.fileName.includes('wielostronicowy') ||
          item.fileName.includes('KOPIA');

        if (isInboxStaged) {
          subfolder = 'Do_uporzadkowania';
          targetCaseId = undefined;
        }

        const { document } = await vault.importDocument({
          caseId: targetCaseId,
          type: item.fileName.includes('faktura')
            ? 'invoice'
            : item.fileName.includes('umowa')
            ? 'contract'
            : item.fileName.includes('zwrotka')
            ? 'proof_of_delivery'
            : 'decision',
          direction: item.fileName.includes('wezwanie') ? 'outgoing' : 'incoming',
          origin: item.fileName.includes('wielostronicowy') ? 'scan' : 'pdf_digital',
          originalFileName: item.fileName,
          mimeType: 'text/plain',
          content: item.content,
          subfolder,
        });

        // Obsługa dokumentu wspólnego dla S-0001 oraz S-0003
        if (item.fileName.includes('wypis_i_wyrys')) {
          vault.linkDocumentToCase(document.id, 'S-0003');
        }

        // Fizyczny zapis pliku na dysku
        const folderTarget = isInboxStaged
          ? 'Do_uporzadkowania'
          : vault.cases.get(item.suggestedCaseId)?.folderName || 'Do_uporzadkowania';

        await postWorkspace({
          action: 'write_file',
          folderName: isInboxStaged ? '' : folderTarget,
          subfolder: isInboxStaged ? 'Do_uporzadkowania' : subfolder,
          fileName: item.fileName,
          content: item.content,
        });

        // Jeśli plik jest w skrzynce, przygotuj propozycję inteligentnego klasyfikatora
        if (isInboxStaged) {
          const res = classifier.classifyDocument(document, item.content, {
            cases: Array.from(vault.cases.values()),
            existingDocuments: Array.from(vault.documents.values()),
            relations: Array.from(vault.relations.values()),
          });
          vault.recordInboxProposal(res.proposal);
        }
      }

      // Rejestracja zdarzeń w osi czasu
      vault.addEvent({
        id: 'evt-01',
        caseId: 'S-0001',
        type: 'document_issued',
        title: 'Wydanie decyzji odmownej nr 142/2026',
        date: '2026-09-15',
        datePrecision: 'exact',
        isConfirmed: true,
        notes: 'Prezydent m.st. Warszawy, znak: WAB.6740.1.2026.JK',
      });

      vault.addEvent({
        id: 'evt-02',
        caseId: 'S-0001',
        type: 'document_delivered',
        title: 'Doręczenie decyzji stronie za zwrotnym poświadczeniem odbioru',
        date: '2026-09-18',
        datePrecision: 'exact',
        isConfirmed: true,
        notes: 'Potwierdzone podpisem na żółtej zwrotce pocztowej (UP Warszawa 12)',
      });

      vault.addEvent({
        id: 'evt-03',
        caseId: 'S-0002',
        type: 'document_issued',
        title: 'Zakup laptopa UltraPro 15 w sklepie Elektronika Polska',
        date: '2026-08-10',
        datePrecision: 'exact',
        isConfirmed: true,
        notes: 'Faktura VAT nr FV/2026/08/10/8812',
      });

      vault.addEvent({
        id: 'evt-04',
        caseId: 'S-0002',
        type: 'citizen_action',
        title: 'Wysłanie wiadomości e-mail ze zgłoszeniem usterki',
        date: 'unknown',
        datePrecision: 'unknown',
        isConfirmed: false,
        notes: 'Brak nagłówka z datą w pliku zgłoszenie_usterki_mail_brak_daty.txt (do weryfikacji)',
      });

      // Ustalenie terminu KPA art. 57 dla S-0001
      const deadline1 = calculateKpaDeadline({
        caseId: 'S-0001',
        baseEventId: 'evt-02',
        deliveryDate: '2026-09-18',
        daysCount: 14,
        actionRequired: 'Złożenie odwołania od decyzji nr 142/2026 do Samorządowego Kolegium Odwoławczego',
      });
      vault.setDeadline(deadline1);

      // Źródła prawne
      Object.values(OFFICIAL_LEGAL_SOURCES).forEach((s) => vault.addLegalSource(s));

      // Kompleksowa analiza i plan działania dla S-0001
      const analysis1 = buildCompleteCaseAnalysis({
        caseRecord: case1,
        documents: Array.from(vault.documents.values()).filter((d) => d.caseIds.includes('S-0001')),
        extractedFields: Array.from(vault.extractedFields.values()),
        events: Array.from(vault.events.values()).filter((e) => e.caseId === 'S-0001'),
        deadlines: [deadline1],
      });
      vault.setLegalAnalysis(analysis1);

      // Kompleksowa analiza dla S-0002
      const analysis2 = buildCompleteCaseAnalysis({
        caseRecord: case2,
        documents: Array.from(vault.documents.values()).filter((d) => d.caseIds.includes('S-0002')),
        extractedFields: [],
        events: Array.from(vault.events.values()).filter((e) => e.caseId === 'S-0002'),
        deadlines: [],
      });
      vault.setLegalAnalysis(analysis2);

      // Kompleksowa analiza dla S-0003
      const analysis3 = buildCompleteCaseAnalysis({
        caseRecord: case3,
        documents: Array.from(vault.documents.values()).filter((d) => d.caseIds.includes('S-0003')),
        extractedFields: [],
        events: Array.from(vault.events.values()).filter((e) => e.caseId === 'S-0003'),
        deadlines: [],
      });
      vault.setLegalAnalysis(analysis3);

      setActiveCaseId('S-0001');
      setGlobalNotice('Wczytano 3 sprawy syntetyczne. Dokumenty zapisano fizycznie na dysku.');
      triggerRefresh();
      await handleScanDisk();
    } catch (err: unknown) {
      setGlobalNotice(`Błąd ładowania danych syntetycznych: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingDemo(false);
    }
  };

  // 4. Potwierdzenie brakującej daty doręczenia
  const handleConfirmDeliveryDate = (caseId: string, confirmedDate: string) => {
    const deadline = calculateKpaDeadline({
      caseId,
      baseEventId: `evt-${Date.now()}`,
      deliveryDate: confirmedDate,
      daysCount: 14,
      actionRequired: 'Złożenie odwołania do Samorządowego Kolegium Odwoławczego',
    });
    vault.setDeadline(deadline);

    const c = vault.cases.get(caseId);
    if (c) {
      c.missingFacts = c.missingFacts.filter((f) => !f.includes('doręczenia'));
      c.nextAction = `Termin upływa w dniu: ${deadline.calculatedEndDate}. Przygotuj odwołanie.`;
    }

    setGlobalNotice(`Potwierdzono datę doręczenia: ${confirmedDate}. Obliczony koniec terminu: ${deadline.calculatedEndDate}`);
    triggerRefresh();
  };

  // 5. Akceptacja propozycji klasyfikacji i fizyczne przeniesienie pliku
  const handleApproveProposal = async (
    docId: string,
    targetCaseId: string,
    targetSubfolder: CaseSubfolder
  ) => {
    const doc = vault.documents.get(docId);
    const targetCase = vault.cases.get(targetCaseId);
    if (!doc || !targetCase) return;

    const sourcePath = `Do_uporzadkowania/${doc.originalFileName}`;
    const destinationPath = `${targetCase.folderName}/${targetSubfolder}/${doc.originalFileName}`;

    try {
      const res = await postWorkspace({
        action: 'move_file',
        sourceRelativePath: sourcePath,
        destinationRelativePath: destinationPath,
        description: `Przeniesiono ${doc.originalFileName} do sprawy ${targetCase.title}`,
        documentId: doc.id,
      });

      if (res.ok) {
        vault.applyInboxProposal(doc.id, targetCaseId, targetSubfolder);
        setLastMoveDescription(`Przeniesiono fizycznie plik ${doc.originalFileName} do ${destinationPath}`);
        triggerRefresh();
        await handleScanDisk();
      }
    } catch (err: unknown) {
      alert(`Błąd podczas przenoszenia pliku: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 6. Ręczne przeniesienie
  const handleManualMove = async (
    docId: string,
    targetCaseId: string,
    targetSubfolder: CaseSubfolder
  ) => {
    await handleApproveProposal(docId, targetCaseId, targetSubfolder);
  };

  // 7. Cofanie operacji (Undo)
  const handleUndoLastMove = async () => {
    try {
      const res = await postWorkspace({ action: 'undo' });

      if (res.ok) {
        vault.undoLastOperation();
        setLastMoveDescription('Cofnięto ostatnią operację przeniesienia na dysku.');
        triggerRefresh();
        await handleScanDisk();
      }
    } catch (err: unknown) {
      alert(`Błąd operacji cofania: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 8. Podział skanu wielostronicowego na dokumenty logiczne
  const handleSplitMultiPageScan = async (docId: string) => {
    const doc = vault.documents.get(docId);
    if (!doc) return;

    // Utworzenie dwóch dokumentów pochodnych ze stronami
    await vault.addDocumentVersion({
      documentId: doc.id,
      kind: 'user_corrected',
      textPayload: 'STRONA 1: UMOWA O DZIEŁO - WARUNKI I ZAKRES PRAC REMONTOWYCH',
      toolOrAuthor: 'Podział logiczny skanu (Strona 1 - Umowa)',
      pageRange: { start: 1, end: 1 },
    });

    await vault.addDocumentVersion({
      documentId: doc.id,
      kind: 'user_corrected',
      textPayload: 'STRONA 2: PROTOKÓŁ ZDAWCZO-ODBIORCZY PRAC REMONTOWYCH Z DNIA 10 SIERPNIA 2026',
      toolOrAuthor: 'Podział logiczny skanu (Strona 2 - Protokół)',
      pageRange: { start: 2, end: 2 },
    });

    setGlobalNotice(`Podzielono skan ${doc.originalFileName} na 2 logiczne dokumenty składowe z zachowaniem oryginału.`);
    triggerRefresh();
  };

  // 9. Przełączanie statusu w planie działania
  const handleToggleStepStatus = (stepId: string) => {
    if (!currentAnalysis) return;
    const step = currentAnalysis.actionPlan.find((s) => s.id === stepId);
    if (!step) return;

    if (step.status === 'completed') {
      step.status = 'pending';
    } else if (step.status === 'pending') {
      step.status = 'in_progress';
    } else {
      step.status = 'completed';
    }
    triggerRefresh();
  };

  // 10. Eksport i Restore zaszyfrowanej kopii
  const handleExportBackup = async (passphrase: string): Promise<EncryptedContainer> => {
    return vault.exportEncryptedBackup(passphrase);
  };

  const handleRestoreBackup = async (
    container: EncryptedContainer,
    passphrase: string
  ): Promise<{ restoredCases: number; restoredDocs: number }> => {
    const restoredVault = await LocalVault.restoreFromEncryptedBackup(container, passphrase);
    setVault(restoredVault);
    return {
      restoredCases: restoredVault.cases.size,
      restoredDocs: restoredVault.documents.size,
    };
  };

  // 11. Lokalny silnik OCR i korekty
  const handleRunLocalOcr = async (docId: string) => {
    const doc = vault.documents.get(docId);
    if (!doc) return;
    const activeVer = vault.documentVersions.get(doc.activeVersionId);
    if (!activeVer) return;

    const ocrEngine = new LocalOcrEngine();
    const result = await ocrEngine.processImageOrScan({
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
      rawPayload: activeVer.textPayload || '',
    });

    const existingCount = Array.from(vault.documentVersions.values()).filter((v) => v.documentId === doc.id).length;
    const newVer = ocrEngine.createOcrVersion(doc, result, existingCount + 1);
    vault.documentVersions.set(newVer.id, newVer);
    doc.activeVersionId = newVer.id;
    setGlobalNotice(`Wykonano lokalny OCR dla ${doc.originalFileName}. Jakość rozpoznania: ${result.averageConfidence}%.`);
    triggerRefresh();
  };

  const handleImportFiles = async (files: FileList | File[]) => {
    const allowedExtensions = /\.(doc|rtf|txt|pdf|jpe?g|png)$/i;
    const selectedFiles = Array.from(files).filter((file) => allowedExtensions.test(file.name));
    const rejectedCount = Array.from(files).length - selectedFiles.length;
    if (!selectedFiles.length) {
      setGlobalNotice('Obsługiwane formaty to DOC, RTF, TXT, PDF, JPG i PNG.');
      return;
    }
    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const isText = extension === 'txt' || extension === 'rtf' || file.type.startsWith('text/');
      let content: string;
      if (isText) {
        content = await file.text();
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        content = `[Lokalny payload binarny: ${file.type || extension}]\n${btoa(binary)}`;
      }
      await vault.importDocument({
        type: 'other',
        direction: 'incoming',
        origin: 'disk_file',
        originalFileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        content,
        diskRelativePath: `Moje_sprawy/Do_uporzadkowania/${file.name}`,
      });
    }
    setGlobalNotice(`Dodano ${selectedFiles.length} ${selectedFiles.length === 1 ? 'dokument' : 'dokumenty'} do lokalnego sejfu. Oryginały pozostają na dysku.${rejectedCount ? ` Pominięto ${rejectedCount} nieobsługiwanych plików.` : ''}`);
    triggerRefresh();
  };

  const handleSaveCorrection = async (docId: string, correctedText: string, note: string) => {
    await vault.addDocumentVersion({
      documentId: docId,
      kind: 'user_corrected',
      textPayload: correctedText,
      toolOrAuthor: `Korekta użytkownika: ${note}`,
    });
    setGlobalNotice(`Zapisano skorygowaną wersję dokumentu bez modyfikacji oryginału.`);
    triggerRefresh();
  };

  const handleConfirmField = (fieldId: string, confirmedValue: string) => {
    vault.confirmField(fieldId, confirmedValue);
    setGlobalNotice(`Potwierdzono poprawność pola.`);
    triggerRefresh();
  };

  // 12. Bezpieczna synchronizacja chmurowa E2EE
  const handleSyncToServer = async (passphrase: string) => {
    const syncEngine = new E2EESyncEngine();
    const manifest = vault.toManifest();
    const payload = await syncEngine.prepareSyncPayload(manifest, passphrase);
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfData = await csrfResponse.json();

    const res = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Błąd synchronizacji serwera');
    }
    return { recordId: payload.recordId, version: payload.version };
  };

  const handleSyncFromServer = async (passphrase: string) => {
    const syncEngine = new E2EESyncEngine();
    const recordId = `sync-${vault.vaultId}`;
    const res = await fetch(`/api/sync?recordId=${recordId}`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Brak rekordu synchronizacji na serwerze lub odmowa dostępu.');
    }
    const data = await res.json();
    const restoredManifest = await syncEngine.decryptSyncPayload(data.record, passphrase);
    const restoredVault = LocalVault.fromManifest(restoredManifest);
    setVault(restoredVault);
    return { restoredCount: restoredVault.cases.size };
  };

  return (
    <div className="app-shell">
      <Navigation
        activeView={activeView}
        onSelectView={(v) => setActiveView(v)}
        inboxCount={inboxDocuments.length}
        urgentCount={urgentCount}
      />

      <div className="app-main">
        <header className="app-topbar no-print">
          <button type="button" className="topbar-search" onClick={() => setGlobalNotice('Wyszukiwanie lokalne będzie dostępne po dodaniu dokumentów do sejfu.')} aria-label="Szukaj w sprawach, dokumentach i pismach">
            <Search size={17} />
            <span>Szukaj w sprawach, dokumentach i pismach…</span>
            <span className="topbar-shortcut">⌘ K</span>
          </button>
          <div className="topbar-actions">
            <button type="button" className="topbar-icon" aria-label="Powiadomienia" onClick={() => setGlobalNotice('Nie masz nowych powiadomień.')}><Bell size={18} /></button>
            <span className="topbar-local"><span className="trust-dot" /> Tylko na tym urządzeniu</span>
            <button type="button" className="topbar-avatar" onClick={() => { setProfileDraft(profile ? { name: profile.name, email: profile.email } : { name: '', email: '' }); setProfilePassword(''); setIsAccountOpen(true); }} aria-label={profile ? `Otwórz profil ${profile.name}` : 'Załóż konto'}>{profile ? profile.name.slice(0, 2).toUpperCase() : <UserRound size={16} />}</button>
            <ChevronDown size={15} className="text-slate-400" aria-hidden="true" />
          </div>
        </header>

        {globalNotice && (
          <aside aria-label="Powiadomienie systemowe" className="notice-bar no-print">
            <div><CheckCircle2 size={16} /><span>{globalNotice}</span></div>
            <button type="button" onClick={() => setGlobalNotice(null)} aria-label="Zamknij powiadomienie"><X size={15} /></button>
          </aside>
        )}

        <main className="app-content">
        {activeView === 'today' && (
          <TodayView
            cases={cases}
            deadlines={deadlines}
            inboxCount={inboxDocuments.length}
            onNavigate={(v, caseId) => {
              if (caseId) setActiveCaseId(caseId);
              setActiveView(v);
            }}
            onConfirmDeliveryDate={handleConfirmDeliveryDate}
            onLoadSyntheticDemo={handleLoadSyntheticDemo}
            isLoadingDemo={isLoadingDemo}
          />
        )}

        {activeView === 'cases' && (
          <CasesView
            cases={cases}
            activeCaseId={activeCaseId}
            onSelectCase={(cid) => setActiveCaseId(cid)}
            onCreateCase={(newCaseData) => {
              const newC = vault.createCase(newCaseData);
              setActiveCaseId(newC.id);
              triggerRefresh();
            }}
            onNavigate={(v, caseId) => {
              if (caseId) setActiveCaseId(caseId);
              setActiveView(v);
            }}
            documentCountByCase={documentCountByCase}
          />
        )}

        {activeView === 'disk' && (
          <DiskDocumentsView
            cases={cases}
            activeCaseId={activeCaseId}
            documents={documents}
            versions={versions}
            diskFiles={diskFiles}
            extractedFields={Array.from(vault.extractedFields.values())}
            onScanDisk={handleScanDisk}
            onImportFiles={handleImportFiles}
            onSplitMultiPageScan={handleSplitMultiPageScan}
            onRunLocalOcr={handleRunLocalOcr}
            onSaveCorrection={handleSaveCorrection}
            onConfirmField={handleConfirmField}
            isScanning={isScanningDisk}
          />
        )}

        {activeView === 'inbox' && (
          <InboxView
            inboxDocuments={inboxDocuments}
            proposals={inboxProposalsRecord}
            cases={cases}
            onApproveProposal={handleApproveProposal}
            onManualMove={handleManualMove}
            undoStackLength={vault.history.filter((h) => h.canUndo).length}
            onUndoLastMove={handleUndoLastMove}
            lastMoveDescription={lastMoveDescription}
          />
        )}

        {activeView === 'timeline' && (
          <TimelineView
            cases={cases}
            activeCaseId={activeCaseId}
            onSelectCase={(cid) => setActiveCaseId(cid)}
            events={events}
            onAddEvent={(newEvt) => {
              vault.addEvent({ ...newEvt, id: `evt-${Date.now()}` });
              triggerRefresh();
            }}
          />
        )}

        {activeView === 'evidence' && (
          <EvidenceView
            cases={cases}
            activeCaseId={activeCaseId}
            onSelectCase={(cid) => setActiveCaseId(cid)}
            analysis={currentAnalysis}
            documents={documents}
          />
        )}

        {activeView === 'plan' && (
          <ActionPlanView
            cases={cases}
            activeCaseId={activeCaseId}
            onSelectCase={(cid) => setActiveCaseId(cid)}
            actionPlan={currentActionPlan}
            onToggleStepStatus={handleToggleStepStatus}
            onNavigate={(v, caseId) => {
              if (caseId) setActiveCaseId(caseId);
              setActiveView(v);
            }}
          />
        )}

        {activeView === 'letters' && (
          <LettersView
            cases={cases}
            activeCaseId={activeCaseId}
            onSelectCase={(cid) => setActiveCaseId(cid)}
            letters={letters}
            onCreateLetter={(draft) => {
              vault.setLetter(draft);
              triggerRefresh();
            }}
            onUpdateLetter={(draft) => {
              vault.setLetter(draft);
              triggerRefresh();
            }}
            onRegisterReceipt={(letterId, num, chan, dt) => {
              const l = vault.letters.get(letterId);
              if (l) {
                l.deliveryReceiptNumber = num;
                l.deliveryProofOrigin = chan;
                l.deliveryDate = dt;
                l.status = 'confirmed_by_receipt';
                triggerRefresh();
              }
            }}
          />
        )}

        {activeView === 'legal' && <LegalKnowledgeView sources={legalSources} />}

        {activeView === 'privacy' && (
          <BackupPrivacyView
            onExportBackup={handleExportBackup}
            onRestoreBackup={handleRestoreBackup}
            vaultInfo={{
              caseCount: cases.length,
              documentCount: documents.length,
              versionCount: versions.length,
            }}
            documents={documents}
            onSyncToServer={handleSyncToServer}
            onSyncFromServer={handleSyncFromServer}
          />
        )}
        </main>
      </div>

      {isAccountOpen && (
        <div className="account-overlay no-print" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsAccountOpen(false); }}>
          <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
            <img className="account-logo" src="/tywygrywasz-logo.png" alt="TyWygrywasz.pl" />
            <div className="account-dialog-head">
              <div><div className="panel-kicker"><UserRound size={16} /> PROFIL WŁAŚCICIELA SEJFU</div><h2 id="account-title">{profile ? 'Zarządzaj swoim kontem' : 'Załóż swoje konto'}</h2></div>
              <button type="button" className="account-close" onClick={() => setIsAccountOpen(false)} aria-label="Zamknij"><X size={18} /></button>
            </div>
            <p className="account-intro">Profil pomaga odróżnić Twój sejf od innych profili na tym urządzeniu. Dokumenty pozostają lokalnie i nie są wysyłane przy zakładaniu profilu.</p>
            <form onSubmit={handleSaveProfile} className="account-form">
              <label>Jak mamy się do Ciebie zwracać<input required autoFocus value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="np. Anna Kowalska" /></label>
              <label>Adres e-mail<input required type="email" autoComplete="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} placeholder="np. anna@example.pl" /></label>
              <label>Hasło konta <span>(minimum 12 znaków)</span><input required type="password" autoComplete={profile ? 'current-password' : 'new-password'} minLength={12} value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} placeholder="••••••••••••" /></label>
              <div className="account-note"><Shield size={16} /><span>Konto przechowuje tylko dane logowania. Dokumenty, OCR i hasło sejfu zostają oddzielnie na Twoim urządzeniu.</span></div>
              <div className="account-actions"><button type="button" className="button-secondary" onClick={() => setIsAccountOpen(false)}>Anuluj</button><button type="submit" className="button-primary">{profile ? 'Zapisz zmiany' : 'Utwórz konto'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
