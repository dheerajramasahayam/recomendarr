import axios, { AxiosInstance } from 'axios';
import { getConfig } from './config';
import type { WatchedItem, MediaServerConfig } from './types';
import { addLog } from './database';

// ============================================
// Unified Media Server Connector
// ============================================

export interface MediaServerConnector {
    testConnection(): Promise<boolean>;
    getWatchHistory(limit?: number): Promise<WatchedItem[]>;
    getUsers(): Promise<{ id: string; name: string }[]>;
}

// ============================================
// Jellyfin Connector
// ============================================
class JellyfinConnector implements MediaServerConnector {
    private client: AxiosInstance;
    private cfg: MediaServerConfig;

    constructor(cfg: MediaServerConfig) {
        this.cfg = cfg;
        this.client = axios.create({
            baseURL: cfg.url,
            headers: {
                'X-Emby-Token': cfg.apiKey,
                'Content-Type': 'application/json',
            },
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            const res = await this.client.get('/System/Info');
            addLog({ level: 'INFO', message: `Connected to Jellyfin: ${res.data.ServerName}`, source: 'jellyfin' });
            return true;
        } catch (err) {
            addLog({ level: 'ERROR', message: `Failed to connect to Jellyfin: ${(err as Error).message}`, source: 'jellyfin' });
            return false;
        }
    }

    async getUsers(): Promise<{ id: string; name: string }[]> {
        const res = await this.client.get('/Users');
        return res.data.map((u: { Id: string; Name: string }) => ({ id: u.Id, name: u.Name }));
    }

    async getWatchHistory(limit = 50): Promise<WatchedItem[]> {
        const userId = this.cfg.userId;
        const res = await this.client.get(`/Users/${userId}/Items`, {
            params: {
                SortBy: 'DatePlayed',
                SortOrder: 'Descending',
                IsPlayed: true,
                Fields: 'ProviderIds,Genres,Overview,UserData',
                IncludeItemTypes: 'Movie,Series',
                Limit: limit,
                Recursive: true,
            },
        });

        const items: WatchedItem[] = res.data.Items.map((item: Record<string, unknown>) => {
            const providerIds = (item.ProviderIds || {}) as Record<string, string>;
            const userData = (item.UserData || {}) as Record<string, unknown>;
            return {
                title: item.Name as string,
                year: item.ProductionYear as number | undefined,
                mediaType: item.Type === 'Movie' ? 'movie' : 'series',
                tmdbId: providerIds.Tmdb ? parseInt(providerIds.Tmdb) : undefined,
                tvdbId: providerIds.Tvdb ? parseInt(providerIds.Tvdb) : undefined,
                imdbId: providerIds.Imdb || undefined,
                genres: (item.Genres || []) as string[],
                lastPlayedDate: userData.LastPlayedDate as string | undefined,
                playCount: userData.PlayCount as number | undefined,
                overview: item.Overview as string | undefined,
                posterUrl: item.ImageTags && (item.ImageTags as Record<string, string>).Primary
                    ? `${this.cfg.url}/Items/${item.Id}/Images/Primary`
                    : undefined,
            };
        });

        addLog({ level: 'INFO', message: `Fetched ${items.length} watched items from Jellyfin`, source: 'jellyfin' });
        return items;
    }
}

// ============================================
// Plex Connector
// ============================================
class PlexConnector implements MediaServerConnector {
    private client: AxiosInstance;
    private cfg: MediaServerConfig;

