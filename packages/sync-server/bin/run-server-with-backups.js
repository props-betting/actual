#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { Storage } from '@google-cloud/storage';
import Database from 'better-sqlite3';

const DEFAULT_BACKUP_INTERVAL_SECONDS = 3600;
const actualServerEntrypoint = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'actual-server.js',
);
const seedDataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../seed-data',
);
const syndicateDemoManifestPath = path.join(
  seedDataDir,
  'betting-syndicate-demo.json',
);
const syndicateDemoBlobPath = path.join(
  seedDataDir,
  'betting-syndicate-demo.blob',
);

function log(message) {
  console.info(`[actual-backup] ${message}`);
}

function normalizePrefix(...parts) {
  return parts
    .flatMap(part => part.split('/'))
    .map(part => part.trim())
    .filter(Boolean)
    .join('/');
}

function parseBucketSpec(spec, explicitPrefix = '') {
  const trimmed = spec.trim();

  if (!trimmed) {
    throw new Error('ACTUAL_BACKUP_BUCKET must not be empty');
  }

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice('gs://'.length);
    const [bucketName, ...prefixParts] = withoutScheme.split('/').filter(Boolean);

    if (!bucketName) {
      throw new Error(
        `ACTUAL_BACKUP_BUCKET is invalid: ${JSON.stringify(spec)}`,
      );
    }

    return {
      bucketName,
      prefix: normalizePrefix(prefixParts.join('/'), explicitPrefix),
    };
  }

  const [bucketName, ...prefixParts] = trimmed.split('/').filter(Boolean);

  if (!bucketName) {
    throw new Error(`ACTUAL_BACKUP_BUCKET is invalid: ${JSON.stringify(spec)}`);
  }

  return {
    bucketName,
    prefix: normalizePrefix(prefixParts.join('/'), explicitPrefix),
  };
}

function readConfigDataDir(configPath) {
  const configJson = JSON.parse(readFileSync(configPath, 'utf-8'));
  return configJson.dataDir ? path.resolve(configJson.dataDir) : undefined;
}

function resolveDataDir(cliArgs) {
  if (process.env.ACTUAL_DATA_DIR) {
    return path.resolve(process.env.ACTUAL_DATA_DIR);
  }

  const { values } = parseArgs({
    args: cliArgs,
    options: {
      config: {
        type: 'string',
      },
    },
    allowPositionals: true,
    strict: false,
  });

  const configPath = values.config || (existsSync('./config.json') ? './config.json' : undefined);

  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`Config file does not exist: ${String(configPath)}`);
    }

    const configuredDataDir = readConfigDataDir(configPath);

    if (configuredDataDir) {
      return configuredDataDir;
    }
  }

  if (existsSync('/data')) {
    return '/data';
  }

  return path.resolve('./');
}

function getBackupConfig(dataDir) {
  const rawBucket = process.env.ACTUAL_BACKUP_BUCKET;

  if (!rawBucket) {
    return null;
  }

  const intervalSecondsRaw = process.env.ACTUAL_BACKUP_INTERVAL_SECONDS;
  const intervalSeconds =
    intervalSecondsRaw == null || intervalSecondsRaw === ''
      ? DEFAULT_BACKUP_INTERVAL_SECONDS
      : Number(intervalSecondsRaw);

  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) {
    throw new Error(
      'ACTUAL_BACKUP_INTERVAL_SECONDS must be a non-negative number',
    );
  }

  const { bucketName, prefix } = parseBucketSpec(
    rawBucket,
    process.env.ACTUAL_BACKUP_PREFIX || '',
  );

  return {
    bucketName,
    dataDir,
    intervalMs: intervalSeconds * 1000,
    prefix,
    storage: new Storage(),
  };
}

function timestampString() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
}

function sleep(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

async function ensureSyndicateDemoSeeded(dataDir) {
  if (
    !existsSync(syndicateDemoManifestPath) ||
    !existsSync(syndicateDemoBlobPath)
  ) {
    log('Syndicate demo seed assets not present; skipping demo seeding');
    return true;
  }

  const serverFilesDir = path.join(dataDir, 'server-files');
  const userFilesDir = path.join(dataDir, 'user-files');
  const accountDbPath = path.join(serverFilesDir, 'account.sqlite');

  if (!existsSync(accountDbPath)) {
    return false;
  }

  const manifest = JSON.parse(readFileSync(syndicateDemoManifestPath, 'utf-8'));
  const db = new Database(accountDbPath);

  try {
    const hasUsersTable = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      )
      .get();
    const hasFilesTable = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'files'",
      )
      .get();

    if (!hasUsersTable || !hasFilesTable) {
      return false;
    }

    const existingFile = db
      .prepare('SELECT id FROM files WHERE id = ? OR name = ? LIMIT 1')
      .get(manifest.fileId, manifest.name);

    if (existingFile) {
      return true;
    }

    const ownerRow = db
      .prepare(
        `SELECT id
         FROM users
         WHERE owner = 1
         ORDER BY CASE WHEN user_name <> '' THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .get();
    const ownerId = ownerRow?.id || manifest.ownerId;

    db.prepare(
      `INSERT OR IGNORE INTO users
       (id, user_name, display_name, role, enabled, owner)
       VALUES (?, '', '', 'admin', 1, 1)`,
    ).run(ownerId);

    await mkdir(userFilesDir, { recursive: true });
    await copyFile(
      syndicateDemoBlobPath,
      path.join(userFilesDir, `file-${manifest.fileId}.blob`),
    );

    db.prepare(
      `INSERT INTO files
       (id, group_id, sync_version, deleted, name, owner)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).run(
      manifest.fileId,
      manifest.groupId,
      manifest.syncVersion,
      manifest.name,
      ownerId,
    );

    log(`Seeded demo budget "${manifest.name}"`);
    return true;
  } finally {
    db.close();
  }
}

