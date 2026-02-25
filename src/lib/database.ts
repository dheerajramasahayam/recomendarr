import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import type { Recommendation, LogEntry } from './types';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
    if (db) {
        // If the DB file was externally deleted, reset the connection
        const dbPath = path.resolve(config.database.path);
        if (!fs.existsSync(dbPath)) {
            try { db.close(); } catch { /* ignore */ }
            db = null;
        } else {
            return db;
        }
    }

    const dbPath = path.resolve(config.database.path);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeDatabase(db);
    return db;
}

function initializeDatabase(db: Database.Database) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      year INTEGER,
      media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'series')),
      tmdb_id INTEGER,
      tvdb_id INTEGER,
      imdb_id TEXT,
      overview TEXT,
      poster_url TEXT,
      genres TEXT,
      vote_average REAL,
      source TEXT NOT NULL CHECK(source IN ('tmdb', 'ai')),
      ai_reasoning TEXT,
      based_on TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'added')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
      message TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_history_cache (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL,
      tmdb_id INTEGER,
      tvdb_id INTEGER,
      imdb_id TEXT,
      last_played TEXT,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
    CREATE INDEX IF NOT EXISTS idx_recommendations_tmdb ON recommendations(tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
  `);
}

// ---- Recommendation CRUD ----

export function addRecommendation(rec: Recommendation): Recommendation {
    const db = getDatabase();
    const id = rec.id || crypto.randomUUID();

    // Check for duplicates by tmdb_id
    if (rec.tmdbId) {
        const existing = db.prepare(
            'SELECT id FROM recommendations WHERE tmdb_id = ? AND media_type = ?'
        ).get(rec.tmdbId, rec.mediaType) as { id: string } | undefined;
        if (existing) return { ...rec, id: existing.id };
    }

    db.prepare(`
    INSERT INTO recommendations (id, title, year, media_type, tmdb_id, tvdb_id, imdb_id, overview, poster_url, genres, vote_average, source, ai_reasoning, based_on, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        id, rec.title, rec.year || null, rec.mediaType,
        rec.tmdbId || null, rec.tvdbId || null, rec.imdbId || null,
        rec.overview || null, rec.posterUrl || null,
        rec.genres ? JSON.stringify(rec.genres) : null,
        rec.voteAverage || null, rec.source,
        rec.aiReasoning || null, rec.basedOn || null,
        rec.status
    );

    return { ...rec, id };
}

export function getRecommendations(status?: string, limit = 50, offset = 0): Recommendation[] {
    const db = getDatabase();
    let query = 'SELECT * FROM recommendations';
    const params: (string | number)[] = [];

    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(rowToRecommendation);
}

export function updateRecommendationStatus(id: string, status: string): boolean {
    const db = getDatabase();
    const result = db.prepare(
        "UPDATE recommendations SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, id);
    return result.changes > 0;
}

export function getRecommendationCounts(): Record<string, number> {
    const db = getDatabase();
    const rows = db.prepare(
        'SELECT status, COUNT(*) as count FROM recommendations GROUP BY status'
    ).all() as { status: string; count: number }[];

    const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0, added: 0, total: 0 };
    for (const row of rows) {
        counts[row.status] = row.count;
        counts.total += row.count;
    }
    return counts;
}

function rowToRecommendation(row: Record<string, unknown>): Recommendation {
    return {
        id: row.id as string,
        title: row.title as string,
        year: row.year as number | undefined,
        mediaType: row.media_type as 'movie' | 'series',
        tmdbId: row.tmdb_id as number | undefined,
        tvdbId: row.tvdb_id as number | undefined,
        imdbId: row.imdb_id as string | undefined,
        overview: row.overview as string | undefined,
        posterUrl: row.poster_url as string | undefined,
        genres: row.genres ? JSON.parse(row.genres as string) : undefined,
        voteAverage: row.vote_average as number | undefined,
        source: row.source as 'tmdb' | 'ai',
        aiReasoning: row.ai_reasoning as string | undefined,
        basedOn: row.based_on as string | undefined,
        status: row.status as 'pending' | 'approved' | 'rejected' | 'added',
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ---- Logs ----

export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
    const db = getDatabase();
    db.prepare(
        'INSERT INTO logs (level, message, source, details) VALUES (?, ?, ?, ?)'
    ).run(entry.level, entry.message, entry.source, entry.details || null);
}

export function getLogs(level?: string, limit = 100, offset = 0): LogEntry[] {
    const db = getDatabase();
    let query = 'SELECT * FROM logs';
    const params: (string | number)[] = [];

    if (level) {
        query += ' WHERE level = ?';
        params.push(level);
    }
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params) as LogEntry[];
}

export function clearLogs(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM logs').run();
}

// ---- Settings ----

export function getSetting(key: string): string | null {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
    const db = getDatabase();
    db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value);
}

export function getAllSettings(): Record<string, string> {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
        settings[row.key] = row.value;
    }
    return settings;
}
