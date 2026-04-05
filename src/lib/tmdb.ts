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
    original_language?: string;
    vote_average: number;
}

interface TmdbCredits {
    crew?: Array<{
        id: number;
        job?: string;
        name: string;
    }>;
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

export async function getMediaTrailer(tmdbId: number, type: 'movie' | 'tv' | 'series'): Promise<string | null> {
    try {
        const tmdbType = type === 'series' ? 'tv' : type;
        const res = await getTmdbClient().get(`/${tmdbType}/${tmdbId}/videos`);
        const videos: { key: string; site: string; type: string }[] = res.data.results || [];
        const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');
        return trailer ? trailer.key : null;
    } catch {
        addLog({ level: 'DEBUG', message: `No trailer found for ${type} ${tmdbId}`, source: 'tmdb' });
        return null;
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
        language: result.original_language,
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

// Reverse map: genre name → TMDb genre ID
const GENRE_NAME_TO_ID: Record<string, number> = {};
for (const [id, name] of Object.entries(GENRE_MAP)) {
    GENRE_NAME_TO_ID[name.toLowerCase()] = parseInt(id);
}

export interface DiscoverFilters {
    genres?: string[];
    language?: string;
    preferredLanguages?: string[];
    yearMin?: number;
    yearMax?: number;
    mediaType?: 'movie' | 'series' | 'all';
    minRating?: number;
    providers?: number[];
}

export async function discoverByFilters(
    filters: DiscoverFilters,
    maxResults = 20
): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const seen = new Set<string>();
    const types: Array<'movie' | 'tv'> = [];

    if (!filters.mediaType || filters.mediaType === 'all') {
        types.push('movie', 'tv');
    } else if (filters.mediaType === 'movie') {
        types.push('movie');
    } else {
        types.push('tv');
    }

    // Convert genre names to TMDb genre IDs
    const genreIds = (filters.genres || [])
        .map(name => GENRE_NAME_TO_ID[name.toLowerCase()])
        .filter(Boolean);

    const languageTargets = filters.language && filters.language !== 'all'
        ? [filters.language.toLowerCase()]
        : (filters.preferredLanguages || [])
            .map((language) => language.toLowerCase())
            .filter(Boolean)
            .slice(0, 3);
    const requestLanguages = languageTargets.length > 0 ? languageTargets : [null];
    const resultsPerRequest = Math.max(1, Math.ceil(maxResults / (types.length * requestLanguages.length)));

    for (const type of types) {
        for (const languageTarget of requestLanguages) {
        try {
            // Use a random page 1-3 to get some variety across different engine runs
            const randomPage = Math.floor(Math.random() * 3) + 1;
            const params: Record<string, string | number> = {
                sort_by: 'popularity.desc',
                'vote_average.gte': filters.minRating || 7.0,
                'vote_count.gte': 300,
                page: randomPage,
            };

            if (filters.providers && filters.providers.length > 0) {
                params.with_watch_providers = filters.providers.join('|');
                params.watch_region = 'US'; // TMDb requires region when filtering by providers
            }

            if (genreIds.length > 0) {
                params.with_genres = genreIds.join(',');
            }

            if (languageTarget) {
                params.with_original_language = languageTarget;
            }

            if (type === 'movie') {
                if (filters.yearMin) params['primary_release_date.gte'] = `${filters.yearMin}-01-01`;
                if (filters.yearMax) params['primary_release_date.lte'] = `${filters.yearMax}-12-31`;
            } else {
                if (filters.yearMin) params['first_air_date.gte'] = `${filters.yearMin}-01-01`;
                if (filters.yearMax) params['first_air_date.lte'] = `${filters.yearMax}-12-31`;
            }

            const res = await getTmdbClient().get(`/discover/${type}`, { params });
            const results: TmdbResult[] = res.data.results || [];
            const mediaType = type === 'movie' ? 'movie' : 'series';

            for (const result of results.slice(0, resultsPerRequest)) {
                const key = `${mediaType}:${result.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                recommendations.push(
                    tmdbResultToRecommendation(result, mediaType as 'movie' | 'series', 'tmdb', 'filter-discovery')
                );
            }

            addLog({
                level: 'INFO',
                message: `🔍 TMDb discover (${type}) found ${results.length} results with filters: genres=[${filters.genres?.join(', ') || 'any'}], years=${filters.yearMin || 'any'}-${filters.yearMax || 'any'}, language=${languageTarget || 'any'}`,
                source: 'tmdb',
            });
        } catch (err) {
            addLog({ level: 'ERROR', message: `TMDb discover (${type}) failed: ${(err as Error).message}`, source: 'tmdb' });
        }
        }
    }

    return recommendations;
}

// ============================================
// Advanced Discovery: Credits & Keywords
// ============================================

export async function getTmdbCredits(tmdbId: number, type: 'movie' | 'tv'): Promise<TmdbCredits | null> {
    try {
        const res = await getTmdbClient().get(`/${type}/${tmdbId}/credits`);
        return res.data;
    } catch {
        return null;
    }
}

export async function searchTmdbKeyword(query: string): Promise<number | null> {
    try {
        const res = await getTmdbClient().get('/search/keyword', { params: { query, page: 1 } });
        if (res.data.results && res.data.results.length > 0) {
            return res.data.results[0].id;
        }
        return null;
    } catch {
        return null;
    }
}

export async function discoverByKeywords(
    keywordIds: number[],
    type: 'movie' | 'series',
    maxResults = 5,
    languages: string[] = []
): Promise<Recommendation[]> {
    if (keywordIds.length === 0) return [];
    const t = type === 'movie' ? 'movie' : 'tv';
    const recommendations: Recommendation[] = [];
    const seen = new Set<number>();
    const languageTargets = languages.length > 0 ? languages.slice(0, 3) : [null];
    const resultsPerRequest = Math.max(1, Math.ceil(maxResults / languageTargets.length));

    for (const language of languageTargets) {
        try {
            const params: Record<string, string | number> = {
                sort_by: 'popularity.desc',
                'vote_average.gte': 6.0, // lower threshold since keywords are very specific
                'vote_count.gte': 50,
                with_keywords: keywordIds.join('|'), // OR logic
                page: 1,
            };
            if (language) {
                params.with_original_language = language;
            }

            const res = await getTmdbClient().get(`/discover/${t}`, { params });
            for (const result of (res.data.results || []).slice(0, resultsPerRequest) as TmdbResult[]) {
                if (seen.has(result.id)) continue;
                seen.add(result.id);
                recommendations.push(tmdbResultToRecommendation(result, type, 'tmdb', 'Dynamic Keyword Search'));
            }
        } catch (err) {
            addLog({ level: 'ERROR', message: `TMDb keyword discover failed: ${(err as Error).message}`, source: 'tmdb' });
        }
    }

    return recommendations;
}

export async function discoverByCrew(
    crewId: number,
    type: 'movie' | 'series',
    crewName: string,
    maxResults = 5,
    languages: string[] = []
): Promise<Recommendation[]> {
    const t = type === 'movie' ? 'movie' : 'tv';
    const recommendations: Recommendation[] = [];
    const seen = new Set<number>();
    const languageTargets = languages.length > 0 ? languages.slice(0, 3) : [null];
    const resultsPerRequest = Math.max(1, Math.ceil(maxResults / languageTargets.length));

    for (const language of languageTargets) {
        try {
            const params: Record<string, string | number> = {
                sort_by: 'vote_average.desc',
                'vote_count.gte': 50,
                with_crew: crewId,
                page: 1,
            };
            if (language) {
                params.with_original_language = language;
            }

            const res = await getTmdbClient().get(`/discover/${t}`, { params });
            for (const result of (res.data.results || []).slice(0, resultsPerRequest) as TmdbResult[]) {
                if (seen.has(result.id)) continue;
                seen.add(result.id);
                recommendations.push(tmdbResultToRecommendation(result, type, 'tmdb', `Creator: ${crewName}`));
            }
        } catch (err) {
            addLog({ level: 'ERROR', message: `TMDb crew discover failed: ${(err as Error).message}`, source: 'tmdb' });
        }
    }

    return recommendations;
}
