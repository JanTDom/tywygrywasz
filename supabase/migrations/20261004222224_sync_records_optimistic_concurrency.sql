-- TyWygrywasz.pl: optimistic concurrency for zero-knowledge sync envelopes.
-- The payload remains client-encrypted JSON. These columns contain only
-- server metadata needed for atomic compare-and-swap writes.

alter table public.sync_records
  add column if not exists version bigint,
  add column if not exists revision text;

-- Backfill old rows without attempting to inspect or decrypt their manifest.
update public.sync_records
set version = case
  when coalesce(payload->>'version', '') ~ '^[1-9][0-9]{0,15}$'
    then least((payload->>'version')::bigint, 9007199254740991)
  else 1
end
where version is null;

update public.sync_records
set revision = case
  when coalesce(payload->>'revision', '') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then payload->>'revision'
  else 'legacy-' || left(md5(record_id), 48)
end
where revision is null or revision = '';

-- The old top-level hash duplicated a plaintext manifest fingerprint. AES-GCM
-- authentication remains the integrity mechanism for the encrypted envelope.
update public.sync_records
set payload = payload - 'manifestSha256'
where jsonb_typeof(payload) = 'object' and payload ? 'manifestSha256';

alter table public.sync_records
  alter column version set default 1,
  alter column version set not null,
  alter column revision set not null;

create index if not exists sync_records_version_idx
  on public.sync_records (record_id, version);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sync_records_version_positive'
      AND conrelid = 'public.sync_records'::regclass
  ) THEN
    ALTER TABLE public.sync_records
      ADD CONSTRAINT sync_records_version_positive CHECK (version > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sync_records_revision_length'
      AND conrelid = 'public.sync_records'::regclass
  ) THEN
    ALTER TABLE public.sync_records
      ADD CONSTRAINT sync_records_revision_length CHECK (char_length(revision) between 8 and 128);
  END IF;
END $$;

comment on column public.sync_records.version is
  'Monotonic server revision used by atomic compare-and-swap writes.';
comment on column public.sync_records.revision is
  'Opaque client attempt identifier used for idempotent retries.';
