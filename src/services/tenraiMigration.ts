import {
  getRawStoredValue,
  getStoredValue,
  listRawStoredKeys,
  removeRawStoredValue,
  setRawStoredValue,
  setStoredValue,
} from './store';

// One-off migration for the Jikan -> Tenrai cutover.
//
// Jikan (api.jikan.moe) shut down; the app now reads from Tenrai (api.tenrai.org), which
// serves the same v4 schema. Everything named after the old provider was renamed, and this
// module rewrites the data already sitting in the store so existing installs keep their
// history, playlists, library and cached metadata:
//
//   - `jikanCache` / `jikanMeta` store keys  -> `tenraiCache` / `tenraiMeta`
//   - `jikan:<path>` cache entry keys        -> `tenrai:<path>`
//   - `jikanId` on any persisted anime record -> `tenraiId`
//   - `baseCatalogSource: 'jikan'`            -> `'tenrai'`
//   - `apiHealthRuntime.jikan`                -> `apiHealthRuntime.tenrai`
//
// Keys are walked raw so that every profile-scoped copy (`profile:<id>:playlists` and
// friends) is migrated, not just the active profile's.

const MIGRATION_FLAG_KEY = 'tenraiStoreMigrated';
const PROFILE_PREFIX = 'profile:';

const LEGACY_KEY_RENAMES: Record<string, string> = {
  jikanCache: 'tenraiCache',
  jikanMeta: 'tenraiMeta',
};

function splitProfilePrefix(rawKey: string) {
  if (!rawKey.startsWith(PROFILE_PREFIX)) return { prefix: '', baseKey: rawKey };

  const separatorIndex = rawKey.indexOf(':', PROFILE_PREFIX.length);
  if (separatorIndex < 0) return { prefix: '', baseKey: rawKey };

  return {
    prefix: rawKey.slice(0, separatorIndex + 1),
    baseKey: rawKey.slice(separatorIndex + 1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Recursively rename the `jikanId` property. Every persisted `jikanId` is our own
// normalized field (raw provider payloads are never stored), so this is safe to run
// across the whole store.
function renameJikanIdDeep(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const result = renameJikanIdDeep(entry);
      if (result.changed) changed = true;
      return result.value;
    });
    return changed ? { value: next, changed: true } : { value, changed: false };
  }

  if (!isRecord(value)) return { value, changed: false };

  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    const result = renameJikanIdDeep(entry);
    if (result.changed) changed = true;

    if (key === 'jikanId') {
      changed = true;
      // A `tenraiId` written by a newer run always wins over the legacy field.
      if (!('tenraiId' in value)) next.tenraiId = result.value;
      continue;
    }

    next[key] = result.value;
  }

  return changed ? { value: next, changed: true } : { value, changed: false };
}

function migrateCacheEntryKeys(value: unknown) {
  if (!isRecord(value)) return { value, changed: false };

  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith('jikan:')) {
      changed = true;
      next[`tenrai:${key.slice('jikan:'.length)}`] = entry;
      continue;
    }
    next[key] = entry;
  }

  return changed ? { value: next, changed: true } : { value, changed: false };
}

function migrateBaseCatalogSource(value: unknown) {
  if (value === 'jikan') return { value: 'tenrai', changed: true };
  return { value, changed: false };
}

function migrateApiHealthRuntime(value: unknown) {
  if (!isRecord(value) || !('jikan' in value)) return { value, changed: false };

  const { jikan, ...rest } = value;
  return {
    value: { ...rest, tenrai: 'tenrai' in value ? value.tenrai : jikan },
    changed: true,
  };
}

async function migrateRawKey(rawKey: string) {
  const { prefix, baseKey } = splitProfilePrefix(rawKey);
  const stored = await getRawStoredValue(rawKey);
  if (stored === undefined) return;

  let value: unknown = stored;
  let changed = false;

  const applyStep = (step: { value: unknown; changed: boolean }) => {
    value = step.value;
    if (step.changed) changed = true;
  };

  if (baseKey === 'jikanCache' || baseKey === 'jikanMeta') {
    applyStep(migrateCacheEntryKeys(value));
  } else if (baseKey === 'baseCatalogSource') {
    applyStep(migrateBaseCatalogSource(value));
  } else if (baseKey === 'apiHealthRuntime') {
    applyStep(migrateApiHealthRuntime(value));
  }

  applyStep(renameJikanIdDeep(value));

  const renamedBaseKey = LEGACY_KEY_RENAMES[baseKey];
  if (renamedBaseKey) {
    await setRawStoredValue(`${prefix}${renamedBaseKey}`, value);
    await removeRawStoredValue(rawKey);
    return;
  }

  if (changed) await setRawStoredValue(rawKey, value);
}

export async function migrateJikanStoreDataToTenrai() {
  if (await getStoredValue(MIGRATION_FLAG_KEY, false)) return;

  try {
    const rawKeys = await listRawStoredKeys();
    for (const rawKey of rawKeys) {
      await migrateRawKey(rawKey);
    }
  } catch (error) {
    // Never block startup on the migration; the read-time fallbacks still cover the
    // legacy shapes, and the flag stays unset so the next launch retries.
    console.warn('Tenrai store migration failed; continuing with legacy data.', error);
    return;
  }

  await setStoredValue(MIGRATION_FLAG_KEY, true);
}
