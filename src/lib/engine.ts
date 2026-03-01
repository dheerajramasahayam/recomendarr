import { createMediaServerConnector } from './media-server';
import { getRecommendationsForItem, getTmdbExternalIds, searchTmdb, discoverByFilters } from './tmdb';
import { getAiRecommendations } from './ai-recommender';
import { addMovieToRadarr, getAllRadarrMovies } from './radarr';
import { addSeriesToSonarr, getAllSonarrSeries } from './sonarr';
import { addRecommendation, addLog, getRecommendations, updateRecommendationStatus } from './database';
import { getConfig } from './config';
import type { Recommendation, WatchedItem } from './types';

export interface EngineFilters {
    genres?: string[];
    language?: string;
    yearMin?: number;
    yearMax?: number;
    mediaType?: 'movie' | 'series' | 'all';
}

interface LibraryItem {
    tmdbId?: number;
    tvdbId?: number;
    title: string;
}

interface LibrarySets {
    radarrTmdbIds: Set<number>;
    radarrTitles: Set<string>;
    sonarrTvdbIds: Set<number>;
    sonarrTitles: Set<string>;
    watchedTitles: Set<string>;
}

// ============================================
// Recommendation Engine — Orchestrator
// ============================================

export interface RunResult {
    watchedCount: number;
    tmdbRecommendations: number;
    aiRecommendations: number;
    totalNew: number;
    addedToArr: number;
    errors: string[];
}

let isRunning = false;

export function getIsRunning(): boolean {
    return isRunning;
}