    constructor(cfg: MediaServerConfig) {
        this.cfg = cfg;
        this.client = axios.create({
            baseURL: cfg.url,
            headers: {
                'X-Plex-Token': cfg.plexToken || cfg.apiKey,
                Accept: 'application/json',
            },
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            const res = await this.client.get('/');
            const serverName = res.data?.MediaContainer?.friendlyName || 'Plex Server';
            addLog({ level: 'INFO', message: `Connected to Plex: ${serverName}`, source: 'plex' });
            return true;
        } catch (err) {
            addLog({ level: 'ERROR', message: `Failed to connect to Plex: ${(err as Error).message}`, source: 'plex' });
            return false;
        }
    }

    async getUsers(): Promise<{ id: string; name: string }[]> {
        // Plex primary user
        try {
            const res = await this.client.get('/accounts');
            const accounts = res.data?.MediaContainer?.Account || [];
            return accounts.map((a: { id: number; name: string }) => ({
                id: String(a.id),
                name: a.name,
            }));
        } catch {
            return [{ id: '1', name: 'Primary User' }];
        }
    }

    async getWatchHistory(limit = 50): Promise<WatchedItem[]> {
        // Get all library sections first
        const sectionsRes = await this.client.get('/library/sections');
        const sections = sectionsRes.data?.MediaContainer?.Directory || [];
        const items: WatchedItem[] = [];

        for (const section of sections) {
            if (section.type !== 'movie' && section.type !== 'show') continue;
            try {
                const res = await this.client.get(`/library/sections/${section.key}/recentlyViewed`, {
                    params: { 'X-Plex-Container-Size': limit },
                });
                const media = res.data?.MediaContainer?.Metadata || [];
                for (const item of media) {
                    items.push({
                        title: item.title,
                        year: item.year,
                        mediaType: section.type === 'movie' ? 'movie' : 'series',
                        genres: item.Genre?.map((g: { tag: string }) => g.tag) || [],
                        lastPlayedDate: item.lastViewedAt ? new Date(item.lastViewedAt * 1000).toISOString() : undefined,
                        overview: item.summary,
                        posterUrl: item.thumb ? `${this.cfg.url}${item.thumb}?X-Plex-Token=${this.cfg.plexToken || this.cfg.apiKey}` : undefined,
                    });
                }
            } catch (err) {
                addLog({ level: 'WARN', message: `Error fetching Plex section ${section.title}: ${(err as Error).message}`, source: 'plex' });
            }
        }

        addLog({ level: 'INFO', message: `Fetched ${items.length} watched items from Plex`, source: 'plex' });
        return items.slice(0, limit);
    }
}

// ============================================
// Emby Connector
// ============================================
class EmbyConnector implements MediaServerConnector {
    private client: AxiosInstance;
    private cfg: MediaServerConfig;

    constructor(cfg: MediaServerConfig) {
        this.cfg = cfg;
        this.client = axios.create({
            baseURL: cfg.url,
            headers: {
                'X-Emby-Token': cfg.apiKey,
                'Content-Type': 'application/json',
            },
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            const res = await this.client.get('/System/Info');
            addLog({ level: 'INFO', message: `Connected to Emby: ${res.data.ServerName}`, source: 'emby' });
            return true;
        } catch (err) {
            addLog({ level: 'ERROR', message: `Failed to connect to Emby: ${(err as Error).message}`, source: 'emby' });
            return false;
        }
    }

    async getUsers(): Promise<{ id: string; name: string }[]> {
        const res = await this.client.get('/Users');
        return res.data.map((u: { Id: string; Name: string }) => ({ id: u.Id, name: u.Name }));
    }

    async getWatchHistory(limit = 50): Promise<WatchedItem[]> {
        const userId = this.cfg.userId;
        const res = await this.client.get(`/Users/${userId}/Items`, {
            params: {
                SortBy: 'DatePlayed',
                SortOrder: 'Descending',
                IsPlayed: true,
                Fields: 'ProviderIds,Genres,Overview,UserData',
                IncludeItemTypes: 'Movie,Series',
                Limit: limit,
                Recursive: true,
            },
        });

        const items: WatchedItem[] = res.data.Items.map((item: Record<string, unknown>) => {
            const providerIds = (item.ProviderIds || {}) as Record<string, string>;
            const userData = (item.UserData || {}) as Record<string, unknown>;
            return {
                title: item.Name as string,
                year: item.ProductionYear as number | undefined,
                mediaType: item.Type === 'Movie' ? 'movie' : 'series',
                tmdbId: providerIds.Tmdb ? parseInt(providerIds.Tmdb) : undefined,
                tvdbId: providerIds.Tvdb ? parseInt(providerIds.Tvdb) : undefined,
                imdbId: providerIds.Imdb || undefined,
                genres: (item.Genres || []) as string[],
                lastPlayedDate: userData.LastPlayedDate as string | undefined,
                playCount: userData.PlayCount as number | undefined,
                overview: item.Overview as string | undefined,
                posterUrl: item.ImageTags && (item.ImageTags as Record<string, string>).Primary
                    ? `${this.cfg.url}/Items/${item.Id}/Images/Primary`
                    : undefined,
            };
        });

        addLog({ level: 'INFO', message: `Fetched ${items.length} watched items from Emby`, source: 'emby' });
        return items;
    }
}

// ============================================
// Factory
// ============================================
export function createMediaServerConnector(cfg?: MediaServerConfig): MediaServerConnector {
    const c = cfg || getConfig().mediaServer;
    switch (c.type) {
        case 'jellyfin':
            return new JellyfinConnector(c);
        case 'plex':
            return new PlexConnector(c);
        case 'emby':
            return new EmbyConnector(c);
        default:
            throw new Error(`Unsupported media server type: ${c.type}`);
    }
}
