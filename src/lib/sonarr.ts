import axios, { AxiosInstance } from 'axios';
import { getConfig } from './config';
import { addLog } from './database';
import type { QualityProfile, RootFolder } from './types';

// ============================================
// Sonarr Service — Add/Manage TV Series
// ============================================

function getClient(): AxiosInstance {
    const config = getConfig();
    return axios.create({
        baseURL: config.sonarr.url,
        headers: {
            'X-Api-Key': config.sonarr.apiKey,
            'Content-Type': 'application/json',
        },
    });
}

export async function testSonarrConnection(): Promise<boolean> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/system/status');
        addLog({ level: 'INFO', message: `Connected to Sonarr v${res.data.version}`, source: 'sonarr' });
        return true;
    } catch (err) {
        addLog({ level: 'ERROR', message: `Failed to connect to Sonarr: ${(err as Error).message}`, source: 'sonarr' });
        return false;
    }
}

export async function getSonarrQualityProfiles(): Promise<QualityProfile[]> {
    const client = getClient();
    const res = await client.get('/api/v3/qualityprofile');
    return res.data.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }));
}

export async function getSonarrRootFolders(): Promise<RootFolder[]> {
    const client = getClient();
    const res = await client.get('/api/v3/rootfolder');
    return res.data.map((f: { id: number; path: string; freeSpace: number }) => ({
        id: f.id,
        path: f.path,
        freeSpace: f.freeSpace,
    }));
}

export async function checkSeriesExists(tvdbId: number): Promise<boolean> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/series');
        const existing = res.data.find((s: { tvdbId: number }) => s.tvdbId === tvdbId);
        return !!existing;
    } catch {
        return false;
    }
}

export async function getAllSonarrSeries(): Promise<{ tvdbId?: number; title: string }[]> {
    const client = getClient();
    const res = await client.get('/api/v3/series');
    return (res.data || []).map((s: { tvdbId?: number; title: string }) => ({
        tvdbId: s.tvdbId,
        title: s.title,
    }));
}

export async function lookupSeriesByTvdb(tvdbId: number): Promise<Record<string, unknown> | null> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/series/lookup', {
            params: { term: `tvdb:${tvdbId}` },
        });
        return res.data?.[0] || null;
    } catch (err) {
        addLog({ level: 'ERROR', message: `Sonarr lookup failed for tvdb:${tvdbId}: ${(err as Error).message}`, source: 'sonarr' });
        return null;
    }
}

export async function lookupSeriesByTerm(term: string): Promise<Record<string, unknown>[]> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/series/lookup', {
            params: { term },
        });
        return res.data || [];
    } catch (err) {
        addLog({ level: 'ERROR', message: `Sonarr search failed for "${term}": ${(err as Error).message}`, source: 'sonarr' });
        return [];
    }
}

export async function addSeriesToSonarr(
    tvdbId: number,
    qualityProfileId?: number,
    rootFolderPath?: string,
    searchForContent?: boolean
): Promise<{ success: boolean; message: string }> {
    try {
        // Check if already exists
        const exists = await checkSeriesExists(tvdbId);
        if (exists) {
            addLog({ level: 'INFO', message: `Series tvdb:${tvdbId} already exists in Sonarr`, source: 'sonarr' });
            return { success: false, message: 'Series already exists in Sonarr' };
        }

        // Lookup series metadata
        const seriesData = await lookupSeriesByTvdb(tvdbId);
        if (!seriesData) {
            return { success: false, message: `Could not find series with tvdb:${tvdbId}` };
        }

        const client = getClient();
        const cfg = getConfig();
        const payload = {
            ...seriesData,
            qualityProfileId: qualityProfileId || cfg.sonarr.qualityProfileId,
            rootFolderPath: rootFolderPath || cfg.sonarr.rootFolder,
            monitored: true,
            addOptions: {
                searchForMissingEpisodes: searchForContent !== undefined ? searchForContent : true,
            },
        };

        await client.post('/api/v3/series', payload);
        addLog({
            level: 'INFO',
            message: `Added series "${seriesData.title}" (tvdb:${tvdbId}) to Sonarr`,
            source: 'sonarr',
        });
        return { success: true, message: `Added "${seriesData.title}" to Sonarr` };
    } catch (err) {
        const msg = `Failed to add series tvdb:${tvdbId}: ${(err as Error).message}`;
        addLog({ level: 'ERROR', message: msg, source: 'sonarr' });
        return { success: false, message: msg };
    }
}
