/**
 * Local development workspace bridge. It is per authenticated account and is
 * not a browser-wide disk API. Production deployments should use File System
 * Access/OPFS instead of exposing a server filesystem.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { LocalDiskManager } from '@/domain/disk-manager';
import { CaseSubfolder, DocumentRecord } from '@/domain/types';
import { csrfIsValid, jsonError, parseJsonBody, userFromRequest } from '../auth/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const managers = new Map<string, LocalDiskManager>();

function localOnlyResponse(): NextResponse {
  return jsonError('Most plików działa wyłącznie w lokalnej aplikacji. Na wdrożeniu webowym użyj importu plików w przeglądarce.', 410);
}

function managerForUser(userId: string): LocalDiskManager {
  let manager = managers.get(userId);
  if (!manager) {
    manager = new LocalDiskManager(path.join(process.cwd(), 'Moje_sprawy', userId));
    managers.set(userId, manager);
  }
  return manager;
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL === '1') return localOnlyResponse();
  const user = await userFromRequest(req);
  if (!user) return jsonError('Wymagane zalogowanie do lokalnego mostu plików.', 401);
  try {
    const diskManager = managerForUser(user.id);
    await diskManager.initializeWorkspace();
    const scan = await diskManager.scanDiskAndDetectChanges([]);
    const response = NextResponse.json({ success: true, scan, history: diskManager.history }, { headers: { 'Cache-Control': 'no-store' } });
    return response;
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Błąd skanowania katalogu roboczego.', 400);
  }
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL === '1') return localOnlyResponse();
  const user = await userFromRequest(req);
  if (!user) return jsonError('Wymagane zalogowanie do lokalnego mostu plików.', 401);
  if (!csrfIsValid(req)) return jsonError('Nieprawidłowy token formularza.', 403);

  try {
    const body = await parseJsonBody(req, 8 * 1024 * 1024);
    const { action } = body;
    const diskManager = managerForUser(user.id);
    await diskManager.initializeWorkspace();

    if (action === 'create_case_folder') {
      const folderName = typeof body.folderName === 'string' ? body.folderName : '';
      await diskManager.createCaseFolder(folderName);
      return NextResponse.json({ success: true, folderName });
    }

    if (action === 'write_file') {
      const result = await diskManager.writeDocumentFile({
        folderName: typeof body.folderName === 'string' ? body.folderName : undefined,
        subfolder: body.subfolder as CaseSubfolder,
        fileName: typeof body.fileName === 'string' ? body.fileName : '',
        content: typeof body.content === 'string' ? body.content : '',
      });
      const { absolutePath: _absolutePath, ...safeResult } = result;
      return NextResponse.json({ success: true, ...safeResult });
    }

    if (action === 'move_file') {
      const historyEntry = await diskManager.moveFile({
        sourceRelativePath: typeof body.sourceRelativePath === 'string' ? body.sourceRelativePath : '',
        destinationRelativePath: typeof body.destinationRelativePath === 'string' ? body.destinationRelativePath : '',
        description: typeof body.description === 'string' ? body.description : 'Operacja użytkownika',
        documentId: typeof body.documentId === 'string' ? body.documentId : undefined,
      });
      return NextResponse.json({ success: true, historyEntry });
    }

    if (action === 'undo') {
      const undone = await diskManager.undoLastOperation();
      return NextResponse.json({ success: true, undone });
    }

    if (action === 'scan') {
      const knownDocuments = Array.isArray(body.knownDocuments) ? body.knownDocuments : [];
      const scanResult = await diskManager.scanDiskAndDetectChanges(knownDocuments as DocumentRecord[]);
      return NextResponse.json({ success: true, scanResult });
    }

    return jsonError('Nieznana akcja.', 400);
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Błąd operacji dyskowej.', 400);
  }
}
