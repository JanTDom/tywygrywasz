'use client';

import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import {
  Shield,
  CheckCircle2,
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
import { LocalVaultUnlockDialog } from '../components/LocalVaultUnlockDialog';
import { exportPortableVaultBackup, openPortableVaultBackup, type PortableVaultBackup } from '../domain/vault-backup';

import { LocalVault } from '../domain/vault';
import {
  Case,
  CaseSubfolder,
  InboxProposal,
  DiskFileInfo,
  parseVaultManifest,
  VaultManifest,
} from '../domain/types';
import { SYNTHETIC_DATASET } from '../domain/synthetic-data';
import { calculateKpaDeadline } from '../domain/deadlines';
import { OFFICIAL_LEGAL_SOURCES } from '../domain/legal-knowledge';
import { buildCompleteCaseAnalysis } from '../domain/case-analysis';
import { IntelligentClassifier } from '../domain/intelligent-classifier';
import { EncryptedContainer, decryptVault, wrapVaultKey, type VaultKeyEnvelope } from '../domain/crypto';
import { LocalOcrEngine } from '../domain/ocr-engine';
import { validateRelink, verifyOriginalBytes } from '../domain/document-integrity';
import { extractFieldsFromText } from '../domain/extractor';
import { E2EESyncEngine, compareSyncManifests, type SyncManifestComparison } from '../domain/sync-engine';
import { syncCheckpointStorageKey, syncBaseStorageKey } from '../domain/sync-storage';
import { createOwnedDocumentStorage, openOwnedDocumentStorage, markOwnedDocumentStorageInitialized, requestPersistentBrowserStorage } from '../domain/browser-storage';
import { computeSha256 } from '../domain/crypto';
import { createVaultAccess, decodeRecoveryKey, encodeRecoveryKey, unlockVaultAccess, validateVaultPassword } from '../domain/vault-access';
import { AccountRecoveryPanel } from '../components/AccountRecoveryPanel';
import { splitLocalPdf } from '../domain/pdf-split';
import { SiteFooter } from '../components/SiteFooter';

const VAULT_ENVELOPE_PREFIX = 'tywygrywasz-key-envelope-';
const LEGACY_VAULT_KEY_PREFIX = 'tywygrywasz-vault-key-';
const LOCAL_VAULT_KEY_STORAGE = 'tywygrywasz-local-vault-key';
const LOCAL_VAULT_BACKUP_STORAGE = 'tywygrywasz-vault-local';
const LOCAL_VAULT_ENVELOPE_STORAGE = 'tywygrywasz-key-envelope-local';

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
  const [profile, setProfile] = useState<{ id: string; name: string; email: string; emailVerified?: boolean } | null>(null);
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '' });
  const [profilePassword, setProfilePassword] = useState('');
  const [accountVaultPassword, setAccountVaultPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const accountActionBusy = useRef(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultRecoveryKey, setVaultRecoveryKey] = useState('');
  const [vaultKeyMaterial, setVaultKeyMaterial] = useState<Uint8Array | null>(null);
  const [vaultHydrated, setVaultHydrated] = useState(false);
  const [localVaultMode, setLocalVaultMode] = useState<'create' | 'unlock' | 'migrate' | null>(null);
  const vaultOwnerEpoch = useRef(0);
  const [pendingSync, setPendingSync] = useState<{ manifest: VaultManifest; ownerEpoch: number; version: number; revision: string; comparison: SyncManifestComparison; direction: 'upload' | 'download'; passphrase?: string } | null>(null);
  const [hasSyncCheckpoint, setHasSyncCheckpoint] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [documentStorage, setDocumentStorage] = useState(() => createOwnedDocumentStorage({ ownerId: 'local', vaultId: 'sejf-lokalny-01' }));
  const renderedOwnerEpoch = vaultOwnerEpoch.current;
  const privateViewKey = JSON.stringify([profile?.id ?? 'local', vault.vaultId, vaultHydrated, renderedOwnerEpoch]);

  const clearPrivateViewState = () => {
    setSearchQuery('');
    setIsSearchOpen(false);
    setActiveCaseId(null);
    setDiskFiles([]);
    setLastMoveDescription(null);
    setGlobalNotice(null);
    setAccountVaultPassword('');
  };

  const assertCurrentVaultOperation = (epoch: number) => {
    if (vaultOwnerEpoch.current !== epoch) throw new Error('Sejf lub konto zmieniły się podczas operacji. Odblokuj właściwy sejf i ponów działanie.');
  };

  useEffect(() => {
    const controller = new AbortController();
    const ownerEpoch = vaultOwnerEpoch.current;
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
    void fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.user || controller.signal.aborted || vaultOwnerEpoch.current !== ownerEpoch) return;
        const next = { id: data.user.id, name: data.user.name, email: data.user.email, emailVerified: data.user.emailVerified };
        if (!stored) { setVaultHydrated(false); setIsAccountOpen(true); }
        setProfile(next);
        setProfileDraft({ name: next.name, email: next.email });
        window.localStorage.setItem('obywatel-profile', JSON.stringify(next));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || profile || window.localStorage.getItem('obywatel-profile')) {
      setLocalVaultMode(null);
      return;
    }
    // The raw legacy key is migrated only after the user selects a local password.
    // Startup never decrypts or overwrites the persisted manifest.
    setLocalVaultMode(window.localStorage.getItem(LOCAL_VAULT_ENVELOPE_STORAGE)
      ? 'unlock' : window.localStorage.getItem(LOCAL_VAULT_KEY_STORAGE) ? 'migrate' : 'create');
    setVaultHydrated(false);
  }, [profile]);

  const handleUnlockLocalVault = async (password: string) => {
    const ownerEpoch = ++vaultOwnerEpoch.current;
    clearPrivateViewState();
    setPendingSync(null);
    const storedEnvelope = window.localStorage.getItem(LOCAL_VAULT_ENVELOPE_STORAGE);
    const legacyKey = window.localStorage.getItem(LOCAL_VAULT_KEY_STORAGE);
    let key: Uint8Array;
    let envelope: VaultKeyEnvelope;
    if (storedEnvelope) {
      envelope = JSON.parse(storedEnvelope) as VaultKeyEnvelope;
      key = await unlockVaultAccess(envelope, password);
    } else if (legacyKey) {
      validateVaultPassword(password);
      key = decodeRecoveryKey(legacyKey);
      envelope = await wrapVaultKey(key, password);
    } else {
      const access = await createVaultAccess(password);
      key = access.key;
      envelope = access.envelope;
    }
    const recoveryKey = encodeRecoveryKey(key);
    const storedBackup = window.localStorage.getItem(LOCAL_VAULT_BACKUP_STORAGE);
    // Reject a corrupt/wrong-key manifest before persisting a new key or allowing auto-save.
    const restoredVault = storedBackup
      ? await LocalVault.restoreFromEncryptedBackup(JSON.parse(storedBackup) as EncryptedContainer, recoveryKey)
      : new LocalVault('sejf-lokalny-01');
    const ownedStorage = await openOwnedDocumentStorage({ ownerId: 'local', vaultId: restoredVault.vaultId, vaultKey: key });
    assertCurrentVaultOperation(ownerEpoch);
    window.localStorage.setItem(LOCAL_VAULT_ENVELOPE_STORAGE, JSON.stringify(envelope));
    window.localStorage.removeItem(LOCAL_VAULT_KEY_STORAGE);
    setVaultKeyMaterial(key);
    setVaultRecoveryKey(recoveryKey);
    setVaultPassphrase(recoveryKey);
    setDocumentStorage(ownedStorage);
    setVault(restoredVault);
    setHasSyncCheckpoint(Boolean(window.localStorage.getItem(syncCheckpointStorageKey('local', restoredVault.vaultId))));
    setVaultHydrated(true);
    setLocalVaultMode(null);
    setGlobalNotice('Odblokowano lokalny sejf. Klucz na urządzeniu jest chroniony hasłem.');
  };

  const handleLockVault = async () => {
    const ownerEpoch = ++vaultOwnerEpoch.current;
    setPendingSync(null);
    clearPrivateViewState();
    setVaultHydrated(false);
    documentStorage.clearVaultKey();
    vaultKeyMaterial?.fill(0);
    setVaultKeyMaterial(null);
    setVaultPassphrase('');
    setVaultRecoveryKey('');
    setVault(new LocalVault(profile ? `sejf-${profile.id}` : 'sejf-lokalny-01'));
    try {
      if (vaultPassphrase && vaultHydrated) {
        const container = await vault.exportEncryptedBackup(vaultPassphrase);
        assertCurrentVaultOperation(ownerEpoch);
        window.localStorage.setItem(profile ? `tywygrywasz-vault-${profile.id}` : LOCAL_VAULT_BACKUP_STORAGE, JSON.stringify(container));
      }
    } finally {
      // A save failure must not leave an explicitly locked view readable.
      if (vaultOwnerEpoch.current === ownerEpoch) {
        setPendingSync(null);
        if (profile) setIsAccountOpen(true);
        else setLocalVaultMode('unlock');
        setGlobalNotice('Sejf jest zablokowany. Dane zapisane na urządzeniu pozostają zaszyfrowane.');
      }
    }
    assertCurrentVaultOperation(ownerEpoch);
  };

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
    if (!vaultPassphrase || !vaultHydrated || typeof window === 'undefined') return;
    let cancelled = false;
    const ownerEpoch = vaultOwnerEpoch.current;
    void vault.exportEncryptedBackup(vaultPassphrase).then((container) => {
      if (cancelled || vaultOwnerEpoch.current !== ownerEpoch) return;
      const storageKey = profile ? `tywygrywasz-vault-${profile.id}` : LOCAL_VAULT_BACKUP_STORAGE;
      window.localStorage.setItem(storageKey, JSON.stringify(container));
    }).catch(() => { if (!cancelled && vaultOwnerEpoch.current === ownerEpoch) setGlobalNotice('Nie udało się zapisać lokalnego manifestu. Zachowaj otwartą kartę i wykonaj pełną kopię zapasową, zanim zamkniesz aplikację.'); });
    return () => { cancelled = true; };
  }, [vault, profile, vaultPassphrase, vaultHydrated]);

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accountActionBusy.current) return;
    if (authMode === 'register' && (cases.length > 0 || documents.length > 0)) {
      setGlobalNotice('Najpierw wykonaj lokalną kopię sejfu. Nie przypisuję istniejących dokumentów do nowego konta automatycznie.');
      return;
    }
    accountActionBusy.current = true;
    setAccountBusy(true);
    let ownerEpoch = vaultOwnerEpoch.current;
    try {
      if (vaultHydrated) await handleLockVault();
      ownerEpoch = ++vaultOwnerEpoch.current;
      clearPrivateViewState();
      setPendingSync(null);
      setVaultHydrated(false);
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
      assertCurrentVaultOperation(ownerEpoch);

      const nextProfile = { id: authData.user.id, name: authData.user.name, email: authData.user.email, emailVerified: authData.user.emailVerified };
      if (authMode === 'login' && profile?.id === nextProfile.id && profileDraft.name.trim() && profileDraft.name.trim() !== authData.user.name) {
        nextProfile.name = profileDraft.name.trim();
        await fetch('/api/auth/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
          body: JSON.stringify({ name: nextProfile.name }),
        });
      }
      assertCurrentVaultOperation(ownerEpoch);
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

      } else {
        const access = await createVaultAccess(profilePassword);
        vaultKey = access.key;
        envelope = access.envelope;
      }

      const storedRecoveryKey = encodeRecoveryKey(vaultKey);
      let restoredVault = new LocalVault(`sejf-${nextProfile.id}`);
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
          restoredVault = LocalVault.fromManifest(restoredManifest);
          setGlobalNotice('Zalogowano i odtworzono lokalny sejf. Klucz sejfu jest oddzielony od hasła konta.');
        } catch {
          throw new Error('Lokalnego sejfu nie można odblokować tym hasłem. Użyj dotychczasowego hasła sejfu, klucza odzyskiwania lub kopii. Zapisana kopia pozostaje zachowana.');
        }
      }
      const ownedStorage = await openOwnedDocumentStorage({ ownerId: nextProfile.id, vaultId: restoredVault.vaultId, vaultKey });
      assertCurrentVaultOperation(ownerEpoch);
      window.localStorage.setItem(envelopeStorageName, JSON.stringify(envelope));
      window.localStorage.removeItem(legacyKeyStorageName);
      setVaultKeyMaterial(vaultKey); setVaultRecoveryKey(storedRecoveryKey); setVaultPassphrase(storedRecoveryKey);
      setVault(restoredVault); setDocumentStorage(ownedStorage);
      setHasSyncCheckpoint(Boolean(window.localStorage.getItem(syncCheckpointStorageKey(nextProfile.id, restoredVault.vaultId))));
      setProfilePassword('');
      setVaultHydrated(true);
      setIsAccountOpen(false);
      if (!storedVault) setGlobalNotice(authMode === 'login' ? 'Zalogowano. Utwórz lub odtwórz swój lokalny sejf.' : `Konto utworzone. Dokumenty zostają w zaszyfrowanym sejfie tego urządzenia.${authData.emailCodesAvailable === false ? ' Wysyłka kodów e-mail jest teraz niedostępna; adres pozostaje niepotwierdzony.' : ''}`);
    } catch (error) {
      if (vaultOwnerEpoch.current !== ownerEpoch) return;
      documentStorage.clearVaultKey();
      vaultKeyMaterial?.fill(0);
      setVaultKeyMaterial(null); setVaultPassphrase(''); setVaultRecoveryKey('');
      setVault(new LocalVault('sejf-zablokowany')); setVaultHydrated(false);
      setGlobalNotice(error instanceof Error ? error.message : 'Nie udało się zapisać konta.');
    } finally {
      accountActionBusy.current = false;
      setAccountBusy(false);
    }
  };

  // Local decryption is separate from account authentication, including after account password reset.
  const handleUnlockAccountVault = async () => {
    if (!profile) return;
    const ownerEpoch = ++vaultOwnerEpoch.current;
    clearPrivateViewState();
    setPendingSync(null);
    try {
      const storedEnvelope = window.localStorage.getItem(`${VAULT_ENVELOPE_PREFIX}${profile.id}`);
      const storedManifest = window.localStorage.getItem(`tywygrywasz-vault-${profile.id}`);
      if (!storedEnvelope || !storedManifest) throw new Error('Brak lokalnego sejfu tego konta. Zaloguj się, aby utworzyć sejf lub odtworzyć kopię.');
      const key = await unlockVaultAccess(JSON.parse(storedEnvelope) as VaultKeyEnvelope, accountVaultPassword);
      const recoveryKey = encodeRecoveryKey(key);
      const restoredVault = await LocalVault.restoreFromEncryptedBackup(JSON.parse(storedManifest) as EncryptedContainer, recoveryKey);
      const ownedStorage = await openOwnedDocumentStorage({ ownerId: profile.id, vaultId: restoredVault.vaultId, vaultKey: key });
      assertCurrentVaultOperation(ownerEpoch);
      documentStorage.clearVaultKey(); vaultKeyMaterial?.fill(0);
      setDocumentStorage(ownedStorage);
      setVault(restoredVault); setVaultKeyMaterial(key); setVaultRecoveryKey(recoveryKey); setVaultPassphrase(recoveryKey);
      setHasSyncCheckpoint(Boolean(window.localStorage.getItem(syncCheckpointStorageKey(profile.id, restoredVault.vaultId))));
      setVaultHydrated(true); setAccountVaultPassword(''); setIsAccountOpen(false);
      setGlobalNotice('Odblokowano sejf lokalnie. Do synchronizacji potrzebna jest osobna aktywna sesja konta.');
    } catch (error) { if (vaultOwnerEpoch.current === ownerEpoch) setGlobalNotice(error instanceof Error ? error.message : 'Nie można odblokować lokalnego sejfu.'); }
  };

  const handleLogout = async () => {
    if (accountActionBusy.current) return;
    accountActionBusy.current = true;
    setAccountBusy(true);
    vaultOwnerEpoch.current += 1;
    clearPrivateViewState();
    setPendingSync(null);
    setHasSyncCheckpoint(false);
    let savedLocally = true;
    let loggedOutOnServer = false;
    try {
      if (vaultHydrated) {
        try { await handleLockVault(); }
        catch { savedLocally = false; }
      }
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include', signal: AbortSignal.timeout(10_000) });
      const csrfData = await csrfResponse.json();
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': csrfData.csrfToken }, signal: AbortSignal.timeout(10_000) });
      loggedOutOnServer = response.ok;
    } catch {
      // Local lock remains effective even when revoking the server session must be retried.
    } finally {
      vaultOwnerEpoch.current += 1;
      setProfile(null);
      vaultKeyMaterial?.fill(0);
      setVaultKeyMaterial(null);
      setVaultPassphrase('');
      setVault(new LocalVault('sejf-lokalny-01'));
      setVaultRecoveryKey('');
      setVaultHydrated(false);
      documentStorage.clearVaultKey();
      setDocumentStorage(createOwnedDocumentStorage({ ownerId: 'local', vaultId: 'sejf-lokalny-01' }));
      window.localStorage.removeItem('obywatel-profile');
      setIsAccountOpen(false);
      setGlobalNotice(`${loggedOutOnServer ? 'Wylogowano. Dane konta pozostały w zaszyfrowanym sejfie urządzenia.' : 'Sejf zablokowano. Nie udało się potwierdzić wylogowania na serwerze; ponów wylogowanie po odzyskaniu połączenia.'}${savedLocally ? '' : ' Nie udało się zapisać końcowego manifestu; na urządzeniu pozostał wcześniejszy zapis i zachowane pliki oryginalne.'}`);
      accountActionBusy.current = false;
      setAccountBusy(false);
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

  const persistImportedManifest = async (ownerEpoch: number) => {
    assertCurrentVaultOperation(ownerEpoch);
    if (!vaultHydrated || !vaultPassphrase) throw new Error('Odblokuj sejf przed zapisaniem importu.');
    const container = await vault.exportEncryptedBackup(vaultPassphrase);
    assertCurrentVaultOperation(ownerEpoch);
    window.localStorage.setItem(profile ? `tywygrywasz-vault-${profile.id}` : LOCAL_VAULT_BACKUP_STORAGE, JSON.stringify(container));
  };

  // Convert vault maps to arrays for UI
  const cases = vaultHydrated ? Array.from(vault.cases.values()) : [];
  const documents = vaultHydrated ? Array.from(vault.documents.values()) : [];
  const versions = vaultHydrated ? Array.from(vault.documentVersions.values()) : [];
  const deadlines = vaultHydrated ? Array.from(vault.deadlines.values()) : [];
  const events = vaultHydrated ? Array.from(vault.events.values()) : [];
  const letters = vaultHydrated ? Array.from(vault.letters.values()) : [];
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
  const currentCase = !vaultHydrated ? null : activeCaseId
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
      if (`${item.originalFileName} ${item.diskRelativePath || ''} ${version?.textPayload || ''} ${item.originalSha256} ${item.contextNote || ''}`.toLowerCase().includes(query)) {
        results.push({ type: 'document', id: item.id, title: item.originalFileName, detail: item.contextNote ? 'Dokument lokalny · zawiera prywatną notatkę' : (item.diskRelativePath || 'Dokument lokalny'), view: 'disk', caseId: item.caseIds[0] });
      }
    });
    letters.forEach((item) => {
      if (`${item.title} ${item.recipient.name} ${item.caseSignature} ${item.draftingNotes || ''}`.toLowerCase().includes(query)) {
        results.push({ type: 'letter', id: item.id, title: item.title, detail: item.draftingNotes ? `Pismo do: ${item.recipient.name} · zawiera wskazówki robocze` : `Pismo do: ${item.recipient.name}`, view: 'letters', caseId: item.caseId });
      }
    });
    return results.slice(0, 20);
  }, [cases, documents, letters, searchQuery, versions]);

  // Lokalny skan weryfikuje istniejące bajty; manifest nie trafia do API.
  const handleScanDisk = async () => {
    if (!vaultHydrated || !vaultKeyMaterial) {
      setGlobalNotice('Odblokuj sejf, aby sprawdzić lokalne pliki.');
      return;
    }
    setIsScanningDisk(true);
    const ownerEpoch = vaultOwnerEpoch.current;
    try {
      const present: DiskFileInfo[] = [];
      let missing = 0;
      let modified = 0;
      for (const doc of vault.documents.values()) {
        try {
          const bytes = await documentStorage.getBytes(doc.id);
          const status = await verifyOriginalBytes(doc, bytes);
          assertCurrentVaultOperation(ownerEpoch);
          doc.isMissingOnDisk = status === 'missing';
          if (status === 'missing') missing += 1;
          if (status === 'modified') modified += 1;
          if (bytes) present.push({ name: doc.originalFileName, relativePath: doc.diskRelativePath || '', size: bytes.byteLength, modifiedAt: doc.createdAt, isDirectory: false });
        } catch {
          assertCurrentVaultOperation(ownerEpoch);
          doc.isMissingOnDisk = true;
          missing += 1;
        }
      }
      assertCurrentVaultOperation(ownerEpoch);
      setDiskFiles(present);
      setGlobalNotice(`Sprawdzono lokalnie ${vault.documents.size} plików. Niedostępne: ${missing}; zmienione: ${modified}.`);
      triggerRefresh();
    } finally {
      if (vaultOwnerEpoch.current === ownerEpoch) setIsScanningDisk(false);
    }
  };

  // 3. Wczytanie 3 pełnych syntetycznych scenariuszy
  const handleLoadSyntheticDemo = async () => {
    if (!vaultHydrated) { setGlobalNotice('Odblokuj sejf, aby zapisać przykładowe sprawy na tym urządzeniu.'); return; }
    setIsLoadingDemo(true);
    setGlobalNotice('Wczytywanie 3 syntetycznych spraw do lokalnego, zaszyfrowanego sejfu…');

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

        await documentStorage.putDocument({
          documentId: document.id,
          originalFileName: item.fileName,
          mimeType: 'text/plain',
          bytes: new TextEncoder().encode(item.content),
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
      setGlobalNotice('Wczytano 3 sprawy syntetyczne. Dokumenty zapisano w zaszyfrowanym magazynie tej przeglądarki.');
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

  // Przypisanie zmienia lokalny widok metadanych, bez przenoszenia dowodu.
  const handleApproveProposal = async (docId: string, targetCaseId: string, targetSubfolder: CaseSubfolder) => {
    const proposal = Array.from(vault.inboxProposals.values()).find((item) => item.documentId === docId);
    if (!proposal) return;
    vault.applyInboxProposal(proposal.id, targetCaseId, targetSubfolder);
    setLastMoveDescription('Przypisano dokument do sprawy w lokalnym sejfie. Oryginał pozostał niezmieniony.');
    triggerRefresh();
  };
  const handleManualMove = handleApproveProposal;
  const handleUndoLastMove = async () => {
    if (vault.undoLastOperation()) {
      setLastMoveDescription('Cofnięto lokalne przypisanie dokumentu.');
      triggerRefresh();
    }
  };

  const handleSplitMultiPageScan = async (docId: string, ranges: Array<{ from: number; to: number; title: string }>) => {
    const ownerEpoch = vaultOwnerEpoch.current;
    const doc = vault.documents.get(docId);
    if (!doc) throw new Error('Dokument nie istnieje.');
    const sourceVersionId = Array.from(vault.documentVersions.values()).find((version) => version.documentId === docId && version.kind === 'original')?.id;
    if (!sourceVersionId) throw new Error('Brakuje wersji oryginalnej dokumentu. Odtwórz ją z pełnej kopii przed podziałem.');
    const original = await documentStorage.getBytes(docId);
    if (!original) throw new Error('Wskaż ponownie oryginał przed podziałem.');
    await validateRelink(doc, original);
    const parts = await splitLocalPdf(original, ranges);
    try { for (const part of parts) {
      const result = await new LocalOcrEngine().processDocument({ fileName: part.fileName, mimeType: 'application/pdf', rawPayload: part.bytes });
      const imported = await vault.importDocument({ caseId: doc.caseIds[0], type: doc.type, direction: doc.direction,
        origin: 'local_derivative', originalFileName: part.fileName, mimeType: 'application/pdf', content: result.fullText,
        fileSize: part.bytes.length, originalSha256: await computeSha256(part.bytes), contextNote: doc.contextNote,
        sourceDocumentId: docId, sourceVersionId, sourcePageRange: { start: part.from, end: part.to } });
      try { await documentStorage.putDocument({ documentId: imported.document.id, originalFileName: part.fileName, mimeType: 'application/pdf', bytes: part.bytes }); }
      catch (error) { vault.documents.delete(imported.document.id); vault.documentVersions.delete(imported.initialVersion.id); throw error; }
      imported.document.caseIds = [...doc.caseIds];
      const version = await new LocalOcrEngine().createOcrVersion(imported.document, result, 2);
      vault.documentVersions.set(version.id, version); imported.document.activeVersionId = version.id;
      extractFieldsFromText({ documentId: imported.document.id, versionId: version.id, text: result.fullText, sourceLines: result.lines }).fields.forEach((field) => vault.recordExtractedField(field));
    } } finally {
      if (vaultOwnerEpoch.current === ownerEpoch) {
        try { await persistImportedManifest(ownerEpoch); }
        finally { triggerRefresh(); }
      }
    }
    setGlobalNotice(`Utworzono ${parts.length} plików PDF z wybranych stron. Pochodne wskazują dokument i wersję źródłową; oryginał pozostał zachowany.`);
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
  const handleExportBackup = async (passphrase: string): Promise<PortableVaultBackup> => {
    if (!vaultKeyMaterial || !vaultHydrated) throw new Error('Najpierw odblokuj sejf.');
    const ownerEpoch = vaultOwnerEpoch.current;
    const backup = await exportPortableVaultBackup(vault, documentStorage, vaultKeyMaterial, passphrase);
    assertCurrentVaultOperation(ownerEpoch);
    return backup;
  };

  const handleRestoreBackup = async (container: unknown, passphrase: string): Promise<{ restoredCases: number; restoredDocs: number; restoredOriginals: number; legacy: boolean }> => {
    if (!vaultKeyMaterial || !vaultHydrated) throw new Error('Najpierw odblokuj lub utwórz lokalny sejf.');
    const ownerEpoch = vaultOwnerEpoch.current;
    validateVaultPassword(passphrase);
    const opened = await openPortableVaultBackup(container, passphrase);
    // IDB replaces all records in one transaction only after every original was validated.
    const restoredVault = opened.vault;
    const restoredStorage = createOwnedDocumentStorage({ ownerId: profile?.id ?? 'local', vaultId: restoredVault.vaultId, vaultKey: opened.key });
    const envelope = await wrapVaultKey(opened.key, passphrase);
    const recoveryKey = encodeRecoveryKey(opened.key);
    const manifestContainer = await restoredVault.exportEncryptedBackup(recoveryKey);
    const storageName = profile ? `tywygrywasz-vault-${profile.id}` : LOCAL_VAULT_BACKUP_STORAGE;
    const previousSnapshot = await restoredStorage.exportEncryptedSnapshot();
    const previousEnvelope = window.localStorage.getItem(profile ? `${VAULT_ENVELOPE_PREFIX}${profile.id}` : LOCAL_VAULT_ENVELOPE_STORAGE);
    const previousManifest = window.localStorage.getItem(storageName);
    assertCurrentVaultOperation(ownerEpoch);
    let localPersistenceStarted = false;
    try {
      await restoredStorage.importEncryptedSnapshot(opened.snapshot, { replaceExisting: true });
      assertCurrentVaultOperation(ownerEpoch);
      localPersistenceStarted = true;
      window.localStorage.setItem(profile ? `${VAULT_ENVELOPE_PREFIX}${profile.id}` : LOCAL_VAULT_ENVELOPE_STORAGE, JSON.stringify(envelope));
      window.localStorage.setItem(storageName, JSON.stringify(manifestContainer));
      markOwnedDocumentStorageInitialized({ ownerId: profile?.id ?? 'local', vaultId: restoredVault.vaultId });
    } catch (error) {
      // Atomic IDB replacement protects quota failures; restore persistence if another write failed.
      await restoredStorage.rollbackEncryptedSnapshot(previousSnapshot);
      if (localPersistenceStarted) {
        const envelopeName = profile ? `${VAULT_ENVELOPE_PREFIX}${profile.id}` : LOCAL_VAULT_ENVELOPE_STORAGE;
        if (previousEnvelope) window.localStorage.setItem(envelopeName, previousEnvelope); else window.localStorage.removeItem(envelopeName);
        if (previousManifest) window.localStorage.setItem(storageName, previousManifest); else window.localStorage.removeItem(storageName);
      }
      throw error;
    }
    vaultOwnerEpoch.current += 1;
    clearPrivateViewState();
    documentStorage.clearVaultKey();
    vaultKeyMaterial.fill(0);
    setVaultKeyMaterial(opened.key);
    setVaultRecoveryKey(recoveryKey);
    setVaultPassphrase(recoveryKey);
    setDocumentStorage(restoredStorage);
    setVault(restoredVault);
    // Sync checkpoints use the previous key; they cannot be reused after an intentional full restore.
    window.localStorage.removeItem(syncCheckpointStorageKey(profile?.id ?? 'local', restoredVault.vaultId));
    window.localStorage.removeItem(syncBaseStorageKey(profile?.id ?? 'local', restoredVault.vaultId));
    setHasSyncCheckpoint(false);
    setPendingSync(null);
    setGlobalNotice(`Odtworzono sejf. Hasło kopii jest teraz lokalnym hasłem odblokowania; zachowaj klucz odzyskiwania.${opened.legacy ? ' Starsza kopia zawiera metadane; wskaż brakujące oryginały.' : ''}`);
    return { restoredCases: restoredVault.cases.size, restoredDocs: restoredVault.documents.size, restoredOriginals: opened.originalCount, legacy: opened.legacy };
  };

  const handleRunLocalOcr = async (docId: string) => {
    if (!vaultHydrated) throw new Error('Odblokuj sejf przed odczytem OCR.');
    const ownerEpoch = vaultOwnerEpoch.current;
    const doc = vault.documents.get(docId);
    if (!doc) return;
    const activeVer = vault.documentVersions.get(doc.activeVersionId);
    if (!activeVer) return;

    const ocrEngine = new LocalOcrEngine();
    const originalBytes = await documentStorage.getBytes(doc.id);
    assertCurrentVaultOperation(ownerEpoch);
    if (!originalBytes) throw new Error('Brakuje oryginału. Wskaż ponownie plik przed odczytem OCR.');
    await validateRelink(doc, originalBytes);
    assertCurrentVaultOperation(ownerEpoch);
    const result = await ocrEngine.processImageOrScan({
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
      rawPayload: originalBytes,
    });
    assertCurrentVaultOperation(ownerEpoch);

    const existingCount = Array.from(vault.documentVersions.values()).filter((v) => v.documentId === doc.id).length;
    const newVer = await ocrEngine.createOcrVersion(doc, result, existingCount + 1);
    assertCurrentVaultOperation(ownerEpoch);
    vault.documentVersions.set(newVer.id, newVer);
    doc.activeVersionId = newVer.id;
    const extracted = extractFieldsFromText({ documentId: doc.id, versionId: newVer.id, text: result.fullText, sourceLines: result.lines });
    extracted.fields.forEach((field) => vault.recordExtractedField(field));
    setGlobalNotice(`Wykonano lokalny OCR dla ${doc.originalFileName}. Jakość rozpoznania: ${result.averageConfidence}%.`);
    triggerRefresh();
  };

  const handleImportFiles = async (files: FileList | File[], contextNote?: string) => {
    const ownerEpoch = vaultOwnerEpoch.current;
    const allowedExtensions = /\.(doc|rtf|txt|pdf|jpe?g|png)$/i;
    const selectedFiles = Array.from(files).filter((file) => allowedExtensions.test(file.name));
    const rejectedCount = Array.from(files).length - selectedFiles.length;
    if (!selectedFiles.length) {
      setGlobalNotice('Obsługiwane formaty to DOC, RTF, TXT, PDF, JPG i PNG.');
      return;
    }
    let duplicateCount = 0;
    let unreadableCount = 0;
    const classifier = new IntelligentClassifier();
    try { for (const file of selectedFiles) {
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
        contextNote,
        diskRelativePath: `Moje_sprawy/Do_uporzadkowania/${file.name}`,
      });
      if (imported.isDuplicate) duplicateCount += 1;
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

      let processedText = content;
      // Parser i OCR korzystają z zasobów dostarczonych razem z aplikacją.
      try {
        const localResult = await new LocalOcrEngine().processDocument({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          rawPayload: rawBytes,
        });
        processedText = localResult.fullText || content;
        const existingCount = Array.from(vault.documentVersions.values()).filter((version) => version.documentId === imported.document.id).length;
        const ocrVersion = await new LocalOcrEngine().createOcrVersion(imported.document, localResult, existingCount + 1);
        vault.documentVersions.set(ocrVersion.id, ocrVersion);
        imported.document.activeVersionId = ocrVersion.id;
        const extraction = extractFieldsFromText({ documentId: imported.document.id, versionId: ocrVersion.id, text: processedText, sourceLines: localResult.lines });
        extraction.fields.forEach((field) => vault.recordExtractedField(field));
      } catch {
        unreadableCount += 1;
        // Oryginał pozostaje zachowany; użytkownik może ponowić OCR lub poprawić tekst.
      }

      // Klasyfikacja działa po lokalnym imporcie. Kontekst użytkownika jest
      // jawnie oznaczony jako jego twierdzenie i nie zastępuje treści dowodu.
      const classification = classifier.classifyDocument(imported.document, processedText, {
        cases: Array.from(vault.cases.values()),
        existingDocuments: Array.from(vault.documents.values()),
        relations: Array.from(vault.relations.values()),
        userContext: contextNote,
      });
      vault.recordInboxProposal(classification.proposal);
      classification.discoveredRelations.forEach((relation) => vault.relations.set(relation.id, relation));
    } } finally {
      if (vaultOwnerEpoch.current === ownerEpoch) {
        try { await persistImportedManifest(ownerEpoch); }
        finally { triggerRefresh(); }
      }
    }
    setGlobalNotice(`Dodano ${selectedFiles.length} ${selectedFiles.length === 1 ? 'dokument' : 'dokumenty'} do sejfu. Oryginały są w trwałym magazynie przeglądarki, a manifest pozostaje zaszyfrowany. Utworzono propozycje uporządkowania w skrzynce.${duplicateCount ? ` Wykryto ${duplicateCount} dokładnych ${duplicateCount === 1 ? 'duplikat' : 'duplikaty'} po SHA-256.` : ''}${unreadableCount ? ` Nie udało się odczytać tekstu z ${unreadableCount} plików. Oryginały zachowano; otwórz dokument i ponów OCR.` : ''}${rejectedCount ? ` Pominięto ${rejectedCount} nieobsługiwanych plików.` : ''}`);
  };

  const handleUpdateDocumentContext = async (documentId: string, contextNote: string) => {
    vault.updateDocumentContext(documentId, contextNote);
    setGlobalNotice('Zaktualizowano prywatny kontekst dokumentu. Nie zmieniono oryginału ani jego sumy kontrolnej.');
    triggerRefresh();
  };

  const handleRelinkOriginal = async (documentId: string, file: File) => {
    if (!vaultHydrated) throw new Error('Odblokuj sejf przed wskazaniem oryginału.');
    const ownerEpoch = vaultOwnerEpoch.current;
    const record = vault.documents.get(documentId);
    if (!record) throw new Error('Dokument nie istnieje w tym sejfie.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    await validateRelink(record, bytes);
    assertCurrentVaultOperation(ownerEpoch);
    await documentStorage.relinkOriginal({ documentId, originalFileName: record.originalFileName, mimeType: record.mimeType, bytes, importedAt: record.createdAt }, { sha256: record.originalSha256, size: record.fileSize });
    assertCurrentVaultOperation(ownerEpoch);
    record.isMissingOnDisk = false;
    setGlobalNotice('Ponownie wskazano oryginał. Bajty i SHA-256 są zgodne z dowodem zapisanym w manifeście.');
    triggerRefresh();
  };

  const handleSaveCorrection = async (docId: string, correctedText: string, note: string) => {
    if (!vaultHydrated) throw new Error('Odblokuj sejf przed zapisem korekty.');
    const ownerEpoch = vaultOwnerEpoch.current;
    await vault.addDocumentVersion({
      documentId: docId,
      kind: 'user_corrected',
      textPayload: correctedText,
      toolOrAuthor: `Korekta użytkownika: ${note}`,
    });
    assertCurrentVaultOperation(ownerEpoch);
    setGlobalNotice(`Zapisano skorygowaną wersję dokumentu bez modyfikacji oryginału.`);
    triggerRefresh();
  };

  const handleConfirmField = (fieldId: string, confirmedValue: string) => {
    vault.confirmField(fieldId, confirmedValue);
    setGlobalNotice(`Potwierdzono poprawność pola.`);
    triggerRefresh();
  };

  // 12. Bezpieczna synchronizacja chmurowa E2EE
  const publishSyncVersion = async (passphrase: string, expectedVersion: number, ownerEpoch = vaultOwnerEpoch.current) => {
    assertCurrentVaultOperation(ownerEpoch);
    const payload = await new E2EESyncEngine().prepareSyncPayload(vault.toManifest(), passphrase, { expectedVersion });
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfData = await csrfResponse.json();
    assertCurrentVaultOperation(ownerEpoch);
    const res = await fetch('/api/sync', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await res.json();
      if (res.status === 409 || error.code === 'SYNC_CONFLICT') throw new Error('Wersja serwera zmieniła się w czasie Twojego wyboru. Pobierz ją ponownie; żadna lokalna zmiana nie została nadpisana.');
      throw new Error(error.error || 'Błąd synchronizacji serwera.');
    }
    assertCurrentVaultOperation(ownerEpoch);
    window.localStorage.setItem(syncBaseStorageKey(profile?.id ?? 'local', vault.vaultId), JSON.stringify({ version: payload.version, revision: payload.revision }));
    return { recordId: payload.recordId, version: payload.version, conflict: false };
  };

  const handleSyncToServer = async (passphrase: string) => {
    if (!profile || !vaultHydrated) throw new Error('Zaloguj się i odblokuj sejf przed synchronizacją.');
    const ownerEpoch = vaultOwnerEpoch.current;
    validateVaultPassword(passphrase);
    const recordId = `sync-${vault.vaultId}`;
    const response = await fetch(`/api/sync?recordId=${encodeURIComponent(recordId)}`, { credentials: 'include' });
    assertCurrentVaultOperation(ownerEpoch);
    if (response.status === 404) return publishSyncVersion(passphrase, 0, ownerEpoch);
    if (!response.ok) throw new Error('Nie udało się odczytać wersji synchronizacji.');
    const data = await response.json();
    const manifest = parseVaultManifest(await new E2EESyncEngine().decryptSyncPayload(data.record, passphrase));
    assertCurrentVaultOperation(ownerEpoch);
    if (manifest.vaultId !== vault.vaultId) throw new Error('Kopia synchronizacji należy do innego sejfu.');
    const comparison = compareSyncManifests(vault.toManifest(), manifest);
    let base: { revision?: string } | null = null;
    try { base = JSON.parse(window.localStorage.getItem(syncBaseStorageKey(profile?.id ?? 'local', vault.vaultId)) || 'null'); } catch { /* unknown base requires review */ }
    if (comparison.changed && base?.revision !== data.record.revision) {
      setPendingSync({ manifest, ownerEpoch, version: data.record.version, revision: data.record.revision, comparison, direction: 'upload', passphrase });
      return { recordId, version: data.record.version, conflict: true };
    }
    return publishSyncVersion(passphrase, data.record.version, ownerEpoch);
  };

  const handleSyncFromServer = async (passphrase: string) => {
    if (!profile || !vaultHydrated) throw new Error('Zaloguj się i odblokuj sejf przed synchronizacją.');
    const ownerEpoch = vaultOwnerEpoch.current;
    const syncEngine = new E2EESyncEngine();
    const recordId = `sync-${vault.vaultId}`;
    const res = await fetch(`/api/sync?recordId=${encodeURIComponent(recordId)}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Brak rekordu synchronizacji na serwerze lub odmowa dostępu.');
    const data = await res.json();
    const restoredManifest = parseVaultManifest(await syncEngine.decryptSyncPayload(data.record, passphrase));
    assertCurrentVaultOperation(ownerEpoch);
    if (restoredManifest.vaultId !== vault.vaultId) throw new Error('Kopia synchronizacji należy do innego sejfu.');
    const comparison = compareSyncManifests(vault.toManifest(), restoredManifest);
    if (!comparison.changed) return { restoredCount: vault.cases.size, conflict: false };
    setPendingSync({ manifest: restoredManifest, ownerEpoch, version: data.record.version, revision: data.record.revision, comparison, direction: 'download' });
    return { restoredCount: restoredManifest.cases.length, conflict: true };
  };

  const handleResolveSync = async (choice: 'keep_local' | 'accept_server') => {
    if (!pendingSync) return;
    const ownerEpoch = pendingSync.ownerEpoch;
    assertCurrentVaultOperation(ownerEpoch);
    if (!profile || !vaultHydrated || pendingSync.manifest.vaultId !== vault.vaultId) throw new Error('Odblokuj właściwy sejf i ponów synchronizację.');
    if (choice === 'keep_local') {
      if (pendingSync.direction === 'upload') {
        if (!pendingSync.passphrase || !vaultPassphrase) throw new Error('Odblokuj sejf i ponów synchronizację.');
        // Preserve the remote variant before an explicit CAS write replaces it.
        const remoteCheckpoint = await LocalVault.fromManifest(pendingSync.manifest).exportEncryptedBackup(vaultPassphrase);
        assertCurrentVaultOperation(ownerEpoch);
        window.localStorage.setItem(syncCheckpointStorageKey(profile?.id ?? 'local', vault.vaultId), JSON.stringify(remoteCheckpoint));
        await publishSyncVersion(pendingSync.passphrase, pendingSync.version, ownerEpoch);
        setHasSyncCheckpoint(true);
        setGlobalNotice('Wysłano wybraną lokalną wersję. Wcześniejsza wersja serwera pozostaje w zaszyfrowanym punkcie przywracania.');
      } else setGlobalNotice('Zachowano lokalną wersję. Serwerowa kopia pozostała na serwerze.');
      setPendingSync(null);
      return;
    }
    if (!vaultPassphrase) throw new Error('Sejf jest zablokowany.');
    // A durable encrypted checkpoint must succeed before switching the active manifest.
    const checkpoint = await vault.exportEncryptedBackup(vaultPassphrase);
    assertCurrentVaultOperation(ownerEpoch);
    window.localStorage.setItem(syncCheckpointStorageKey(profile?.id ?? 'local', vault.vaultId), JSON.stringify(checkpoint));
    const manifest = structuredClone(pendingSync.manifest);
    for (const document of manifest.documents) {
      const original = await documentStorage.getMetadata(document.id);
      document.isMissingOnDisk = !original || original.sha256 !== document.originalSha256;
    }
    assertCurrentVaultOperation(ownerEpoch);
    window.localStorage.setItem(syncBaseStorageKey(profile?.id ?? 'local', vault.vaultId), JSON.stringify({ version: pendingSync.version, revision: pendingSync.revision }));
    setVault(LocalVault.fromManifest(manifest));
    setHasSyncCheckpoint(true);
    setPendingSync(null);
    setGlobalNotice('Zastosowano wersję serwera. Poprzednia lokalna wersja jest zachowana i można do niej wrócić w sekcji prywatności. Synchronizacja struktury nie przesyła oryginałów.');
  };

  const handleRestoreSyncCheckpoint = async () => {
    if (!vaultPassphrase) throw new Error('Sejf jest zablokowany.');
    const ownerEpoch = vaultOwnerEpoch.current;
    const stored = window.localStorage.getItem(syncCheckpointStorageKey(profile?.id ?? 'local', vault.vaultId));
    if (!stored) throw new Error('Nie ma poprzedniej wersji lokalnej.');
    const previous = await LocalVault.restoreFromEncryptedBackup(JSON.parse(stored) as EncryptedContainer, vaultPassphrase);
    const current = await vault.exportEncryptedBackup(vaultPassphrase);
    assertCurrentVaultOperation(ownerEpoch);
    window.localStorage.setItem(syncCheckpointStorageKey(profile?.id ?? 'local', vault.vaultId), JSON.stringify(current));
    setVault(previous);
    setHasSyncCheckpoint(true);
    setGlobalNotice('Przywrócono poprzednią wersję lokalną. Druga wersja pozostaje zachowana.');
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

        <main className="app-content" key={privateViewKey}>
        {!vaultHydrated && !['today', 'privacy', 'legal'].includes(activeView) ? (
          <section className="empty-panel" role="status"><Shield size={20} /><span>Sejf jest zablokowany. Odblokuj go, aby pracować ze sprawami, dokumentami i pismami.</span><button type="button" className="button-primary" onClick={() => profile ? setIsAccountOpen(true) : setLocalVaultMode('unlock')}>Odblokuj sejf</button></section>
        ) : <>
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
            onUpdateDocumentContext={handleUpdateDocumentContext}
            onLoadOriginal={(documentId) => documentStorage.getBytes(documentId)}
            onRelinkOriginal={handleRelinkOriginal}
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

        {activeView === 'letters' && vaultHydrated && (
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
            key={privateViewKey}
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
            syncConflict={pendingSync ? { ...pendingSync.comparison, version: pendingSync.version } : null}
            onResolveSync={handleResolveSync}
            hasSyncCheckpoint={hasSyncCheckpoint}
            onRestoreSyncCheckpoint={handleRestoreSyncCheckpoint}
            recoveryKey={vaultHydrated ? vaultRecoveryKey : ''}
            onLockVault={handleLockVault}
          />
        )}
        </>}
        </main>
        <SiteFooter />
      </div>

      {localVaultMode && !isAccountOpen && <LocalVaultUnlockDialog mode={localVaultMode} onUnlock={handleUnlockLocalVault} onAccount={() => setIsAccountOpen(true)} />}

      {isAccountOpen && (
        <div className="account-overlay no-print" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsAccountOpen(false); }}>
          <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
            <img className="account-logo" src="/tywygrywasz-logo.png" alt="TyWygrywasz.pl" />
            <div className="account-dialog-head">
              <div><div className="panel-kicker"><UserRound size={16} /> PROFIL WŁAŚCICIELA SEJFU</div><h2 id="account-title">{profile ? 'Zarządzaj swoim kontem' : authMode === 'login' ? 'Zaloguj się do swojego konta' : 'Załóż swoje konto'}</h2></div>
              <button type="button" className="account-close" onClick={() => setIsAccountOpen(false)} aria-label="Zamknij"><X size={18} /></button>
            </div>
            <p className="account-intro">Profil pomaga odróżnić Twój sejf od innych profili na tym urządzeniu. Dokumenty pozostają lokalnie i nie są wysyłane przy zakładaniu profilu.</p>
            {profile && vaultHydrated && vaultRecoveryKey && <div className="account-note"><Shield size={16} /><span>Sejf używa osobnego klucza odzyskiwania. <button type="button" className="button-link" onClick={() => { const blob = new Blob([`TyWygrywasz.pl — klucz lokalnego sejfu\n\n${vaultRecoveryKey}\n\nPrzechowuj ten plik poza publicznymi usługami. Klucz nie jest hasłem konta.\n`], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'tywygrywasz-klucz-sejfu.txt'; link.click(); URL.revokeObjectURL(url); }}>Pobierz klucz odzyskiwania</button></span></div>}
            <form onSubmit={handleSaveProfile} className="account-form">
              {(authMode === 'register' || profile) && <label>Jak mamy się do Ciebie zwracać<input required autoFocus value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="np. Anna Kowalska" /></label>}
              <label>Adres e-mail<input required type="email" autoComplete="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} placeholder="np. anna@example.pl" /></label>
              <label>Hasło konta <span>(minimum 12 znaków)</span><input required type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={12} value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} placeholder="••••••••••••" /></label>
              <div className="account-note"><Shield size={16} /><span>Hasło konta jest wysyłane przy logowaniu i początkowo chroni także lokalny klucz sejfu. Dokumenty, OCR i klucz pozostają na urządzeniu. Reset hasła konta nie zmienia hasła odblokowania zapisanego sejfu.</span></div>
              <div className="account-actions"><button type="button" className="button-secondary" onClick={() => setIsAccountOpen(false)}>Anuluj</button><button type="submit" disabled={accountBusy} className="button-primary">{accountBusy ? 'Trwa logowanie…' : authMode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button></div>
              {!profile && <button type="button" className="account-switch" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Nie masz konta? Załóż je' : 'Masz już konto? Zaloguj się'}</button>}
              {profile && <button type="button" disabled={accountBusy} className="account-switch" onClick={handleLogout}>Wyloguj się</button>}
            </form>
            {profile && !vaultHydrated && <section className="mt-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Odblokuj dokumenty na tym urządzeniu</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">Po zmianie hasła konta sejf nadal otwiera dotychczasowe hasło sejfu lub zapisany klucz odzyskiwania. Te dane nie są wysyłane.</p>
              <label className="mt-3 block text-xs font-medium text-slate-700">Hasło lokalnego sejfu lub klucz odzyskiwania<input type="password" autoComplete="current-password" maxLength={256} value={accountVaultPassword} onChange={(event) => setAccountVaultPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" /></label>
              <button type="button" className="button-primary mt-3 text-xs" disabled={!accountVaultPassword} onClick={() => void handleUnlockAccountVault()}>Odblokuj lokalny sejf</button>
            </section>}
            <AccountRecoveryPanel key={privateViewKey} user={profile} onAccountChanged={async () => {
              if (!profile || vaultOwnerEpoch.current !== renderedOwnerEpoch) return;
              const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
              if (!response.ok || vaultOwnerEpoch.current !== renderedOwnerEpoch) return;
              const data = await response.json();
              if (vaultOwnerEpoch.current !== renderedOwnerEpoch || data.user?.id !== profile.id) return;
              const next = { id: data.user.id, name: data.user.name, email: data.user.email, emailVerified: data.user.emailVerified };
              setProfile(next); window.localStorage.setItem('obywatel-profile', JSON.stringify(next));
            }} onPasswordReset={async () => {
              if (vaultOwnerEpoch.current !== renderedOwnerEpoch) return;
              const lockEpoch = renderedOwnerEpoch + 1;
              try { await handleLockVault(); }
              finally {
                if (vaultOwnerEpoch.current === lockEpoch) {
                  setProfile(null); window.localStorage.removeItem('obywatel-profile'); setIsAccountOpen(true);
                  setGlobalNotice('Hasło konta zmienione. Dokumenty pozostają zablokowane; użyj dotychczasowego hasła sejfu lub klucza odzyskiwania.');
                }
              }
            }} />
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