export async function runRecommendationEngine(filters?: EngineFilters): Promise<RunResult> {
    if (isRunning) {
        throw new Error('Recommendation engine is already running');
    }

    isRunning = true;
    const result: RunResult = {
        watchedCount: 0,
        tmdbRecommendations: 0,
        aiRecommendations: 0,
        totalNew: 0,
        addedToArr: 0,
        errors: [],
    };

    try {
        addLog({ level: 'INFO', message: '🚀 Starting recommendation engine run', source: 'engine' });

        // Step 0: Pre-fetch full Sonarr & Radarr libraries for duplicate checking
        const library: LibrarySets = {
            radarrTmdbIds: new Set<number>(),
            radarrTitles: new Set<string>(),
            sonarrTvdbIds: new Set<number>(),
            sonarrTitles: new Set<string>(),
            watchedTitles: new Set<string>(),
        };

        try {
            const radarrMovies = await getAllRadarrMovies();
            for (const m of radarrMovies) {
                if (m.tmdbId) library.radarrTmdbIds.add(m.tmdbId);
                library.radarrTitles.add(m.title.toLowerCase());
            }
            addLog({ level: 'INFO', message: `📚 Loaded ${radarrMovies.length} movies from Radarr library`, source: 'engine' });
        } catch (err) {
            addLog({ level: 'WARN', message: `Could not load Radarr library: ${(err as Error).message}`, source: 'engine' });
        }

        try {
            const sonarrSeries = await getAllSonarrSeries();
            for (const s of sonarrSeries) {
                if (s.tvdbId) library.sonarrTvdbIds.add(s.tvdbId);
                library.sonarrTitles.add(s.title.toLowerCase());
            }
            addLog({ level: 'INFO', message: `📚 Loaded ${sonarrSeries.length} series from Sonarr library`, source: 'engine' });
        } catch (err) {
            addLog({ level: 'WARN', message: `Could not load Sonarr library: ${(err as Error).message}`, source: 'engine' });
        }

        // Step 1: Fetch watch history
        const connector = createMediaServerConnector();
        let watchHistory: WatchedItem[];

        try {
            const cfg = getConfig();
            watchHistory = await connector.getWatchHistory(cfg.app.watchHistoryLimit);
            result.watchedCount = watchHistory.length;
            // Add watched titles to the exclusion set
            for (const w of watchHistory) {
                library.watchedTitles.add(w.title.toLowerCase());
            }
            addLog({ level: 'INFO', message: `📺 Found ${watchHistory.length} watched items`, source: 'engine' });
        } catch (err) {
            const msg = `Failed to fetch watch history: ${(err as Error).message}`;
            result.errors.push(msg);
            addLog({ level: 'ERROR', message: msg, source: 'engine' });
            return result;
        }

        if (watchHistory.length === 0) {
            addLog({ level: 'WARN', message: 'No watch history found. Skipping.', source: 'engine' });
            return result;
        }

        // Step 2: Get TMDb recommendations
        const allTmdbRecs: Recommendation[] = [];
        const cfg = getConfig();
        const maxPerItem = Math.ceil(cfg.app.maxRecommendationsPerRun / Math.min(watchHistory.length, 10));

        // Filter watch history by media type if filter is set
        let filteredHistory = watchHistory;
        if (filters?.mediaType && filters.mediaType !== 'all') {
            filteredHistory = watchHistory.filter(item => item.mediaType === filters.mediaType);
            if (filteredHistory.length === 0) filteredHistory = watchHistory; // fallback
            addLog({ level: 'INFO', message: `🔍 Filtered watch history to ${filteredHistory.length} ${filters.mediaType} items`, source: 'engine' });
        }

        for (const item of filteredHistory.slice(0, 10)) {
            try {
                const recs = await getRecommendationsForItem(item, maxPerItem);
                allTmdbRecs.push(...recs);
            } catch (err) {
                result.errors.push(`TMDb error for "${item.title}": ${(err as Error).message}`);
            }
        }

        // Step 2b: Filter-driven discovery via TMDb /discover endpoint
        if (filters && (filters.genres?.length || filters.yearMin || filters.yearMax || (filters.mediaType && filters.mediaType !== 'all'))) {
            try {
                addLog({ level: 'INFO', message: `🔍 Running filter-driven TMDb discovery...`, source: 'engine' });
                const discoverRecs = await discoverByFilters({
                    genres: filters.genres,
                    yearMin: filters.yearMin,
                    yearMax: filters.yearMax,
                    mediaType: filters.mediaType,
                }, cfg.app.maxRecommendationsPerRun);
                allTmdbRecs.push(...discoverRecs);
                addLog({ level: 'INFO', message: `🔍 Filter discovery added ${discoverRecs.length} recommendations`, source: 'engine' });
            } catch (err) {
                result.errors.push(`TMDb discover error: ${(err as Error).message}`);
            }
        }

        result.tmdbRecommendations = allTmdbRecs.length;
        addLog({ level: 'INFO', message: `🎯 TMDb found ${allTmdbRecs.length} recommendations`, source: 'engine' });

        // Step 3: Get AI recommendations (with filter context)
        let aiRecs: Recommendation[] = [];
        const aiCfg = getConfig().ai;
        if (aiCfg.enabled) {
            try {
                aiRecs = await getAiRecommendations(watchHistory, 10, filters);
                result.aiRecommendations = aiRecs.length;
                addLog({ level: 'INFO', message: `🤖 AI generated ${aiRecs.length} recommendations`, source: 'engine' });
            } catch (err) {
                result.errors.push(`AI error: ${(err as Error).message}`);
            }
        }

        // Step 4: Merge, deduplicate, and save
        const allRecs = [...allTmdbRecs, ...aiRecs];
        const seen = new Set<string>();
        const uniqueRecs: Recommendation[] = [];

        for (const rec of allRecs) {
            const key = rec.tmdbId ? `tmdb:${rec.tmdbId}` : `title:${rec.title.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Resolve missing metadata (poster, overview, genres) via TMDb
            if (!rec.posterUrl || !rec.tmdbId) {
                const type = rec.mediaType === 'movie' ? 'movie' : 'tv';
                const tmdbResult = rec.tmdbId
                    ? null  // already have ID, try to get details directly
                    : await searchTmdb(rec.title, type);

                if (tmdbResult) {
                    rec.tmdbId = tmdbResult.id;
                    rec.overview = rec.overview || tmdbResult.overview;
                    rec.posterUrl = rec.posterUrl || (tmdbResult.poster_path
                        ? `https://image.tmdb.org/t/p/w500${tmdbResult.poster_path}`
                        : undefined);
                    rec.voteAverage = rec.voteAverage || tmdbResult.vote_average;
                    rec.genres = rec.genres?.length ? rec.genres : (
                        tmdbResult.genre_ids?.map((id: number) => {
                            const GENRE_MAP: Record<number, string> = {
                                28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
                                80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
                                14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
                                9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
                                10752: 'War', 37: 'Western', 10759: 'Action & Adventure',
                                10765: 'Sci-Fi & Fantasy',
                            };
                            return GENRE_MAP[id] || '';
                        }).filter(Boolean)
                    );
                    rec.year = rec.year || (tmdbResult.release_date
                        ? parseInt(tmdbResult.release_date.substring(0, 4))
                        : tmdbResult.first_air_date
                            ? parseInt(tmdbResult.first_air_date.substring(0, 4))
                            : undefined);
                }

                // If we still don't have a poster and have a tmdbId, try getting details directly
                if (!rec.posterUrl && rec.tmdbId) {
                    try {
                        const detailType = rec.mediaType === 'movie' ? 'movie' : 'tv';
                        const detailResult = await searchTmdb(rec.title, detailType);
                        if (detailResult?.poster_path) {
                            rec.posterUrl = `https://image.tmdb.org/t/p/w500${detailResult.poster_path}`;
                        }
                        if (detailResult && !rec.overview) rec.overview = detailResult.overview;
                        if (detailResult && !rec.voteAverage) rec.voteAverage = detailResult.vote_average;
                    } catch { /* ignore */ }
                }
            }

            // Check if already in Sonarr/Radarr library (using pre-fetched sets)
            let alreadyExists = false;
            const titleLower = rec.title.toLowerCase();

            if (rec.mediaType === 'movie') {
                // Check by TMDb ID first, then by title
                if (rec.tmdbId && library.radarrTmdbIds.has(rec.tmdbId)) {
                    alreadyExists = true;
                } else if (library.radarrTitles.has(titleLower)) {
                    alreadyExists = true;
                }
            } else if (rec.mediaType === 'series') {
                // Resolve TVDB ID if needed
                if (!rec.tvdbId && rec.tmdbId) {
                    try {
                        const ext = await getTmdbExternalIds(rec.tmdbId, 'tv');
                        rec.tvdbId = ext.tvdb_id;
                    } catch { /* ignore */ }
                }
                // Check by TVDB ID first, then by title
                if (rec.tvdbId && library.sonarrTvdbIds.has(rec.tvdbId)) {
                    alreadyExists = true;
                } else if (library.sonarrTitles.has(titleLower)) {
                    alreadyExists = true;
                }
            }

            // Also skip if title matches something already watched
            if (library.watchedTitles.has(titleLower)) {
                alreadyExists = true;
            }

            if (alreadyExists) {
                addLog({ level: 'DEBUG', message: `Skipping "${rec.title}" — already in library or watched`, source: 'engine' });
                continue;
            }

            // Apply user filters
            if (filters) {
                // Genre filter
                if (filters.genres && filters.genres.length > 0) {
                    const recGenres = (rec.genres || []).map(g => g.toLowerCase());
                    const matchesGenre = filters.genres.some((fg: string) => recGenres.includes(fg.toLowerCase()));
                    if (!matchesGenre) {
                        addLog({ level: 'DEBUG', message: `Filtered out "${rec.title}" — does not match genre filter`, source: 'engine' });
                        continue;
                    }
                }
                // Language filter
                if (filters.language && filters.language !== 'all') {
                    if (!rec.language || rec.language.toLowerCase() !== filters.language.toLowerCase()) {
                        addLog({ level: 'DEBUG', message: `Filtered out "${rec.title}" — language ${rec.language} doesn't match filter ${filters.language}`, source: 'engine' });
                        continue;
                    }
                }

                // Year range filter
                if (rec.year) {
                    if (filters.yearMin && rec.year < filters.yearMin) {
                        addLog({ level: 'DEBUG', message: `Filtered out "${rec.title}" (${rec.year}) — before year range`, source: 'engine' });
                        continue;
                    }
                    if (filters.yearMax && rec.year > filters.yearMax) {
                        addLog({ level: 'DEBUG', message: `Filtered out "${rec.title}" (${rec.year}) — after year range`, source: 'engine' });
                        continue;
                    }
                }
                // Media type filter
                if (filters.mediaType && filters.mediaType !== 'all' && rec.mediaType !== filters.mediaType) {
                    addLog({ level: 'DEBUG', message: `Filtered out "${rec.title}" — type ${rec.mediaType} doesn't match filter ${filters.mediaType}`, source: 'engine' });
                    continue;
                }
            }

            // Save to DB
            addRecommendation(rec);
            uniqueRecs.push(rec);
        }

        result.totalNew = uniqueRecs.length;
        addLog({ level: 'INFO', message: `💾 Saved ${uniqueRecs.length} new unique recommendations`, source: 'engine' });

        // Step 5: Auto-add if configured
        const schedulerCfg = getConfig().scheduler;
        if (schedulerCfg.autoAdd) {
            for (const rec of uniqueRecs) {
                try {
                    if (rec.mediaType === 'movie' && rec.tmdbId) {
                        const res = await addMovieToRadarr(rec.tmdbId);
                        if (res.success) {
                            updateRecommendationStatus(rec.id!, 'added');
                            result.addedToArr++;
                        }
                    } else if (rec.mediaType === 'series' && rec.tvdbId) {
                        const res = await addSeriesToSonarr(rec.tvdbId);
                        if (res.success) {
                            updateRecommendationStatus(rec.id!, 'added');
                            result.addedToArr++;
                        }
                    }
                } catch (err) {
                    result.errors.push(`Add error for "${rec.title}": ${(err as Error).message}`);
                }
            }
            addLog({ level: 'INFO', message: `📥 Auto-added ${result.addedToArr} items to Sonarr/Radarr`, source: 'engine' });
        }

        addLog({
            level: 'INFO',
            message: `✅ Run complete: ${result.totalNew} new recommendations, ${result.addedToArr} added`,
            source: 'engine',
        });

        return result;
    } finally {
        isRunning = false;
    }
}

