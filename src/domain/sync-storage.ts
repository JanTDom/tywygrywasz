/** Local sync state belongs to both an account (or "local") and a vault. */
function syncStorageIdentity(ownerId: string, vaultId: string): string {
  if (![ownerId, vaultId].every((value) => typeof value === 'string' && value.trim().length > 0)) {
    throw new Error('Stan synchronizacji wymaga identyfikatora właściciela i sejfu.');
  }
  // Preserve the exact identifiers; JSON framing keeps separators unambiguous.
  return JSON.stringify([ownerId, vaultId]);
}

/** Legacy keys containing only vaultId remain untouched: their owner is unknown. */
export function syncCheckpointStorageKey(ownerId: string, vaultId: string): string {
  return `tywygrywasz-sync-checkpoint-${syncStorageIdentity(ownerId, vaultId)}`;
}

export function syncBaseStorageKey(ownerId: string, vaultId: string): string {
  return `tywygrywasz-sync-base-${syncStorageIdentity(ownerId, vaultId)}`;
}
