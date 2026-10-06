import { describe, expect, it } from 'vitest';
import { syncBaseStorageKey, syncCheckpointStorageKey } from '../src/domain/sync-storage';

describe('Przestrzeń lokalnego stanu synchronizacji', () => {
  it('usunięcie punktu B zachowuje punkt A i nieprzypisane stare zapisy tego samego sejfu', () => {
    const vaultId = 'sejf-lokalny-01';
    const checkpointA = syncCheckpointStorageKey('owner-a', vaultId);
    const checkpointB = syncCheckpointStorageKey('owner-b', vaultId);
    const baseA = syncBaseStorageKey('owner-a', vaultId);
    const baseB = syncBaseStorageKey('owner-b', vaultId);
    const legacyCheckpoint = `tywygrywasz-sync-checkpoint-${vaultId}`;
    const legacyBase = `tywygrywasz-sync-base-${vaultId}`;
    const storage = new Map([
      [checkpointA, 'encrypted-checkpoint-a'],
      [checkpointB, 'encrypted-checkpoint-b'],
      [baseA, 'revision-a'],
      [baseB, 'revision-b'],
      [legacyCheckpoint, 'encrypted-checkpoint-unknown-owner'],
      [legacyBase, 'revision-unknown-owner'],
    ]);

    expect(new Set([checkpointA, checkpointB, baseA, baseB, legacyCheckpoint, legacyBase]).size).toBe(6);
    storage.delete(checkpointB);
    storage.delete(baseB);

    expect(storage.get(checkpointA)).toBe('encrypted-checkpoint-a');
    expect(storage.get(baseA)).toBe('revision-a');
    expect(storage.get(legacyCheckpoint)).toBe('encrypted-checkpoint-unknown-owner');
    expect(storage.get(legacyBase)).toBe('revision-unknown-owner');
  });

  it('przestrzeń sejfu bez konta jest oddzielona od konta z tą samą kopią', () => {
    expect(syncCheckpointStorageKey('local', 'shared-vault')).not.toBe(syncCheckpointStorageKey('owner-a', 'shared-vault'));
    expect(syncBaseStorageKey('local', 'shared-vault')).not.toBe(syncBaseStorageKey('owner-a', 'shared-vault'));
  });

  it('zachowuje jednoznaczne pary identyfikatorów zawierających separatory i znaki JSON', () => {
    const pairs: Array<[string, string]> = [
      ['a-b', 'c'],
      ['a', 'b-c'],
      ['a:b', 'c'],
      ['a', 'b:c'],
      ['a","b', 'c'],
      ['a', 'b","c'],
    ];
    expect(new Set(pairs.map(([owner, vault]) => syncCheckpointStorageKey(owner, vault))).size).toBe(pairs.length);
    expect(new Set(pairs.map(([owner, vault]) => syncBaseStorageKey(owner, vault))).size).toBe(pairs.length);
  });

  it('używa uzgodnionego formatu bez normalizacji identyfikatorów', () => {
    expect(syncCheckpointStorageKey('owner-a', 'vault-1')).toBe('tywygrywasz-sync-checkpoint-["owner-a","vault-1"]');
    expect(syncBaseStorageKey('owner-a', 'vault-1')).toBe('tywygrywasz-sync-base-["owner-a","vault-1"]');
    expect(syncCheckpointStorageKey(' owner-a', 'vault-1')).not.toBe(syncCheckpointStorageKey('owner-a', 'vault-1'));
  });

  for (const [name, keyFor] of [
    ['checkpoint', syncCheckpointStorageKey],
    ['base', syncBaseStorageKey],
  ] as const) {
    it.each(['', ' ', '\n\t', undefined, null, 12])(`${name} odrzuca brakujący lub nieprawidłowy identyfikator: %s`, (invalid) => {
      expect(() => keyFor(invalid as string, 'vault-1')).toThrow('właściciela i sejfu');
      expect(() => keyFor('owner-a', invalid as string)).toThrow('właściciela i sejfu');
    });
  }
});