// Approve and add a single recommendation
export interface AddOptions {
    qualityProfileId?: number;
    rootFolderPath?: string;
    searchForContent?: boolean;
}

export async function approveAndAdd(
    recommendationId: string,
    options: AddOptions = {}
): Promise<{ success: boolean; message: string }> {
    const recs = getRecommendations();
    const rec = recs.find((r) => r.id === recommendationId);
    if (!rec) return { success: false, message: 'Recommendation not found' };

    try {
        if (rec.mediaType === 'movie') {
            // Use title-based Radarr lookup to verify correct movie
            const { lookupMovieByTerm } = await import('./radarr');
            const searchResults = await lookupMovieByTerm(rec.title);

            // Find the best match by title
            let matchedMovie = searchResults.find(
                (m: Record<string, unknown>) =>
                    (m.title as string || '').toLowerCase() === rec.title.toLowerCase()
            );

            // If no exact match, try fuzzy on first result
            if (!matchedMovie && searchResults.length > 0) {
                const firstResult = searchResults[0] as Record<string, unknown>;
                const firstTitle = (firstResult.title as string || '').toLowerCase();
                const recTitle = rec.title.toLowerCase();
                if (firstTitle.includes(recTitle) || recTitle.includes(firstTitle)) {
                    matchedMovie = firstResult;
                }
            }

            if (matchedMovie) {
                const correctTmdbId = matchedMovie.tmdbId as number;
                if (correctTmdbId) {
                    addLog({
                        level: 'INFO',
                        message: `Radarr matched "${rec.title}" → "${matchedMovie.title}" (tmdb:${correctTmdbId})`,
                        source: 'engine'
                    });

                    const result = await addMovieToRadarr(
                        correctTmdbId,
                        options.qualityProfileId,
                        options.rootFolderPath,
                        options.searchForContent
                    );
                    if (result.success) {
                        updateRecommendationStatus(recommendationId, 'added');
                        return { success: true, message: result.message };
                    }
                    return result;
                }
            }

            // Fallback: use TMDb ID directly if title search didn't work
            if (rec.tmdbId) {
                addLog({
                    level: 'WARN',
                    message: `Title search didn't match for "${rec.title}", falling back to tmdb:${rec.tmdbId}`,
                    source: 'engine'
                });
                const result = await addMovieToRadarr(
                    rec.tmdbId,
                    options.qualityProfileId,
                    options.rootFolderPath,
                    options.searchForContent
                );
                if (result.success) {
                    updateRecommendationStatus(recommendationId, 'added');
                    return { success: true, message: result.message };
                }
                return result;
            }
            return { success: false, message: `Could not find "${rec.title}" in Radarr lookup` };
        } else if (rec.mediaType === 'series') {
            // Use title-based Sonarr lookup (more reliable than TMDb's TVDb IDs)
            const { lookupSeriesByTerm } = await import('./sonarr');
            const searchResults = await lookupSeriesByTerm(rec.title);

            // Find the best match by title
            let matchedSeries = searchResults.find(
                (s: Record<string, unknown>) =>
                    (s.title as string || '').toLowerCase() === rec.title.toLowerCase()
            );

            // If no exact match, try a fuzzy match on the first result
            if (!matchedSeries && searchResults.length > 0) {
                const firstResult = searchResults[0] as Record<string, unknown>;
                const firstTitle = (firstResult.title as string || '').toLowerCase();
                const recTitle = rec.title.toLowerCase();
                // Only accept if the title is reasonably similar
                if (firstTitle.includes(recTitle) || recTitle.includes(firstTitle)) {
                    matchedSeries = firstResult;
                }
            }

            if (!matchedSeries) {
                // Fallback: try TVDb lookup if available
                if (rec.tvdbId) {
                    const result = await addSeriesToSonarr(
                        rec.tvdbId,
                        options.qualityProfileId,
                        options.rootFolderPath,
                        options.searchForContent
                    );
                    if (result.success) {
                        updateRecommendationStatus(recommendationId, 'added');
                    }
                    return result;
                }
                return { success: false, message: `Could not find "${rec.title}" in Sonarr lookup` };
            }

            // Use the TVDb ID from Sonarr's own lookup (most reliable)
            const correctTvdbId = matchedSeries.tvdbId as number;
            if (!correctTvdbId) {
                return { success: false, message: `No TVDb ID found for "${rec.title}"` };
            }

            addLog({
                level: 'INFO',
                message: `Sonarr matched "${rec.title}" → "${matchedSeries.title}" (tvdb:${correctTvdbId})`,
                source: 'engine'
            });

            const result = await addSeriesToSonarr(
                correctTvdbId,
                options.qualityProfileId,
                options.rootFolderPath,
                options.searchForContent
            );
            if (result.success) {
                updateRecommendationStatus(recommendationId, 'added');
                return { success: true, message: result.message };
            }
            return result;
        }
        return { success: false, message: 'Unknown media type' };
    } catch (err) {
        return { success: false, message: (err as Error).message };
    }
}
