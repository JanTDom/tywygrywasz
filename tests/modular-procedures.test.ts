/**
 * Tests for Modular Procedures & Synthetic Datasets
 * Conforms to Requirement 2, 7, 9, 13 (Authority, Company, Individual, Shared Docs, Duplicates)
 */

import { describe, it, expect } from 'vitest';
import { LocalVault } from '../src/domain/vault';
import { calculateKpaDeadline } from '../src/domain/deadlines';
import { createModularLetterDraft, exportLetterForPrinting } from '../src/domain/letter-engine';
import { SYNTHETIC_DATASET } from '../src/domain/synthetic-data';

describe('Modular Procedures & Synthetic Datasets', () => {
  it('executes Scenario 1: Urząd (Administrative Appeal with KPA deadlines)', async () => {
    const vault = new LocalVault('vault-scen-1');

    const adminCase = vault.createCase({
      id: 'S-0001',
      title: 'Odmowa pozwolenia na budowę',
      goalDescription: 'Uchylenie decyzji odmownej',
      procedureType: 'administrative',
      opponentType: 'public_authority',
      authorityOrOpponentName: 'Prezydent Miasta Stołecznego Warszawy',
      authorityJurisdictionReason: 'Organ I instancji',
    });

    const fileDef = SYNTHETIC_DATASET.find((f) => f.fileName.includes('decyzja_prezydenta'));
    const { document } = await vault.importDocument({
      caseId: adminCase.id,
      type: 'decision',
      direction: 'incoming',
      origin: 'pdf_digital',
      originalFileName: fileDef!.fileName,
      mimeType: 'text/plain',
      content: fileDef!.content,
      subfolder: '01_Otrzymane',
    });

    expect(document.id).toBeDefined();

    // Wyliczenie terminu od daty doręczenia potwierdzonej zwrotką (2026-09-18)
    const deadline = calculateKpaDeadline({
      caseId: adminCase.id,
      baseEventId: 'evt-1',
      deliveryDate: '2026-09-18',
      daysCount: 14,
      actionRequired: 'Złożenie odwołania do SKO',
    });

    // 18.09 + 14 dni = 02.10.2026 (piątek)
    expect(deadline.calculatedEndDate).toBe('2026-10-02');
    expect(deadline.status).toBe('active');

    // Projekt pisma odwoławczego
    const letter = createModularLetterDraft({
      caseId: adminCase.id,
      letterType: 'odwolanie',
      title: 'Odwołanie od decyzji nr 142/2026',
      recipientName: 'Samorządowe Kolegium Odwoławcze w Warszawie',
      recipientAddressOrChannel: 'ul. Obozowa 57, 01-161 Warszawa',
      intermediaryAuthority: 'Prezydent m.st. Warszawy',
      caseSignature: 'WAB.6740.1.2026.JK',
      demands: ['Uchylenie zaskarżonej decyzji w całości.'],
      factualBasis: 'Błędna interpretacja planu miejscowego.',
      legalJustification: 'Naruszenie art. 7 i 77 § 1 KPA.',
    });

    expect(letter.status).toBe('draft');
    expect(letter.checklist.length).toBe(6);

    const { exportSha256 } = await exportLetterForPrinting(letter);
    expect(exportSha256).toHaveLength(64);
  });

  it('executes Scenario 2: Firma (Consumer Dispute with 14-day rule and duplicate check)', async () => {
    const vault = new LocalVault('vault-scen-2');

    const consumerCase = vault.createCase({
      id: 'S-0002',
      title: 'Reklamacja laptopa',
      goalDescription: 'Wymiana wadliwego sprzętu',
      procedureType: 'consumer_dispute',
      opponentType: 'company',
      authorityOrOpponentName: 'Elektronika Polska Sp. z o.o.',
      authorityJurisdictionReason: 'Sprzedawca towaru',
    });

    const invoiceFile = SYNTHETIC_DATASET.find((f) => f.fileName === 'faktura_vat_FV_2026_08_10_zakup_laptopa.txt');
    const firstImport = await vault.importDocument({
      caseId: consumerCase.id,
      type: 'invoice',
      direction: 'incoming',
      origin: 'pdf_digital',
      originalFileName: invoiceFile!.fileName,
      mimeType: 'text/plain',
      content: invoiceFile!.content,
      subfolder: '03_Dowody',
    });
    expect(firstImport.isDuplicate).toBe(false);

    // Import duplikatu faktury
    const duplicateFile = SYNTHETIC_DATASET.find((f) => f.fileName.includes('kopia_duplikat'));
    const secondImport = await vault.importDocument({
      caseId: consumerCase.id,
      type: 'invoice',
      direction: 'incoming',
      origin: 'pdf_digital',
      originalFileName: duplicateFile!.fileName,
      mimeType: 'text/plain',
      content: duplicateFile!.content,
      subfolder: '03_Dowody',
    });
    expect(secondImport.isDuplicate).toBe(true);

    // Projekt reklamacji konsumenckiej
    const letter = createModularLetterDraft({
      caseId: consumerCase.id,
      letterType: 'reklamacja_konsumencka',
      title: 'Zgłoszenie reklamacyjne z tytułu braku zgodności towaru z umową',
      recipientName: 'Elektronika Polska Sp. z o.o.',
      recipientAddressOrChannel: 'ul. Towarowa 22, 00-838 Warszawa',
      demands: ['Wymiana laptopa na nowy, wolny od wad.'],
      factualBasis: 'Pionowe pasy na matrycy po miesiącu użytkowania.',
      legalJustification: 'Art. 43d Ustawy z dnia 30 maja 2014 r. o prawach konsumenta.',
    });

    expect(letter.letterType).toBe('reklamacja_konsumencka');
    expect(letter.checklist.some((c) => c.item.includes('dowodu zakupu'))).toBe(true);
  });

  it('executes Scenario 3: Umowa z osobą fizyczną (Contract dispute & pre-litigation demand)', async () => {
    const vault = new LocalVault('vault-scen-3');

    const contractCase = vault.createCase({
      id: 'S-0003',
      title: 'Spór o remont instalacji',
      goalDescription: 'Odzyskanie zadatku i naprawienie szkody',
      procedureType: 'contract_dispute',
      opponentType: 'individual',
      authorityOrOpponentName: 'Marek Wiśniewski',
      authorityJurisdictionReason: 'Wykonawca dzieła',
    });

    const contractFile = SYNTHETIC_DATASET.find((f) => f.fileName.includes('umowa_o_dzielo'));
    await vault.importDocument({
      caseId: contractCase.id,
      type: 'contract',
      direction: 'internal',
      origin: 'pdf_digital',
      originalFileName: contractFile!.fileName,
      mimeType: 'text/plain',
      content: contractFile!.content,
      subfolder: '03_Dowody',
    });

    // Pismo: Przedsądowe wezwanie do zapłaty
    const letter = createModularLetterDraft({
      caseId: contractCase.id,
      letterType: 'wezwanie_do_zaplaty',
      title: 'Przedsądowe wezwanie do zapłaty kwoty 8 500 zł',
      recipientName: 'Marek Wiśniewski',
      recipientAddressOrChannel: 'ul. Prosta 10, Warszawa',
      demands: ['Zapłata kwoty 8 500,00 PLN w terminie 7 dni.'],
      factualBasis: 'Porzucenie prac instalacyjnych w stanie surowym.',
      legalJustification: 'Art. 471 w zw. z art. 394 Kodeksu cywilnego oraz art. 187 § 1 pkt 3 KPC.',
    });

    expect(letter.letterType).toBe('wezwanie_do_zaplaty');
    expect(letter.checklist.some((c) => c.item.includes('kwoty długu'))).toBe(true);
  });

  it('links a shared document to multiple cases without duplicate copies', async () => {
    const vault = new LocalVault('vault-shared-test');

    const caseA = vault.createCase({
      id: 'S-0001',
      title: 'Pozwolenie na budowę',
      goalDescription: 'Budowa',
      procedureType: 'administrative',
      authorityOrOpponentName: 'Urząd Miasta',
      authorityJurisdictionReason: 'Właściwość I instancji',
    });

    const caseB = vault.createCase({
      id: 'S-0003',
      title: 'Spór o remont',
      goalDescription: 'Remont',
      procedureType: 'contract_dispute',
      opponentType: 'individual',
      authorityOrOpponentName: 'Wykonawca',
      authorityJurisdictionReason: 'Umowa cywilna',
    });

    const sharedFile = SYNTHETIC_DATASET.find((f) => f.fileName.includes('wypis_i_wyrys'));
    const { document } = await vault.importDocument({
      caseId: caseA.id,
      type: 'other',
      direction: 'internal',
      origin: 'disk_file',
      originalFileName: sharedFile!.fileName,
      mimeType: 'text/plain',
      content: sharedFile!.content,
      subfolder: '03_Dowody',
    });

    expect(document.caseIds).toEqual(['S-0001']);

    // Powiązanie tego samego dokumentu ze sprawą B
    vault.linkDocumentToCase(document.id, caseB.id);

    expect(document.caseIds).toContain('S-0001');
    expect(document.caseIds).toContain('S-0003');
    // Liczba dokumentów w sejfie to nadal dokładnie 1 (brak fizycznej duplikacji!)
    expect(vault.documents.size).toBe(1);
  });
});
