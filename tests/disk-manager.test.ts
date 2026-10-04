/**
 * Tests for Local Disk Manager (Real Filesystem Integration)
 * Conforms to Requirement 3 ("Rzeczywiste dokumenty na dysku użytkownika")
 * and Requirement 5 ("Spójność dysku z interfejsem")
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { LocalDiskManager } from '../src/domain/disk-manager';
import { DocumentRecord } from '../src/domain/types';

describe('Local Disk Manager (Physical Filesystem)', () => {
  const testWorkspaceDir = path.join(process.cwd(), 'tmp_test_workspace_' + Date.now());
  let diskManager: LocalDiskManager;

  beforeEach(async () => {
    diskManager = new LocalDiskManager(testWorkspaceDir);
    await diskManager.initializeWorkspace();
  });

  afterEach(async () => {
    if (fs.existsSync(testWorkspaceDir)) {
      await fsPromises.rm(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  it('creates physical folder hierarchy on disk', async () => {
    const caseFolder = 'S-0001_Pozwolenie_na_budowe';
    await diskManager.createCaseFolder(caseFolder);

    const expectedDirs = [
      path.join(testWorkspaceDir, 'Do_uporzadkowania'),
      path.join(testWorkspaceDir, caseFolder, '00_Plan_i_opis'),
      path.join(testWorkspaceDir, caseFolder, '01_Otrzymane'),
      path.join(testWorkspaceDir, caseFolder, '02_Wyslane'),
      path.join(testWorkspaceDir, caseFolder, '03_Dowody'),
      path.join(testWorkspaceDir, caseFolder, '04_Potwierdzenia'),
      path.join(testWorkspaceDir, caseFolder, '05_Projekty_pism'),
      path.join(testWorkspaceDir, caseFolder, '06_Prawo_i_analizy'),
      path.join(testWorkspaceDir, caseFolder, '07_Wynik_sprawy'),
    ];

    for (const dir of expectedDirs) {
      expect(fs.existsSync(dir)).toBe(true);
    }
  });

  it('writes file to disk, computes SHA-256, and returns correct relative path', async () => {
    const textContent = 'Treść decyzji administracyjnej z dnia 15.09.2026 r.';
    const result = await diskManager.writeDocumentFile({
      folderName: 'S-0001_Decyzja',
      subfolder: '01_Otrzymane',
      fileName: 'decyzja_142.txt',
      content: textContent,
    });

    expect(fs.existsSync(result.absolutePath)).toBe(true);
    expect(result.sha256).toHaveLength(64);
    expect(result.relativePath).toBe(path.join('S-0001_Decyzja', '01_Otrzymane', 'decyzja_142.txt'));
  });

  it('moves file on disk and supports undo operation', async () => {
    // 1. Zapis pliku do Do_uporzadkowania
    const initialWrite = await diskManager.writeDocumentFile({
      subfolder: 'Do_uporzadkowania',
      fileName: 'nowe_pismo.txt',
      content: 'Pismo do uporządkowania',
    });

    const targetCaseFolder = 'S-0001_Sprawa';
    await diskManager.createCaseFolder(targetCaseFolder);
    const destRelPath = path.join(targetCaseFolder, '01_Otrzymane', 'nowe_pismo.txt');

    // 2. Przeniesienie pliku
    const moveEntry = await diskManager.moveFile({
      sourceRelativePath: initialWrite.relativePath,
      destinationRelativePath: destRelPath,
      description: 'Przyporządkowanie do sprawy S-0001',
      documentId: 'doc-101',
    });

    expect(moveEntry.action).toBe('move');
    expect(fs.existsSync(path.join(testWorkspaceDir, destRelPath))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspaceDir, initialWrite.relativePath))).toBe(false);

    // 3. Cofnięcie operacji (Undo)
    const undoneEntry = await diskManager.undoLastOperation();
    expect(undoneEntry).not.toBeNull();
    expect(fs.existsSync(path.join(testWorkspaceDir, initialWrite.relativePath))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspaceDir, destRelPath))).toBe(false);
  });

  it('detects external file additions, modifications, and deletions', async () => {
    // 1. Zapisujemy znany plik przez aplikację
    const knownWrite = await diskManager.writeDocumentFile({
      folderName: 'S-0001_Test',
      subfolder: '01_Otrzymane',
      fileName: 'znany_dokument.txt',
      content: 'Wersja 1',
    });

    const knownDoc: DocumentRecord = {
      id: 'doc-known-1',
      caseIds: ['S-0001'],
      type: 'decision',
      direction: 'incoming',
      origin: 'disk_file',
      originalFileName: 'znany_dokument.txt',
      mimeType: 'text/plain',
      fileSize: 9,
      originalSha256: knownWrite.sha256,
      diskRelativePath: knownWrite.relativePath,
      createdAt: new Date().toISOString(),
      activeVersionId: 'ver-1',
    };

    // 2. Dodajemy nowy plik z zewnątrz (zewnętrzna aplikacja/użytkownik w Finderze)
    const externalFileRel = path.join('Do_uporzadkowania', 'zewnetrzny_plik.txt');
    await fsPromises.writeFile(
      path.join(testWorkspaceDir, externalFileRel),
      'Plik wrzucony bezpośrednio do katalogu przez użytkownika',
      'utf-8'
    );

    // 3. Skanujemy dysk
    const scanResult1 = await diskManager.scanDiskAndDetectChanges([knownDoc]);
    expect(scanResult1.newExternalFiles.some((f) => f.fileName === 'zewnetrzny_plik.txt')).toBe(true);
    expect(scanResult1.modifiedFiles.length).toBe(0);
    expect(scanResult1.missingFiles.length).toBe(0);

    // 4. Modyfikujemy znany plik z zewnątrz
    await fsPromises.writeFile(knownWrite.absolutePath, 'Zmodyfikowana treść z zewnątrz', 'utf-8');

    const scanResult2 = await diskManager.scanDiskAndDetectChanges([knownDoc]);
    expect(scanResult2.modifiedFiles.some((m) => m.documentId === knownDoc.id)).toBe(true);

    // 5. Usuwamy znany plik z zewnątrz
    await fsPromises.unlink(knownWrite.absolutePath);

    const scanResult3 = await diskManager.scanDiskAndDetectChanges([knownDoc]);
    expect(scanResult3.missingFiles).toContain(knownDoc.id);
    expect(knownDoc.isMissingOnDisk).toBe(true);
  });

  it('splits multi-page document logically without modifying original bytes', () => {
    const parentDoc: DocumentRecord = {
      id: 'doc-scan-multipage',
      caseIds: ['S-0003'],
      type: 'other',
      direction: 'incoming',
      origin: 'scan',
      originalFileName: 'skan_zbiorczy_2_strony.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      originalSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
      diskRelativePath: 'S-0003/01_Otrzymane/skan_zbiorczy_2_strony.pdf',
      createdAt: new Date().toISOString(),
      activeVersionId: 'ver-orig',
    };

    const split1 = diskManager.createLogicalSubDocument({
      parentDocument: parentDoc,
      title: 'Protokół stwierdzenia wad',
      pageStart: 1,
      pageEnd: 1,
      subType: 'other',
      snippetText: 'Protokół z dnia 20.08.2026',
    });

    const split2 = diskManager.createLogicalSubDocument({
      parentDocument: parentDoc,
      title: 'Ostateczne wezwanie do zapłaty',
      pageStart: 2,
      pageEnd: 2,
      subType: 'request',
      snippetText: 'Wezwanie do zapłaty 8 500 zł',
    });

    expect(split1.subDoc.originalSha256).toBe(parentDoc.originalSha256);
    expect(split2.subDoc.originalSha256).toBe(parentDoc.originalSha256);
    expect(split1.subDoc.originalFileName).toContain('str. 1-1');
    expect(split2.subDoc.originalFileName).toContain('str. 2-2');
  });

  it('blocks path traversal and refuses to overwrite an existing original', async () => {
    await expect(diskManager.createCaseFolder('../poza-sejfem')).rejects.toThrow('Nieprawidłowa nazwa folderu');
    await expect(diskManager.moveFile({
      sourceRelativePath: '../sekret.txt',
      destinationRelativePath: 'Do_uporzadkowania/sekret.txt',
      description: 'Nieprawidłowa próba',
    })).rejects.toThrow('poza katalog sejfu');

    await diskManager.writeDocumentFile({ subfolder: 'Do_uporzadkowania', fileName: 'oryginal.txt', content: 'oryginał' });
    await expect(diskManager.writeDocumentFile({ subfolder: 'Do_uporzadkowania', fileName: 'oryginal.txt', content: 'nadpisanie' })).rejects.toThrow();
  });
});
