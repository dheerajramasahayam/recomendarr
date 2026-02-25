import axios, { AxiosInstance } from 'axios';
import { getConfig } from './config';
import { addLog } from './database';
import type { QualityProfile, RootFolder } from './types';

// ============================================
// Radarr Service — Add/Manage Movies
// ============================================

function getClient(): AxiosInstance {
    const config = getConfig();
    return axios.create({
        baseURL: config.radarr.url,
        headers: {
            'X-Api-Key': config.radarr.apiKey,
            'Content-Type': 'application/json',
        },
    });
}

export async function testRadarrConnection(): Promise<boolean> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/system/status');
        addLog({ level: 'INFO', message: `Connected to Radarr v${res.data.version}`, source: 'radarr' });
        return true;
    } catch (err) {
        addLog({ level: 'ERROR', message: `Failed to connect to Radarr: ${(err as Error).message}`, source: 'radarr' });
        return false;
    }
}

export async function getRadarrQualityProfiles(): Promise<QualityProfile[]> {
    const client = getClient();
    const res = await client.get('/api/v3/qualityprofile');
    return res.data.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }));
}

export async function getRadarrRootFolders(): Promise<RootFolder[]> {
    const client = getClient();
    const res = await client.get('/api/v3/rootfolder');
    return res.data.map((f: { id: number; path: string; freeSpace: number }) => ({
        id: f.id,
        path: f.path,
        freeSpace: f.freeSpace,
    }));
}

export async function checkMovieExists(tmdbId: number): Promise<boolean> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/movie', {
            params: { tmdbId },
        });
        return Array.isArray(res.data) && res.data.length > 0;
    } catch {
        return false;
    }
}

export async function getAllRadarrMovies(): Promise<{ tmdbId?: number; title: string }[]> {
    const client = getClient();
    const res = await client.get('/api/v3/movie');
    return (res.data || []).map((m: { tmdbId?: number; title: string }) => ({
        tmdbId: m.tmdbId,
        title: m.title,
    }));
}

export async function lookupMovieByTmdb(tmdbId: number): Promise<Record<string, unknown> | null> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/movie/lookup/tmdb', {
            params: { tmdbId },
        });
        return res.data || null;
    } catch (err) {
        addLog({ level: 'ERROR', message: `Radarr lookup failed for tmdb:${tmdbId}: ${(err as Error).message}`, source: 'radarr' });
        return null;
    }
}

export async function lookupMovieByTerm(term: string): Promise<Record<string, unknown>[]> {
    try {
        const client = getClient();
        const res = await client.get('/api/v3/movie/lookup', {
            params: { term },
        });
        return res.data || [];
    } catch (err) {
        addLog({ level: 'ERROR', message: `Radarr search failed for "${term}": ${(err as Error).message}`, source: 'radarr' });
        return [];
    }
}

export async function addMovieToRadarr(
    tmdbId: number,
    qualityProfileId?: number,
    rootFolderPath?: string,
    searchForContent?: boolean
): Promise<{ success: boolean; message: string }> {
    try {
        // Check if already exists
        const exists = await checkMovieExists(tmdbId);
        if (exists) {
            addLog({ level: 'INFO', message: `Movie tmdb:${tmdbId} already exists in Radarr`, source: 'radarr' });
            return { success: false, message: 'Movie already exists in Radarr' };
        }

        // Lookup movie metadata
        const movieData = await lookupMovieByTmdb(tmdbId);
        if (!movieData) {
            return { success: false, message: `Could not find movie with tmdb:${tmdbId}` };
        }

        const client = getClient();
        const cfg = getConfig();
        const payload = {
            ...movieData,
            qualityProfileId: qualityProfileId || cfg.radarr.qualityProfileId,
            rootFolderPath: rootFolderPath || cfg.radarr.rootFolder,
            monitored: true,
            addOptions: {
                searchForMovie: searchForContent !== undefined ? searchForContent : true,
            },
        };

        await client.post('/api/v3/movie', payload);
        addLog({
            level: 'INFO',
            message: `Added movie "${movieData.title}" (tmdb:${tmdbId}) to Radarr`,
            source: 'radarr',
        });
        return { success: true, message: `Added "${movieData.title}" to Radarr` };
    } catch (err) {
        const msg = `Failed to add movie tmdb:${tmdbId}: ${(err as Error).message}`;
        addLog({ level: 'ERROR', message: msg, source: 'radarr' });
        return { success: false, message: msg };
    }
}
