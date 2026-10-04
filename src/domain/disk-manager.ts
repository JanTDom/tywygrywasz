/**
 * Obywatel - Local Disk Manager
 * Conforms to ADR 0002, docs/DATA_MODEL.md, and docs/PRIVACY.md
 *
 * Implements real physical filesystem management for:
 * Moje_sprawy/
 *   Do_uporzadkowania/
 *   S-0001_Nazwa_sprawy/
 *     00_Plan_i_opis/
 *     01_Otrzymane/
 *     02_Wyslane/
 *     03_Dowody/
 *     04_Potwierdzenia/
 *     05_Projekty_pism/
 *     06_Prawo_i_analizy/
 *     07_Wynik_sprawy/
 *
 * Features:
 * - Deterministic SHA-256 calculation.
 * - External change detection (additions, moves, renames, deletions, modifications).
 * - Safe move & undo stack.
 * - Logical splitting of multi-document files.
 */

import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { computeSha256 } from './crypto';
import { CaseSubfolder, DiskOperationHistoryEntry, DocumentRecord } from './types';

export const CASE_SUBFOLDERS: CaseSubfolder[] = [
  '00_Plan_i_opis',
  '01_Otrzymane',
  '02_Wyslane',
  '03_Dowody',
  '04_Potwierdzenia',
  '05_Projekty_pism',
  '06_Prawo_i_analizy',
  '07_Wynik_sprawy',
];

const VALID_DOCUMENT_SUBFOLDERS: CaseSubfolder[] = [...CASE_SUBFOLDERS, 'Do_uporzadkowania'];

export interface DiskScanResult {
  scannedAt: string;
  totalFilesOnDisk: number;
  newExternalFiles: { relativePath: string; fileName: string; size: number; sha256: string }[];
  missingFiles: string[]; // document IDs or paths missing on disk
  modifiedFiles: { documentId: string; relativePath: string; oldSha256: string; newSha256: string }[];
}

export class LocalDiskManager {
  public rootDir: string;
  public history: DiskOperationHistoryEntry[] = [];

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  private resolveSafeRelative(relativePath: string): string {
    if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Ścieżka musi być względna względem sejfu.');
    const resolved = path.resolve(this.rootDir, relativePath);
    const relative = path.relative(this.rootDir, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Ścieżka wychodzi poza katalog sejfu.');
    }
    return resolved;
  }

