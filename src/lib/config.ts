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
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`CRITICAL: Failed to create database directory at ${dir}`, err);
      throw new Error(`Cannot write to ${dir}. Check your TrueNAS/Docker volume permissions!`);
    }
  }

  try {
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
  } catch (err) {
    console.error('CRITICAL: SQLite failed to open the database file:', err);
    throw new Error(`Database error: ${(err as Error).message}. Check /app/data volume permissions.`);
  }
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
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    return settings[key];
  }
  if (process.env[envKey] !== undefined) {
    return process.env[envKey] as string;
  }
  return defaultValue;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true';
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function withFallback(value: string | undefined, fallback: string): string {
  return value === undefined ? fallback : value;
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
    throw err;
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
    throw err;
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
      enabled: get('scheduler_enabled', 'SCHEDULER_ENABLED', 'true') === 'true',
      cronSchedule: get('cron_schedule', 'CRON_SCHEDULE', '0 0,8,16 * * *'),
      autoAdd: get('auto_add', 'AUTO_ADD', 'false') === 'true',
    },
    notifications: {
      discordEnabled: get('discord_enabled', 'DISCORD_ENABLED', 'false') === 'true',
      discordWebhookUrl: get('discord_webhook_url', 'DISCORD_WEBHOOK_URL', ''),
      telegramEnabled: get('telegram_enabled', 'TELEGRAM_ENABLED', 'false') === 'true',
      telegramBotToken: get('telegram_bot_token', 'TELEGRAM_BOT_TOKEN', ''),
      telegramChatId: get('telegram_chat_id', 'TELEGRAM_CHAT_ID', ''),
      notifyOnRunComplete: get('notify_on_run_complete', 'NOTIFY_ON_RUN_COMPLETE', 'true') === 'true',
      notifyOnNewRecommendations: get('notify_on_new_recommendations', 'NOTIFY_ON_NEW_RECOMMENDATIONS', 'true') === 'true',
      notifyOnErrors: get('notify_on_errors', 'NOTIFY_ON_ERRORS', 'true') === 'true',
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

export type AppConfig = ReturnType<typeof getConfig>;

export function getConfigWithOverrides(overrides: Record<string, string> = {}): AppConfig {
  const config = getConfig();

  return {
    ...config,
    mediaServer: {
      ...config.mediaServer,
      type: withFallback(overrides.media_server_type, config.mediaServer.type) as 'jellyfin' | 'plex' | 'emby',
      url: withFallback(overrides.media_server_url, config.mediaServer.url),
      apiKey: withFallback(overrides.media_server_api_key, config.mediaServer.apiKey),
      userId: withFallback(overrides.media_server_user_id, config.mediaServer.userId),
      plexToken: withFallback(overrides.plex_token, config.mediaServer.plexToken || config.mediaServer.apiKey),
    },
    sonarr: {
      ...config.sonarr,
      url: withFallback(overrides.sonarr_url, config.sonarr.url),
      apiKey: withFallback(overrides.sonarr_api_key, config.sonarr.apiKey),
      qualityProfileId: parseInteger(overrides.sonarr_quality_profile_id, config.sonarr.qualityProfileId),
      rootFolder: withFallback(overrides.sonarr_root_folder, config.sonarr.rootFolder),
    },
    radarr: {
      ...config.radarr,
      url: withFallback(overrides.radarr_url, config.radarr.url),
      apiKey: withFallback(overrides.radarr_api_key, config.radarr.apiKey),
      qualityProfileId: parseInteger(overrides.radarr_quality_profile_id, config.radarr.qualityProfileId),
      rootFolder: withFallback(overrides.radarr_root_folder, config.radarr.rootFolder),
    },
    ai: {
      ...config.ai,
      enabled: parseBoolean(overrides.ai_enabled, config.ai.enabled),
      providerUrl: withFallback(overrides.ai_provider_url, config.ai.providerUrl),
      apiKey: withFallback(overrides.ai_api_key, config.ai.apiKey),
      model: withFallback(overrides.ai_model, config.ai.model),
    },
    scheduler: {
      ...config.scheduler,
      enabled: parseBoolean(overrides.scheduler_enabled, config.scheduler.enabled),
      cronSchedule: withFallback(overrides.cron_schedule, config.scheduler.cronSchedule),
      autoAdd: parseBoolean(overrides.auto_add, config.scheduler.autoAdd),
    },
    notifications: {
      ...config.notifications,
      discordEnabled: parseBoolean(overrides.discord_enabled, config.notifications.discordEnabled),
      discordWebhookUrl: withFallback(overrides.discord_webhook_url, config.notifications.discordWebhookUrl),
      telegramEnabled: parseBoolean(overrides.telegram_enabled, config.notifications.telegramEnabled),
      telegramBotToken: withFallback(overrides.telegram_bot_token, config.notifications.telegramBotToken),
      telegramChatId: withFallback(overrides.telegram_chat_id, config.notifications.telegramChatId),
      notifyOnRunComplete: parseBoolean(overrides.notify_on_run_complete, config.notifications.notifyOnRunComplete),
      notifyOnNewRecommendations: parseBoolean(overrides.notify_on_new_recommendations, config.notifications.notifyOnNewRecommendations),
      notifyOnErrors: parseBoolean(overrides.notify_on_errors, config.notifications.notifyOnErrors),
    },
    app: {
      ...config.app,
      maxRecommendationsPerRun: parseInteger(overrides.max_recommendations, config.app.maxRecommendationsPerRun),
      watchHistoryLimit: parseInteger(overrides.watch_history_limit, config.app.watchHistoryLimit),
    },
  };
}

// Backward-compatible static export (reads once, used by modules that import `config`)
export const config = getConfig();