async function seedSyndicateDemoWithRetry(dataDir, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const completed = await ensureSyndicateDemoSeeded(dataDir);

      if (completed) {
        return;
      }
    } catch (error) {
      console.error(error);
    }

    await sleep(1000);
  }

  log('Syndicate demo was not seeded before retry budget expired');
}

async function createArchive(dataDir, destinationPath) {
  const result = await new Promise((resolve, reject) => {
    const tarProcess = spawn(
      'tar',
      ['-czf', destinationPath, '-C', dataDir, '.'],
      {
        stdio: 'inherit',
      },
    );

    tarProcess.once('error', reject);
    tarProcess.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          `tar exited unsuccessfully (code=${String(code)}, signal=${String(signal)})`,
        ),
      );
    });
  });

  return result;
}

async function uploadBackup(backupConfig, reason) {
  await stat(backupConfig.dataDir);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'actual-backup-'));
  const archiveName = `actual-${reason}-${timestampString()}.tar.gz`;
  const archivePath = path.join(tempDir, archiveName);
  const objectName = backupConfig.prefix
    ? `${backupConfig.prefix}/${archiveName}`
    : archiveName;

  try {
    log(`Creating ${reason} backup from ${backupConfig.dataDir}`);
    await createArchive(backupConfig.dataDir, archivePath);
    log(`Uploading backup to gs://${backupConfig.bucketName}/${objectName}`);
    await backupConfig.storage
      .bucket(backupConfig.bucketName)
      .upload(archivePath, {
        destination: objectName,
        metadata: {
          contentType: 'application/gzip',
        },
      });
    log(`Backup upload completed: gs://${backupConfig.bucketName}/${objectName}`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function toExitCode(code, signal) {
  if (typeof code === 'number') {
    return code;
  }

  if (signal && signal in osConstants.signals) {
    return 128 + osConstants.signals[signal];
  }

  return 1;
}

async function main() {
  const cliArgs = process.argv.slice(2);
  const dataDir = resolveDataDir(cliArgs);
  process.env.ACTUAL_DATA_DIR = dataDir;

  const backupConfig = getBackupConfig(dataDir);

  if (backupConfig) {
    log(
      `Backups enabled for ${dataDir} -> gs://${backupConfig.bucketName}/${backupConfig.prefix || ''}`.replace(
        /\/$/,
        '',
      ),
    );
  } else {
    log(`Backups disabled. Using data directory ${dataDir}`);
  }

  const child = spawn('node', [actualServerEntrypoint, ...cliArgs], {
    env: process.env,
    stdio: 'inherit',
  });

  void seedSyndicateDemoWithRetry(dataDir);

  let backupInFlight = null;
  let shuttingDown = false;

  async function runBackup(reason, { force = false } = {}) {
    if (!backupConfig) {
      return;
    }

    if (backupInFlight) {
      if (!force) {
        log(`Skipping ${reason} backup because another backup is still running`);
        return;
      }

      await backupInFlight;
    }

    backupInFlight = uploadBackup(backupConfig, reason).finally(() => {
      backupInFlight = null;
    });

    await backupInFlight;
  }

  const interval =
    backupConfig && backupConfig.intervalMs > 0
      ? setInterval(() => {
          void runBackup('interval');
        }, backupConfig.intervalMs)
      : null;

  if (interval) {
    interval.unref();
  }

  const childExit = new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
    child.once('error', reject);
  });

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (interval) {
      clearInterval(interval);
    }

    log(`Received ${signal}; stopping server before final backup`);

    if (!child.killed) {
      child.kill(signal);
    }

    const { code, signal: childSignal } = await childExit;

    try {
      await runBackup('shutdown', { force: true });
    } catch (error) {
      console.error(error);
    }

    process.exit(toExitCode(code, childSignal));
  }

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  const { code, signal } = await childExit;

  if (interval) {
    clearInterval(interval);
  }

  if (!shuttingDown) {
    try {
      await runBackup('exit', { force: true });
    } catch (error) {
      console.error(error);
    }
  }

  process.exit(toExitCode(code, signal));
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