  private safeFolderName(folderName: string): string {
    if (!folderName || folderName.includes('..') || /[/\\]/.test(folderName)) throw new Error('Nieprawidłowa nazwa folderu sprawy.');
    return folderName.replace(/[?%*:|"<>]/g, '_');
  }

  /**
   * Inicjalizacja głównego katalogu spraw oraz skrzynki odbiorczej
   */
  public async initializeWorkspace(): Promise<void> {
    if (!fs.existsSync(this.rootDir)) {
      await fsPromises.mkdir(this.rootDir, { recursive: true });
    }
    const inboxDir = path.join(this.rootDir, 'Do_uporzadkowania');
    if (!fs.existsSync(inboxDir)) {
      await fsPromises.mkdir(inboxDir, { recursive: true });
    }
  }

  /**
   * Tworzenie katalogu konkretnej sprawy wraz z podkatalogami
   */
  public async createCaseFolder(folderName: string): Promise<string> {
    const caseDir = this.resolveSafeRelative(this.safeFolderName(folderName));
    if (!fs.existsSync(caseDir)) {
      await fsPromises.mkdir(caseDir, { recursive: true });
    }
    for (const sub of CASE_SUBFOLDERS) {
      const subDir = path.join(caseDir, sub);
      if (!fs.existsSync(subDir)) {
        await fsPromises.mkdir(subDir, { recursive: true });
      }
    }
    return caseDir;
  }

  /**
   * Zapis dokumentu na dysku
   */
  public async writeDocumentFile(params: {
    folderName?: string;
    subfolder: CaseSubfolder;
    fileName: string;
    content: string | Uint8Array;
  }): Promise<{ relativePath: string; absolutePath: string; sha256: string; size: number }> {
    await this.initializeWorkspace();
    if (!VALID_DOCUMENT_SUBFOLDERS.includes(params.subfolder)) throw new Error('Nieprawidłowy podfolder dokumentu.');

    let targetDir: string;
    if (params.subfolder === 'Do_uporzadkowania' || !params.folderName) {
      targetDir = path.join(this.rootDir, 'Do_uporzadkowania');
    } else {
      const safeFolderName = this.safeFolderName(params.folderName);
      await this.createCaseFolder(safeFolderName);
      targetDir = path.join(this.rootDir, safeFolderName, params.subfolder);
    }

    if (!fs.existsSync(targetDir)) {
      await fsPromises.mkdir(targetDir, { recursive: true });
    }

    // Bezpieczna sanitacja nazwy pliku
    const sanitizedFileName = params.fileName.replace(/[/\\?%*:|"<>]/g, '_');
    const absolutePath = path.join(targetDir, sanitizedFileName);
    const relativePath = path.relative(this.rootDir, absolutePath);

    const buffer = typeof params.content === 'string'
      ? Buffer.from(params.content, 'utf-8')
      : Buffer.from(params.content);

    await fsPromises.writeFile(absolutePath, buffer, { flag: 'wx' });
    const sha256 = await computeSha256(buffer);

    return {
      relativePath,
      absolutePath,
      sha256,
      size: buffer.length,
    };
  }

  /**
   * Przeniesienie pliku (np. ze skrzynki Do_uporzadkowania do sprawy) z historią cofania
   */
  public async moveFile(params: {
    sourceRelativePath: string;
    destinationRelativePath: string;
    description: string;
    documentId?: string;
  }): Promise<DiskOperationHistoryEntry> {
    const srcAbs = this.resolveSafeRelative(params.sourceRelativePath);
    const destAbs = this.resolveSafeRelative(params.destinationRelativePath);

    if (!fs.existsSync(srcAbs)) {
      throw new Error(`Plik źródłowy nie istnieje na dysku: ${params.sourceRelativePath}`);
    }
    if (fs.existsSync(destAbs)) throw new Error('Plik docelowy już istnieje; oryginał nie został nadpisany.');

    const destDir = path.dirname(destAbs);
    if (!fs.existsSync(destDir)) {
      await fsPromises.mkdir(destDir, { recursive: true });
    }

    await fsPromises.rename(srcAbs, destAbs);

    const entry: DiskOperationHistoryEntry = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'move',
      documentId: params.documentId,
      sourcePath: params.sourceRelativePath,
      destinationPath: params.destinationRelativePath,
      description: params.description,
      canUndo: true,
    };

    this.history.push(entry);
    return entry;
  }

  /**
   * Cofnięcie operacji na dysku (Undo)
   */
  public async undoLastOperation(): Promise<DiskOperationHistoryEntry | null> {
    const lastOp = this.history.filter((h) => h.canUndo).pop();
    if (!lastOp) return null;

    if (lastOp.action === 'move') {
      const currentLoc = path.join(this.rootDir, lastOp.destinationPath);
      const originalLoc = path.join(this.rootDir, lastOp.sourcePath);

      if (fs.existsSync(currentLoc)) {
        const origDir = path.dirname(originalLoc);
        if (!fs.existsSync(origDir)) {
          await fsPromises.mkdir(origDir, { recursive: true });
        }
        await fsPromises.rename(currentLoc, originalLoc);
      }
      lastOp.canUndo = false;
      return lastOp;
    }

    return null;
  }

  /**
   * Skanowanie dysku i wykrywanie zmian zewnętrznych
   */
  public async scanDiskAndDetectChanges(knownDocuments: DocumentRecord[]): Promise<DiskScanResult> {
    await this.initializeWorkspace();

    const allDiscoveredFiles: { relativePath: string; fileName: string; size: number; sha256: string }[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // pomijaj pliki ukryte
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const buffer = await fsPromises.readFile(fullPath);
          const sha256 = await computeSha256(buffer);
          const relativePath = path.relative(this.rootDir, fullPath);
          allDiscoveredFiles.push({
            relativePath,
            fileName: entry.name,
            size: buffer.length,
            sha256,
          });
        }
      }
    };

    await walk(this.rootDir);

    const knownMapByPath = new Map<string, DocumentRecord>();
    const knownMapByHash = new Map<string, DocumentRecord>();
    knownDocuments.forEach((doc) => {
      if (doc.diskRelativePath) {
        knownMapByPath.set(doc.diskRelativePath, doc);
      }
      knownMapByHash.set(doc.originalSha256, doc);
    });

    const newExternalFiles: DiskScanResult['newExternalFiles'] = [];
    const modifiedFiles: DiskScanResult['modifiedFiles'] = [];
    const discoveredPaths = new Set<string>();

    for (const file of allDiscoveredFiles) {
      discoveredPaths.add(file.relativePath);
      const matchedByPath = knownMapByPath.get(file.relativePath);
      if (matchedByPath) {
        if (matchedByPath.originalSha256 !== file.sha256) {
          modifiedFiles.push({
            documentId: matchedByPath.id,
            relativePath: file.relativePath,
            oldSha256: matchedByPath.originalSha256,
            newSha256: file.sha256,
          });
        }
      } else {
        // Nowy plik na dysku, którego nie ma w znanych dokumentach
        newExternalFiles.push(file);
      }
    }

    // Wykrywanie brakujących plików na dysku
    const missingFiles: string[] = [];
    for (const doc of knownDocuments) {
      if (doc.diskRelativePath && !discoveredPaths.has(doc.diskRelativePath)) {
        missingFiles.push(doc.id);
        doc.isMissingOnDisk = true;
      } else {
        doc.isMissingOnDisk = false;
      }
    }

    return {
      scannedAt: new Date().toISOString(),
      totalFilesOnDisk: allDiscoveredFiles.length,
      newExternalFiles,
      missingFiles,
      modifiedFiles,
    };
  }

  /**
   * Logiczny podział dokumentu wielostronicowego na dokumenty składowe
   */
  public createLogicalSubDocument(params: {
    parentDocument: DocumentRecord;
    title: string;
    pageStart: number;
    pageEnd: number;
    subType: DocumentRecord['type'];
    snippetText: string;
  }): { subDoc: DocumentRecord; newVersionNumber: number } {
    const subDocId = `subdoc-${params.parentDocument.id}-${params.pageStart}-${params.pageEnd}`;
    const subDoc: DocumentRecord = {
      id: subDocId,
      caseIds: [...params.parentDocument.caseIds],
      type: params.subType,
      direction: params.parentDocument.direction,
      origin: 'scan',
      originalFileName: `${params.title} (str. ${params.pageStart}-${params.pageEnd})`,
      mimeType: params.parentDocument.mimeType,
      fileSize: params.parentDocument.fileSize,
      originalSha256: params.parentDocument.originalSha256,
      diskRelativePath: params.parentDocument.diskRelativePath,
      subfolder: params.parentDocument.subfolder,
      createdAt: new Date().toISOString(),
      activeVersionId: `ver-${subDocId}-v1`,
    };

    return { subDoc, newVersionNumber: 1 };
  }
}
