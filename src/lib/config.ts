// Dynamic configuration: DB settings → environment variables → defaults
// Settings can be updated from the web UI and are persisted in SQLite

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Built-in TMDb API key (free tier, read-only)
const BUILTIN_TMDB_KEY = '5bcf1f5af3514898e446e763914a826b';

// Database path is always from env or default (since DB stores everything else)
const DB_PATH = process.env.DATABASE_PATH || './data/recomendarr.db';

// Cached settings from DB
let settingsCache: Record<string, string> | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

function getSettingsDb(): Database.Database {
  const dbPath = path.resolve(DB_PATH);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Ensure settings table exists
  db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

  return db;
}

function loadSettings(): Record<string, string> {
  const now = Date.now();
  if (settingsCache && (now - settingsCacheTime) < CACHE_TTL) {
    return settingsCache;
  }

  try {
    const db = getSettingsDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    db.close();
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    settingsCache = settings;
    settingsCacheTime = now;
    return settings;
  } catch {
    return settingsCache || {};
  }
}

// Helper: DB setting → env var → default
function get(key: string, envKey: string, defaultValue: string): string {
  const settings = loadSettings();
  return settings[key] || process.env[envKey] || defaultValue;
}

export function clearSettingsCache(): void {
  settingsCache = null;
  settingsCacheTime = 0;
}

export function saveSetting(key: string, value: string): void {
  try {
    const db = getSettingsDb();
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value);
    db.close();
    clearSettingsCache();
  } catch (err) {
    console.error(`Failed to save setting ${key}:`, err);
  }
}

export function saveSettings(settings: Record<string, string>): void {
  try {
    const db = getSettingsDb();
    const stmt = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    );
    const saveMany = db.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        stmt.run(key, value, value);
      }
    });
    saveMany(Object.entries(settings));
    db.close();
    clearSettingsCache();
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export function getAllSavedSettings(): Record<string, string> {
  return loadSettings();
}

export function isSetupComplete(): boolean {
  const settings = loadSettings();
  return settings['setup_complete'] === 'true';
}

// Dynamic config getter — always reads fresh values
export function getConfig() {
  return {
    mediaServer: {
      type: get('media_server_type', 'MEDIA_SERVER_TYPE', 'plex') as 'jellyfin' | 'plex' | 'emby',
      url: get('media_server_url', 'MEDIA_SERVER_URL', ''),
      apiKey: get('media_server_api_key', 'MEDIA_SERVER_API_KEY', ''),
      userId: get('media_server_user_id', 'MEDIA_SERVER_USER_ID', ''),
      plexToken: get('plex_token', 'PLEX_TOKEN', ''),
    },
    sonarr: {
      url: get('sonarr_url', 'SONARR_URL', ''),
      apiKey: get('sonarr_api_key', 'SONARR_API_KEY', ''),
      qualityProfileId: parseInt(get('sonarr_quality_profile_id', 'SONARR_QUALITY_PROFILE_ID', '1'), 10),
      rootFolder: get('sonarr_root_folder', 'SONARR_ROOT_FOLDER', '/tv'),
    },
    radarr: {
      url: get('radarr_url', 'RADARR_URL', ''),
      apiKey: get('radarr_api_key', 'RADARR_API_KEY', ''),
      qualityProfileId: parseInt(get('radarr_quality_profile_id', 'RADARR_QUALITY_PROFILE_ID', '1'), 10),
      rootFolder: get('radarr_root_folder', 'RADARR_ROOT_FOLDER', '/movies'),
    },
    tmdb: {
      apiKey: get('tmdb_api_key', 'TMDB_API_KEY', BUILTIN_TMDB_KEY),
      baseUrl: 'https://api.themoviedb.org/3',
    },
    ai: {
      enabled: get('ai_enabled', 'AI_ENABLED', 'false') === 'true',
      providerUrl: get('ai_provider_url', 'AI_PROVIDER_URL', 'https://api.openai.com/v1'),
      apiKey: get('ai_api_key', 'AI_API_KEY', ''),
      model: get('ai_model', 'AI_MODEL', 'gpt-4o'),
    },
    scheduler: {
      cronSchedule: get('cron_schedule', 'CRON_SCHEDULE', '0 3 * * *'),
      autoAdd: get('auto_add', 'AUTO_ADD', 'false') === 'true',
    },
    database: {
      path: DB_PATH,
    },
    app: {
      maxRecommendationsPerRun: parseInt(get('max_recommendations', 'MAX_RECOMMENDATIONS_PER_RUN', '20'), 10),
      watchHistoryLimit: parseInt(get('watch_history_limit', 'WATCH_HISTORY_LIMIT', '50'), 10),
    },
  };
}

// Backward-compatible static export (reads once, used by modules that import `config`)
export const config = getConfig();
