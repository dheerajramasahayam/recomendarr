import axios from 'axios';
import { getConfig } from './config';
import { addLog } from './database';
import type { Recommendation, WatchedItem } from './types';

// ============================================
// TMDb Service
// ============================================

function getTmdbClient() {
    const config = getConfig();
    return axios.create({
        baseURL: config.tmdb.baseUrl,
        params: { api_key: config.tmdb.apiKey },
    });
}

interface TmdbResult {
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    overview: string;
    poster_path?: string;
    genre_ids?: number[];
    vote_average: number;
}

// Genre ID map (TMDb standard)
const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
    10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
    10767: 'Talk', 10768: 'War & Politics',
};

export async function searchTmdb(title: string, type: 'movie' | 'tv'): Promise<TmdbResult | null> {
    try {
        const res = await getTmdbClient().get(`/search/${type}`, {
            params: { query: title },
        });
        return res.data.results?.[0] || null;
    } catch (err) {
        addLog({ level: 'ERROR', message: `TMDb search failed for "${title}": ${(err as Error).message}`, source: 'tmdb' });
        return null;
    }
}

export async function getTmdbRecommendations(
    tmdbId: number,
    type: 'movie' | 'tv'
): Promise<TmdbResult[]> {
    try {
        const res = await getTmdbClient().get(`/${type}/${tmdbId}/recommendations`);
        return res.data.results || [];
    } catch (err) {
        addLog({ level: 'ERROR', message: `TMDb recommendations failed for ${type}/${tmdbId}: ${(err as Error).message}`, source: 'tmdb' });
        return [];
    }
}

export async function getTmdbSimilar(
    tmdbId: number,
    type: 'movie' | 'tv'
): Promise<TmdbResult[]> {
    try {
        const res = await getTmdbClient().get(`/${type}/${tmdbId}/similar`);
        return res.data.results || [];
    } catch (err) {
        addLog({ level: 'ERROR', message: `TMDb similar failed for ${type}/${tmdbId}: ${(err as Error).message}`, source: 'tmdb' });
        return [];
    }
}

export async function getTmdbExternalIds(tmdbId: number, type: 'movie' | 'tv'): Promise<{ tvdb_id?: number; imdb_id?: string }> {
    try {
        const res = await getTmdbClient().get(`/${type}/${tmdbId}/external_ids`);
        return {
            tvdb_id: res.data.tvdb_id || undefined,
            imdb_id: res.data.imdb_id || undefined,
        };
    } catch {
        return {};
    }
}

export function tmdbResultToRecommendation(
    result: TmdbResult,
    type: 'movie' | 'series',
    source: 'tmdb' | 'ai',
    basedOn?: string
): Recommendation {
    const year = result.release_date
        ? parseInt(result.release_date.substring(0, 4))
        : result.first_air_date
            ? parseInt(result.first_air_date.substring(0, 4))
            : undefined;

    return {
        title: result.title || result.name || 'Unknown',
        year,
        mediaType: type,
        tmdbId: result.id,
        overview: result.overview,
        posterUrl: result.poster_path
            ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
            : undefined,
        genres: result.genre_ids?.map((id) => GENRE_MAP[id] || 'Unknown').filter(Boolean),
        voteAverage: result.vote_average,
        source,
        basedOn,
        status: 'pending',
    };
}

export async function getRecommendationsForItem(
    item: WatchedItem,
    maxPerItem = 5
): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const type = item.mediaType === 'movie' ? 'movie' : 'tv';

    let tmdbId = item.tmdbId;

    // If we don't have a TMDb ID, search for it
    if (!tmdbId) {
        const result = await searchTmdb(item.title, type);
        if (result) {
            tmdbId = result.id;
        } else {
            addLog({ level: 'WARN', message: `Could not find TMDb ID for "${item.title}"`, source: 'tmdb' });
            return [];
        }
    }

    // Get both recommendations and similar
    const [recs, similar] = await Promise.all([
        getTmdbRecommendations(tmdbId, type),
        getTmdbSimilar(tmdbId, type),
    ]);

    // Merge and deduplicate
    const seen = new Set<number>();
    const all = [...recs, ...similar];

    for (const result of all) {
        if (seen.has(result.id) || recommendations.length >= maxPerItem) break;
        seen.add(result.id);
        recommendations.push(
            tmdbResultToRecommendation(result, item.mediaType, 'tmdb', item.title)
        );
    }

    addLog({
        level: 'INFO',
        message: `Found ${recommendations.length} TMDb recommendations for "${item.title}"`,
        source: 'tmdb',
    });

    return recommendations;
}
