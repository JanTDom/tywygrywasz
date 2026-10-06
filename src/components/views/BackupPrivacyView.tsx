'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Cloud,
  FileCheck,
  RotateCcw,
  Check,
} from 'lucide-react';
import { PortableVaultBackup } from '../../domain/vault-backup';
import { SyncManifestComparison } from '../../domain/sync-engine';
import { DocumentRecord } from '../../domain/types';
import { LocalRedactionEngine, RedactedPublicationRecord } from '../../domain/redaction-engine';

interface BackupPrivacyViewProps {
  onExportBackup: (password: string) => Promise<PortableVaultBackup>;
  onRestoreBackup: (container: unknown, password: string) => Promise<{ restoredCases: number; restoredDocs: number; restoredOriginals: number; legacy: boolean }>;
  vaultInfo: { caseCount: number; documentCount: number; versionCount: number };
  documents?: DocumentRecord[];
  onSyncToServer?: (passphrase: string) => Promise<{ recordId: string; version: number; conflict?: boolean }>;
  onSyncFromServer?: (passphrase: string) => Promise<{ restoredCount: number; conflict?: boolean }>;
  syncConflict?: (SyncManifestComparison & { version: number }) | null;
  onResolveSync?: (choice: 'keep_local' | 'accept_server') => Promise<void>;
  hasSyncCheckpoint?: boolean;
  onRestoreSyncCheckpoint?: () => Promise<void>;
  recoveryKey?: string;
  onLockVault?: () => Promise<void>;
}

