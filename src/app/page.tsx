'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
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
  ArrowRight,
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
  parseVaultManifest,
} from '../domain/types';
import { SYNTHETIC_DATASET } from '../domain/synthetic-data';
import { calculateKpaDeadline } from '../domain/deadlines';
import { OFFICIAL_LEGAL_SOURCES } from '../domain/legal-knowledge';
import { buildCompleteCaseAnalysis } from '../domain/case-analysis';
import { IntelligentClassifier } from '../domain/intelligent-classifier';
import { EncryptedContainer, decryptVault, wrapVaultKey, type VaultKeyEnvelope } from '../domain/crypto';
import { LocalOcrEngine } from '../domain/ocr-engine';
import { E2EESyncEngine } from '../domain/sync-engine';
import { EncryptedBrowserDocumentStorage, requestPersistentBrowserStorage } from '../domain/browser-storage';
import { computeSha256 } from '../domain/crypto';
import { createVaultAccess, encodeRecoveryKey, unlockVaultAccess } from '../domain/vault-access';

const VAULT_ENVELOPE_PREFIX = 'tywygrywasz-key-envelope-';
const LEGACY_VAULT_KEY_PREFIX = 'tywygrywasz-vault-key-';

export default function TyWygrywaszApp() {
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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultRecoveryKey, setVaultRecoveryKey] = useState('');
  const [vaultKeyMaterial, setVaultKeyMaterial] = useState<Uint8Array | null>(null);
  const [vaultHydrated, setVaultHydrated] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [documentStorage, setDocumentStorage] = useState(() => new EncryptedBrowserDocumentStorage({ vaultId: 'sejf-lokalny-01' }));

  useEffect(() => {
    const stored = window.localStorage.getItem('obywatel-profile');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { id: string; name: string; email: string };
        setProfile(parsed);
        setProfileDraft({ name: parsed.name, email: parsed.email });
        // The envelope is intentionally not unwrapped during app startup.
        // Opening the account dialog and entering the account password is the
        // explicit unlock step; no raw vault key is persisted.
        setVaultHydrated(false);
        setGlobalNotice('Sejf jest zablokowany. Otwórz konto i podaj hasło, aby odblokować dokumenty na tym urządzeniu.');
        setIsAccountOpen(true);
      } catch {
        window.localStorage.removeItem('obywatel-profile');
        setVaultHydrated(true);
      }
    }
    void fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.user) return;
        const next = { id: data.user.id, name: data.user.name, email: data.user.email };
        setProfile(next);
        setProfileDraft({ name: next.name, email: next.email });
        window.localStorage.setItem('obywatel-profile', JSON.stringify(next));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !profile) {
      const localKey = crypto.getRandomValues(new Uint8Array(32));
      setVaultKeyMaterial(localKey);
      setVaultRecoveryKey(encodeRecoveryKey(localKey));
      setVaultPassphrase(encodeRecoveryKey(localKey));
      setDocumentStorage(new EncryptedBrowserDocumentStorage({ vaultId: 'sejf-lokalny-01', vaultKey: localKey }));
    }
  }, [profile]);

  useEffect(() => {
    void requestPersistentBrowserStorage();
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
      }
      if (event.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!profile || !vaultPassphrase || !vaultHydrated || typeof window === 'undefined') return;
    let cancelled = false;
    void vault.exportEncryptedBackup(vaultPassphrase).then((container) => {
      if (!cancelled) window.localStorage.setItem(`tywygrywasz-vault-${profile.id}`, JSON.stringify(container));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [vault, profile, vaultPassphrase, vaultHydrated]);

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authMode === 'register' && (cases.length > 0 || documents.length > 0)) {
      setGlobalNotice('Najpierw wykonaj lokalną kopię sejfu. Nie przypisuję istniejących dokumentów do nowego konta automatycznie.');
      return;
    }
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
      const csrfData = await csrfResponse.json();
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = authMode === 'login'
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

      const nextProfile = { id: authData.user.id, name: authData.user.name, email: authData.user.email };
      if (authMode === 'login' && profile?.id === nextProfile.id && profileDraft.name.trim() && profileDraft.name.trim() !== authData.user.name) {
        nextProfile.name = profileDraft.name.trim();
        await fetch('/api/auth/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
          body: JSON.stringify({ name: nextProfile.name }),
        });
      }
      window.localStorage.setItem('obywatel-profile', JSON.stringify(nextProfile));
      setProfile(nextProfile);
      const envelopeStorageName = `${VAULT_ENVELOPE_PREFIX}${nextProfile.id}`;
      const legacyKeyStorageName = `${LEGACY_VAULT_KEY_PREFIX}${nextProfile.id}`;
      const storedEnvelope = window.localStorage.getItem(envelopeStorageName);
      const legacyRecoveryKey = window.localStorage.getItem(legacyKeyStorageName);
      let vaultKey: Uint8Array;
      let envelope: VaultKeyEnvelope;
      if (storedEnvelope) {
        envelope = JSON.parse(storedEnvelope) as VaultKeyEnvelope;
        vaultKey = await unlockVaultAccess(envelope, profilePassword);
      } else if (legacyRecoveryKey) {
        // One-time migration from the old local-only key format.
        vaultKey = await unlockVaultAccess({} as VaultKeyEnvelope, legacyRecoveryKey);
        // Re-wrap the migrated key with the account password.
        envelope = await wrapVaultKey(vaultKey, profilePassword);
        window.localStorage.removeItem(legacyKeyStorageName);
      } else {
        const access = await createVaultAccess(profilePassword);
        vaultKey = access.key;
        envelope = access.envelope;
      }
      window.localStorage.setItem(envelopeStorageName, JSON.stringify(envelope));
      const storedRecoveryKey = encodeRecoveryKey(vaultKey);
      setVaultKeyMaterial(vaultKey);
      setVaultRecoveryKey(storedRecoveryKey);
      setVaultPassphrase(storedRecoveryKey);
      setVaultHydrated(false);
      setDocumentStorage(new EncryptedBrowserDocumentStorage({ vaultId: `sejf-${nextProfile.id}`, vaultKey }));
      setVault(new LocalVault(`sejf-${nextProfile.id}`));
      const storedVault = window.localStorage.getItem(`tywygrywasz-vault-${nextProfile.id}`);
      if (storedVault) {
        try {
          let restoredJson: string;
          try {
            restoredJson = await decryptVault(JSON.parse(storedVault) as EncryptedContainer, storedRecoveryKey);
          } catch {
            // Backward compatibility for backups created before key separation.
            restoredJson = await decryptVault(JSON.parse(storedVault) as EncryptedContainer, profilePassword);
          }
          const restoredManifest = parseVaultManifest(JSON.parse(restoredJson));
          setVault(LocalVault.fromManifest(restoredManifest));
          setGlobalNotice('Zalogowano i odtworzono lokalny sejf. Klucz sejfu jest oddzielony od hasła konta.');
        } catch {
          setGlobalNotice('Zalogowano. Lokalny sejf wymaga importu kopii zapasowej.');
        }
      }
      setProfilePassword('');
      setVaultHydrated(true);
      setIsAccountOpen(false);
      if (!storedVault) setGlobalNotice(authMode === 'login' ? 'Zalogowano. Utwórz lub odtwórz swój lokalny sejf.' : 'Konto utworzone. Dokumenty zostają w zaszyfrowanym sejfie tego urządzenia.');
    } catch (error) {
      setGlobalNotice(error instanceof Error ? error.message : 'Nie udało się zapisać konta.');
    }
  };

  const handleLogout = async () => {
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
      const csrfData = await csrfResponse.json();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': csrfData.csrfToken } });
    } finally {
      setProfile(null);
      vaultKeyMaterial?.fill(0);
      setVaultKeyMaterial(null);
      setVaultPassphrase('');
      setVault(new LocalVault('sejf-lokalny-01'));
      setVaultRecoveryKey('');
      setVaultHydrated(true);
      documentStorage.clearVaultKey();
      setDocumentStorage(new EncryptedBrowserDocumentStorage({ vaultId: 'sejf-lokalny-01' }));
      window.localStorage.removeItem('obywatel-profile');
      setIsAccountOpen(false);
      setGlobalNotice('Wylogowano. Dane konta pozostały w zaszyfrowanym sejfie urządzenia.');
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

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [] as Array<{ type: 'case' | 'document' | 'letter'; id: string; title: string; detail: string; view: ViewType; caseId?: string }>;
    const results: Array<{ type: 'case' | 'document' | 'letter'; id: string; title: string; detail: string; view: ViewType; caseId?: string }> = [];
    cases.forEach((item) => {
      const institutionText = item.institutions?.map((institution) => institution.name).join(' ') || item.authorityOrOpponentName || '';
      if (`${item.id} ${item.title} ${item.goalDescription} ${institutionText}`.toLowerCase().includes(query)) {
        results.push({ type: 'case', id: item.id, title: item.title, detail: `${item.id} · ${institutionText || 'bez wskazanej instytucji'}`, view: 'cases', caseId: item.id });
      }
    });
    documents.forEach((item) => {
      const version = versions.find((candidate) => candidate.id === item.activeVersionId);
      if (`${item.originalFileName} ${item.diskRelativePath || ''} ${version?.textPayload || ''} ${item.originalSha256}`.toLowerCase().includes(query)) {
        results.push({ type: 'document', id: item.id, title: item.originalFileName, detail: item.diskRelativePath || 'Dokument lokalny', view: 'disk', caseId: item.caseIds[0] });
      }
    });
    letters.forEach((item) => {
      if (`${item.title} ${item.recipient.name} ${item.caseSignature}`.toLowerCase().includes(query)) {
        results.push({ type: 'letter', id: item.id, title: item.title, detail: `Pismo do: ${item.recipient.name}`, view: 'letters', caseId: item.caseId });
      }
    });
    return results.slice(0, 20);
  }, [cases, documents, letters, searchQuery, versions]);

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
        legalSources: Array.from(vault.legalSources.values()),
      });
      vault.setLegalAnalysis(analysis1);

      // Kompleksowa analiza dla S-0002
      const analysis2 = buildCompleteCaseAnalysis({
        caseRecord: case2,
        documents: Array.from(vault.documents.values()).filter((d) => d.caseIds.includes('S-0002')),
        extractedFields: [],
        events: Array.from(vault.events.values()).filter((e) => e.caseId === 'S-0002'),
        deadlines: [],
        legalSources: Array.from(vault.legalSources.values()),
      });
      vault.setLegalAnalysis(analysis2);

      // Kompleksowa analiza dla S-0003
      const analysis3 = buildCompleteCaseAnalysis({
        caseRecord: case3,
        documents: Array.from(vault.documents.values()).filter((d) => d.caseIds.includes('S-0003')),
        extractedFields: [],
        events: Array.from(vault.events.values()).filter((e) => e.caseId === 'S-0003'),
        deadlines: [],
        legalSources: Array.from(vault.legalSources.values()),
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

  const handleUpdateCase = (caseId: string, patch: Partial<Case>) => {
    const caseRecord = vault.cases.get(caseId);
    if (!caseRecord) return;
    Object.assign(caseRecord, patch, { updatedAt: new Date().toISOString() });
    setGlobalNotice('Zaktualizowano dane instytucji w sprawie.');
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
    const originalBytes = await documentStorage.getBytes(doc.id);
    const result = await ocrEngine.processImageOrScan({
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
      rawPayload: originalBytes || activeVer.textPayload || '',
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
      const rawBytes = new Uint8Array(await file.arrayBuffer());
      const originalSha256 = await computeSha256(rawBytes);
      let content: string;
      if (isText) {
        content = await file.text();
      } else {
        // Keep binary originals in IndexedDB. The encrypted manifest carries
        // only a small locator, so large PDFs/scans never inflate localStorage.
        content = `[Oryginał zapisany lokalnie w magazynie przeglądarki: ${file.type || extension}]`;
      }
      const imported = await vault.importDocument({
        type: 'other',
        direction: 'incoming',
        origin: 'disk_file',
        originalFileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        content,
        originalSha256,
        fileSize: rawBytes.byteLength,
        diskRelativePath: `Moje_sprawy/Do_uporzadkowania/${file.name}`,
      });
      try {
        await documentStorage.putDocument({
          documentId: imported.document.id,
          originalFileName: file.name,
          mimeType: file.type || undefined,
          bytes: rawBytes,
        });
      } catch (error) {
        vault.documents.delete(imported.document.id);
        vault.documentVersions.delete(imported.initialVersion.id);
        throw error;
      }
    }
    setGlobalNotice(`Dodano ${selectedFiles.length} ${selectedFiles.length === 1 ? 'dokument' : 'dokumenty'} do sejfu. Oryginały są w trwałym magazynie przeglądarki, a manifest pozostaje zaszyfrowany.${rejectedCount ? ` Pominięto ${rejectedCount} nieobsługiwanych plików.` : ''}`);
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
    const recordId = `sync-${vault.vaultId}`;
    const existingResponse = await fetch(`/api/sync?recordId=${encodeURIComponent(recordId)}`, { credentials: 'include' });
    let expectedVersion: number | undefined;
    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      expectedVersion = Number(existingData.record?.version);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('Serwer zwrócił nieprawidłową wersję synchronizacji.');
    } else if (existingResponse.status !== 404) {
      throw new Error('Nie udało się odczytać wersji synchronizacji.');
    } else {
      expectedVersion = 0;
    }
    const payload = await syncEngine.prepareSyncPayload(manifest, passphrase, { expectedVersion });
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
      if (res.status === 409 || errData.code === 'SYNC_CONFLICT') {
        throw new Error('Sejf został zmieniony na innym urządzeniu. Najpierw pobierz najnowszą wersję i sprawdź różnice.');
      }
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
        onHome={() => { setActiveView('today'); setActiveCaseId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        inboxCount={inboxDocuments.length}
        urgentCount={urgentCount}
      />

      <div className="app-main">
        <header className="app-topbar no-print">
          <button type="button" className="topbar-search" onClick={() => setIsSearchOpen(true)} aria-label="Szukaj w sprawach, dokumentach i pismach">
            <Search size={17} />
            <span>Szukaj w sprawach, dokumentach i pismach…</span>
            <span className="topbar-shortcut">⌘ K</span>
          </button>
          <div className="topbar-actions">
            <button type="button" className="topbar-icon" aria-label="Powiadomienia" onClick={() => setGlobalNotice('Nie masz nowych powiadomień.')}><Bell size={18} /></button>
            <span className="topbar-local"><span className="trust-dot" /> Tylko na tym urządzeniu</span>
            <button type="button" className="topbar-avatar" onClick={() => { setAuthMode('login'); setProfileDraft(profile ? { name: profile.name, email: profile.email } : { name: '', email: '' }); setProfilePassword(''); setIsAccountOpen(true); }} aria-label={profile ? `Otwórz profil ${profile.name}` : 'Zaloguj lub załóż konto'}>{profile ? profile.name.slice(0, 2).toUpperCase() : <UserRound size={16} />}</button>
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
            onUpdateCase={handleUpdateCase}
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
              <div><div className="panel-kicker"><UserRound size={16} /> PROFIL WŁAŚCICIELA SEJFU</div><h2 id="account-title">{profile ? 'Zarządzaj swoim kontem' : authMode === 'login' ? 'Zaloguj się do swojego konta' : 'Załóż swoje konto'}</h2></div>
              <button type="button" className="account-close" onClick={() => setIsAccountOpen(false)} aria-label="Zamknij"><X size={18} /></button>
            </div>
            <p className="account-intro">Profil pomaga odróżnić Twój sejf od innych profili na tym urządzeniu. Dokumenty pozostają lokalnie i nie są wysyłane przy zakładaniu profilu.</p>
            {profile && vaultRecoveryKey && <div className="account-note"><Shield size={16} /><span>Sejf używa osobnego klucza odzyskiwania. <button type="button" className="button-link" onClick={() => { const blob = new Blob([`TyWygrywasz.pl — klucz lokalnego sejfu\n\n${vaultRecoveryKey}\n\nPrzechowuj ten plik poza publicznymi usługami. Klucz nie jest hasłem konta.\n`], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'tywygrywasz-klucz-sejfu.txt'; link.click(); URL.revokeObjectURL(url); }}>Pobierz klucz odzyskiwania</button></span></div>}
            <form onSubmit={handleSaveProfile} className="account-form">
              {(authMode === 'register' || profile) && <label>Jak mamy się do Ciebie zwracać<input required autoFocus value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="np. Anna Kowalska" /></label>}
              <label>Adres e-mail<input required type="email" autoComplete="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} placeholder="np. anna@example.pl" /></label>
              <label>Hasło konta <span>(minimum 12 znaków)</span><input required type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={12} value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} placeholder="••••••••••••" /></label>
              <div className="account-note"><Shield size={16} /><span>Konto przechowuje tylko dane logowania. Dokumenty, OCR i hasło sejfu zostają oddzielnie na Twoim urządzeniu.</span></div>
              <div className="account-actions"><button type="button" className="button-secondary" onClick={() => setIsAccountOpen(false)}>Anuluj</button><button type="submit" className="button-primary">{authMode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button></div>
              {!profile && <button type="button" className="account-switch" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Nie masz konta? Załóż je' : 'Masz już konto? Zaloguj się'}</button>}
              {profile && <button type="button" className="account-switch" onClick={handleLogout}>Wyloguj się</button>}
            </form>
          </section>
        </div>
      )}

      {isSearchOpen && (
        <div className="account-overlay no-print" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSearchOpen(false); }}>
          <section className="account-dialog search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-title">
            <div className="account-dialog-head">
              <div><div className="panel-kicker"><Search size={16} /> LOKALNE WYSZUKIWANIE</div><h2 id="search-title">Znajdź w swoim sejfie</h2></div>
              <button type="button" className="account-close" onClick={() => setIsSearchOpen(false)} aria-label="Zamknij wyszukiwanie"><X size={18} /></button>
            </div>
            <label className="search-dialog-input"><Search size={18} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Sprawa, instytucja, nazwa pliku, treść OCR…" /></label>
            <p className="account-intro">Wyszukiwanie działa na tym urządzeniu. Przeszukuje nazwy plików, treść odczytanych wersji, sprawy, instytucje i pisma.</p>
            <div className="search-results" aria-live="polite">
              {searchQuery.trim() && searchResults.length === 0 && <div className="empty-panel"><Search size={18} /><span>Nic nie znaleziono. Spróbuj krótszego hasła.</span></div>}
              {!searchQuery.trim() && <div className="empty-panel"><Search size={18} /><span>Zacznij pisać, aby przeszukać lokalny sejf.</span></div>}
              {searchResults.map((result) => (
                <button key={`${result.type}-${result.id}`} type="button" className="search-result-row" onClick={() => { setActiveView(result.view); if (result.caseId) setActiveCaseId(result.caseId); setIsSearchOpen(false); }}>
                  <span className="search-result-kind">{result.type === 'case' ? 'SPRAWA' : result.type === 'document' ? 'DOKUMENT' : 'PISMO'}</span>
                  <span className="search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