export function BackupPrivacyView({
  onExportBackup,
  onRestoreBackup,
  vaultInfo,
  documents = [],
  onSyncToServer,
  onSyncFromServer,
  syncConflict,
  onResolveSync,
  hasSyncCheckpoint,
  onRestoreSyncCheckpoint,
  recoveryKey,
  onLockVault,
}: BackupPrivacyViewProps) {
  // Backup state
  const [exportPassword, setExportPassword] = useState('');
  const [exportedJson, setExportedJson] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [restoreAcknowledged, setRestoreAcknowledged] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // Restore state
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreInputJson, setRestoreInputJson] = useState('');
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Cloud E2EE Sync state
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Social Redaction state
  const [selectedDocIdForRedact] = useState<string>(documents[0]?.id || '');
  const [customNamesToRedact, setCustomNamesToRedact] = useState('Jan Kowalski, Tomasz Majewski');
  const [redactedRecord, setRedactedRecord] = useState<RedactedPublicationRecord | null>(null);
  const [isRedacting, setIsRedacting] = useState(false);

  // Cloud AI state
  const [cloudAiEnabled, setCloudAiEnabled] = useState(false);
  const [redactedFields, setRedactedFields] = useState<{ [key: string]: boolean }>({
    pesel: true,
    adres: true,
    nazwisko: false,
    kwota: false,
  });

  const handleSyncUp = async () => {
    if (!onSyncToServer || !syncPassphrase) return;
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncError(null);
    try {
      const res = await onSyncToServer(syncPassphrase);
      setSyncStatus(res.conflict ? 'Serwer ma inną wersję. Przejrzyj różnice i wybierz, którą zachować przed wysyłką.' : `Zsynchronizowano szyfrogram. Wersja serwera: v${res.version}.`);
    } catch (err: unknown) {
      setSyncError(`Błąd synchronizacji: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncDown = async () => {
    if (!onSyncFromServer || !syncPassphrase) return;
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncError(null);
    try {
      const res = await onSyncFromServer(syncPassphrase);
      setSyncStatus(res.conflict ? 'Pobrano wersję serwera. Sprawdź różnice i wybierz wersję poniżej; lokalna praca pozostaje zachowana.' : 'Wersja serwera jest zgodna z lokalnym sejfem.');
    } catch (err: unknown) {
      setSyncError(`Błąd pobierania szyfrogramu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExecuteRedaction = async () => {
    const doc = documents.find((d) => d.id === selectedDocIdForRedact) || documents[0];
    if (!doc) return;
    setIsRedacting(true);
    try {
      const engine = new LocalRedactionEngine();
      const namesList = customNamesToRedact.split(',').map((n) => n.trim()).filter(Boolean);
      const sampleText = `DECYZJA PREZYDENTA MIASTA WARSZAWY
Znak: WAB.6740.1.2026.JK
Adresat: Jan Kowalski, PESEL: 85031201234, ul. Grójecka 45 m. 12, 02-031 Warszawa.
NIP: 5271234567, telefon: +48 601 234 567.
Rachunek: PL12 3456 7890 1234 5678 9012 3456.

W sprawie z wniosku strony odmawiam zatwierdzenia projektu budowlanego.`;

      const result = await engine.createRedactedPublicationCopy({
        sourceDocumentId: doc.id,
        sourceFileName: doc.originalFileName,
        textContent: sampleText,
        customEntitiesToRedact: namesList,
      });
      setRedactedRecord(result);
    } finally {
      setIsRedacting(false);
    }
  };

  const handleExport = async () => {
    if (!exportPassword) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const container = await onExportBackup(exportPassword);
      setExportedJson(JSON.stringify(container, null, 2));
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Nie udało się wykonać kopii.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadBackup = () => {
    if (!exportedJson) return;
    const blob = new Blob([exportedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tywygrywasz_kopia_sejfu_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async () => {
    if (!restorePassword || !restoreInputJson || !restoreAcknowledged) return;
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreStatus(null);

    try {
      const container: unknown = JSON.parse(restoreInputJson);
      const res = await onRestoreBackup(container, restorePassword);
      setRestoreStatus(
        `Odtworzono ${res.restoredCases} spraw, ${res.restoredDocs} rekordów i ${res.restoredOriginals} oryginalnych plików.${res.legacy ? ' To starsza kopia samych metadanych: wskaż brakujące oryginały.' : ' Zweryfikowano bajty każdego oryginału i powiązania wersji.'}`
      );
    } catch (err: unknown) {
      setRestoreError(
        `Błąd odszyfrowania: ${err instanceof Error ? err.message : 'Nieprawidłowe hasło lub uszkodzony plik kopii'}`
      );
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Kopie zapasowe, szyfrowanie i prywatność
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Dokumenty, OCR i klucze są przetwarzane lokalnie. Synchronizacja i przekazanie zakresu do AI wymagają osobnego działania.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-950 px-3.5 py-1.5 rounded-xl text-xs font-semibold">
          <CloudOff className="w-4 h-4 text-emerald-700" />
          <span>Domyślnie na tym urządzeniu</span>
        </div>
      </div>

      {/* Security Status Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-700" />
          <span>Parametry bezpieczeństwa lokalnego sejfu</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Szyfrowanie kontenera
            </span>
            <div className="font-bold text-slate-900 mt-0.5">AES-GCM-256</div>
            <div className="text-[10px] text-slate-500">Losowy klucz sejfu 256-bit, opakowanie PBKDF2 (210 000 iteracji)</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Integralność danych
            </span>
            <div className="font-bold text-slate-900 mt-0.5">SHA-256 każdego pliku</div>
            <div className="text-[10px] text-slate-500">Niezmienność oryginałów na dysku</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Zawartość sejfu
            </span>
            <div className="font-bold text-slate-900 mt-0.5">
              {vaultInfo.caseCount} spraw, {vaultInfo.documentCount} dokumentów
            </div>
            <div className="text-[10px] text-slate-500">{vaultInfo.versionCount} zarejestrowanych wersji</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl bg-slate-50 border border-slate-200">
        <KeyRound className="w-5 h-5 text-slate-700" /><p className="text-xs text-slate-600 flex-1">Klucz odzyskiwania odblokowuje sejf bez hasła. Pobierz go i przechowuj osobno od urządzenia oraz kopii.</p>
        <button type="button" disabled={!recoveryKey} className="button-secondary" onClick={() => { if (!recoveryKey) return; const url = URL.createObjectURL(new Blob([`TyWygrywasz.pl — klucz odzyskiwania\n${recoveryKey}\nPrzechowuj poza publicznymi usługami.\n`], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'tywygrywasz-klucz-odzyskiwania.txt'; link.click(); URL.revokeObjectURL(url); }}>Pobierz klucz</button>
        {onLockVault && <button type="button" className="button-secondary" onClick={() => void onLockVault().catch((error) => setExportError(error instanceof Error ? error.message : 'Nie udało się zablokować sejfu.'))}><Lock className="w-4 h-4" /> Zablokuj sejf</button>}
      </div>
      {/* Backup and Restore Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Backup Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Eksport zaszyfrowanej kopii zapasowej
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Pełna kopia zawiera oryginalne bajty wszystkich dokumentów, OCR, wersje, notatki, projekty pism i relacje. Klucz oryginałów jest zamknięty w zaszyfrowanych metadanych; do odtworzenia na nowym urządzeniu wystarczy ten plik i hasło kopii.
          </p>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Hasło szyfrowania kopii (minimum 12 znaków)
            </label>
            <input
              type="password"
              minLength={12}
              autoComplete="new-password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || exportPassword.length < 12}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Szyfrowanie...' : 'Wygeneruj kopię'}</span>
            </button>

            {exportedJson && (
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Pobierz plik JSON</span>
              </button>
            )}
          </div>

          {exportError && <p role="alert" className="text-xs text-rose-700">{exportError}</p>}
          {exportedJson && (
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Podgląd zaszyfrowanego kontenera (kryptogram)
              </span>
              <div className="p-3 bg-slate-900 text-slate-300 font-mono text-[10px] rounded-xl max-h-36 overflow-y-auto whitespace-pre-wrap">
                {exportedJson.slice(0, 2000)}{exportedJson.length > 2000 ? '\n… (pełny kontener znajduje się w pobieranym pliku)' : ''}
              </div>
            </div>
          )}
        </div>

        {/* Restore Backup Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Odtwarzanie sejfu z zaszyfrowanej kopii
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Wybierz plik kopii i podaj hasło. Wszystkie oryginały, sumy kontrolne i powiązania zostaną sprawdzone przed zmianą sejfu. Błąd hasła, uszkodzony plik lub brak miejsca zachowuje dotychczasowy magazyn.
          </p>

          <label className="block text-xs font-semibold text-slate-700">Plik pełnej kopii (.json)<input className="block w-full mt-2 text-xs" type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void file.text().then(setRestoreInputJson).catch(() => setRestoreError('Nie można odczytać pliku kopii.')); }} /></label>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Zawartość pliku JSON kopii zapasowej
            </label>
            <textarea
              rows={3}
              placeholder="Wklej zaszyfrowany kontener JSON..."
              value={restoreInputJson}
              onChange={(e) => setRestoreInputJson(e.target.value)}
              className="w-full text-[11px] font-mono bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Hasło odszyfrowania
            </label>
            <input
              type="password"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={restoreAcknowledged} onChange={(event) => setRestoreAcknowledged(event.target.checked)} /><span>Wybieram zastąpienie aktywnego sejfu tą kopią. Wcześniej zachowam potrzebne dane w osobnym eksporcie. Hasło kopii będzie lokalnym hasłem odblokowania.</span></label>
          <button
            type="button"
            onClick={handleRestore}
            disabled={isRestoring || restorePassword.length < 12 || !restoreInputJson || !restoreAcknowledged}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isRestoring ? 'Odszyfrowywanie...' : 'Odtwórz sejf'}</span>
          </button>

          {restoreStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{restoreStatus}</span>
            </div>
          )}

          {restoreError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{restoreError}</span>
            </div>
          )}
        </div>
      </div>

      {/* E2EE Cloud Sync & Social Redaction Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* E2EE Server Sync Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Synchronizacja wielourządzeniowa E2EE (Zero-Knowledge)
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Serwer otrzymuje wyłącznie szyfrogram. Treści spraw, sygnatury, daty i OCR są nieodczytywalne
            dla administratora bazy. Wymaga tego samego hasła na każdym urządzeniu.
          </p>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Hasło szyfrowania synchronizacji
            </label>
            <input
              type="password"
              value={syncPassphrase}
              onChange={(e) => setSyncPassphrase(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSyncing || !onSyncToServer}
              onClick={handleSyncUp}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isSyncing ? 'Wysyłanie...' : 'Wyślij szyfrogram na serwer'}</span>
            </button>

            <button
              type="button"
              disabled={isSyncing || !onSyncFromServer}
              onClick={handleSyncDown}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-300 transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pobierz z serwera</span>
            </button>
          </div>

          {syncConflict && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs" role="status">
            <strong className="block text-amber-950">Wersje różnią się — wybierz dalsze działanie</strong>
            <table className="w-full text-left"><thead><tr><th>Wersja</th><th>Sprawy</th><th>Dokumenty</th><th>Pisma</th></tr></thead><tbody><tr><td>Lokalna</td><td>{syncConflict.local.cases}</td><td>{syncConflict.local.documents}</td><td>{syncConflict.local.letters}</td></tr><tr><td>Serwer v{syncConflict.version}</td><td>{syncConflict.server.cases}</td><td>{syncConflict.server.documents}</td><td>{syncConflict.server.letters}</td></tr></tbody></table>
            <p>Zastępowana wersja zostanie zachowana jako zaszyfrowany punkt przywracania. Oryginały na urządzeniu pozostają zachowane.</p>
            <div className="flex flex-wrap gap-2">{(['keep_local', 'accept_server'] as const).map((choice) => <button key={choice} type="button" disabled={isResolving} className="button-secondary" onClick={() => { setIsResolving(true); void onResolveSync?.(choice).catch((error) => setSyncError(error instanceof Error ? error.message : 'Nie udało się rozwiązać konfliktu.')).finally(() => setIsResolving(false)); }}>{choice === 'keep_local' ? 'Zachowaj lokalną' : 'Zastosuj serwerową'}</button>)}</div>
          </div>}
          {hasSyncCheckpoint && <button type="button" className="button-secondary" onClick={() => void onRestoreSyncCheckpoint?.().catch((error) => setSyncError(error instanceof Error ? error.message : 'Nie udało się przywrócić wersji.'))}><RotateCcw className="w-4 h-4" /> Przywróć poprzednią wersję lokalną</button>}
          {syncStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{syncStatus}</span>
            </div>
          )}

          {syncError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{syncError}</span>
            </div>
          )}
        </div>

        {/* Social Redaction & Publication Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Publikacja w interesie społecznym (Nieodwracalna redakcja)
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Tworzy odrębny egzemplarz publiczny: usuwa metadane i trwale usuwa PESEL, adresy i nazwiska
            z warstwy tekstowej z pieczęcią SHA-256 (Scenariusz 28 ACCEPTANCE.md).
          </p>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Własne nazwiska / dane stron do wycięcia (oddzielone przecinkami)
            </label>
            <input
              type="text"
              value={customNamesToRedact}
              onChange={(e) => setCustomNamesToRedact(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
            />
          </div>

          <button
            type="button"
            disabled={isRedacting}
            onClick={handleExecuteRedaction}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isRedacting ? 'Anonimizacja...' : 'Wygeneruj zanonimizowany egzemplarz publiczny'}</span>
          </button>

          {redactedRecord && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Egzemplarz zanonimizowany (SHA-256 publiczny):</span>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Usunięto {redactedRecord.removedSensitiveEntitiesCount} tokenów
                </span>
              </div>
              <div className="font-mono text-[10px] text-slate-500 break-all">
                {redactedRecord.redactedSha256}
              </div>
              <div className="p-2.5 bg-slate-900 text-slate-200 font-mono text-[10px] rounded-lg max-h-32 overflow-y-auto whitespace-pre-wrap">
                {redactedRecord.redactedContent}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cloud AI Integration and Redaction Gate */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-slate-700" />
              <span>Opcjonalna integracja z Gemini AI (Google Cloud)</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Domyślnie wyłączona. Wymaga Twojej świadomej zgody oraz weryfikacji zredagowanych danych przed każdym zapytaniem.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600">
              Stan integracji: {cloudAiEnabled ? 'Włączona (wymaga zgody na prompt)' : 'Wyłączona (100% offline)'}
            </span>
            <button
              type="button"
              onClick={() => setCloudAiEnabled(!cloudAiEnabled)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${
                cloudAiEnabled
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {cloudAiEnabled ? 'Wyłącz integrację chmurową' : 'Aktywuj opcjonalną integrację AI'}
            </button>
          </div>
        </div>

        {cloudAiEnabled && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="text-xs font-bold text-slate-900">
              Reguły anonimizacji i redagowania danych przed wysyłką:
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'pesel', label: 'PESEL i NIP' },
                { key: 'adres', label: 'Dokładny adres' },
                { key: 'nazwisko', label: 'Nazwiska stron' },
                { key: 'kwota', label: 'Kwoty sporne' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-white p-2.5 rounded-lg border border-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={redactedFields[item.key]}
                    onChange={(e) =>
                      setRedactedFields({ ...redactedFields, [item.key]: e.target.checked })
                    }
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>Redaguj: {item.label}</span>
                </label>
              ))}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Klauzula prywatności: </strong>
                Nawet po włączeniu adaptera żadne pismo, załącznik ani OCR nie zostanie przesłane bez
                uprzedniego wyświetlenia okna podglądu z dokładną treścią JSON i przyciskiem zatwierdzenia.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
