import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { runRecommendationEngine, getIsRunning, approveAndAdd } from '../src/lib/engine';
import * as mediaServer from '../src/lib/media-server';
import * as radarr from '../src/lib/radarr';
import * as sonarr from '../src/lib/sonarr';
import * as tmdb from '../src/lib/tmdb';
import * as config from '../src/lib/config';
import * as database from '../src/lib/database';

describe('Engine Integration Tests (Hybrid Mocking)', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockHistory = [
        { title: 'The Matrix', year: 1999, mediaType: 'movie', genres: ['Action'], playCount: 5, rating: 10, tmdbId: 603, lastPlayedDate: new Date().toISOString() },
        { title: 'Breaking Bad', year: 2008, mediaType: 'series', genres: ['Drama'], playCount: 1, rating: 9, tmdbId: 1396 }
    ];

    describe('Happy Path Engine Run', () => {
        beforeEach(() => {
            // Mock out the config autoAdd to true to test the add loop
            const realCfg = config.getConfig();
            vi.spyOn(config, 'getConfig').mockReturnValue({
                ...realCfg,
                scheduler: { ...realCfg.scheduler, autoAdd: true },
                ai: { ...realCfg.ai, enabled: false } // disable AI to save tokens in engine run, already tested above
            } as any);

            // Give it fake radarr/sonarr libraries
            vi.spyOn(radarr, 'getAllRadarrMovies').mockResolvedValue([ { title: 'Existing Movie', tmdbId: 123 } as any ]);
            vi.spyOn(sonarr, 'getAllSonarrSeries').mockResolvedValue([ { title: 'Existing Series', tvdbId: 456 } as any ]);
            
            // Give it fake watch history
            vi.spyOn(mediaServer, 'createMediaServerConnector').mockReturnValue({
                getWatchHistory: vi.fn().mockResolvedValue(mockHistory) as any,
                testConnection: vi.fn() as any,
                getUsers: vi.fn() as any
            });

            // Mock database deduplication layers
            vi.spyOn(database, 'addRecommendation').mockImplementation((r) => r);
            vi.spyOn(database, 'updateRecommendationStatus').mockImplementation(() => true);

            // Mock arr additions
            vi.spyOn(radarr, 'addMovieToRadarr').mockResolvedValue({ success: true, message: 'OK' });
            vi.spyOn(sonarr, 'addSeriesToSonarr').mockResolvedValue({ success: true, message: 'OK' });
            
            // Mock TMDb search returning a movie and missing id resolution
            vi.spyOn(tmdb, 'searchTmdb').mockResolvedValue({ id: 999, overview: 'Yes', release_date: '2023-01-01', poster_path: '/poster.jpg', vote_average: 7, genre_ids: [28] } as any);
            vi.spyOn(tmdb, 'getTmdbExternalIds').mockResolvedValue({ tvdb_id: 1234 } as any);
        });

        it('should successfully execute a full engine run', async () => {
            expect(getIsRunning()).toBe(false);
            
            // Trigger test run with filters to hit the filter branches
            const result = await runRecommendationEngine({ genres: ['Action'], yearMin: 2000, yearMax: 2025, mediaType: 'movie', language: 'en' });
            
            expect(result).toHaveProperty('watchedCount');
            expect(result.watchedCount).toBe(2);
            expect(result.errors).toEqual([]);
        }, 15000);
        
        it('should execute engine run with different filters', async () => {
             const result = await runRecommendationEngine({ mediaType: 'series' });
             expect(result.watchedCount).toBe(2);
             expect(result).toBeDefined();
        }, 15000);

        it('should prevent concurrent runs', async () => {
            const run1 = runRecommendationEngine().catch(() => {});
            await expect(runRecommendationEngine()).rejects.toThrow('Recommendation engine is already running');
            await run1;
        });

        it('should skip if watch history is empty', async () => {
             vi.spyOn(mediaServer, 'createMediaServerConnector').mockReturnValue({
                getWatchHistory: vi.fn().mockResolvedValue([]) as any,
                testConnection: vi.fn() as any,
                getUsers: vi.fn() as any
            });
            const result = await runRecommendationEngine();
            expect(result.watchedCount).toBe(0);
            expect(result.totalNew).toBe(0);
        });
    });

    describe('Error and Deduplication Paths', () => {
        beforeEach(() => {
            vi.spyOn(radarr, 'getAllRadarrMovies').mockRejectedValue(new Error('Radarr Down'));
            vi.spyOn(sonarr, 'getAllSonarrSeries').mockRejectedValue(new Error('Sonarr Down'));
             vi.spyOn(mediaServer, 'createMediaServerConnector').mockReturnValue({
                getWatchHistory: vi.fn().mockRejectedValue(new Error('Plex Down')) as any,
                testConnection: vi.fn() as any,
                getUsers: vi.fn() as any
            });
        });

        it('should safely catch library and history fetch errors', async () => {
            const result = await runRecommendationEngine();
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Failed to fetch watch history');
        });
    });

    describe('approveAndAdd', () => {
        beforeEach(() => {
            vi.spyOn(database, 'getRecommendations').mockReturnValue([
                { id: '1', title: 'Test Movie', mediaType: 'movie', tmdbId: 100 },
                { id: '2', title: 'Test Series', mediaType: 'series', tvdbId: 200 },
                { id: '3', title: 'Missing Series', mediaType: 'series', tmdbId: 300 }, // No tvdb
                { id: '4', title: 'Bad Type', mediaType: 'unknown' as any }
            ] as any[]);
        });

        it('should return error if recommendation not found', async () => {
            const res = await approveAndAdd('999');
            expect(res.success).toBe(false);
            expect(res.message).toBe('Recommendation not found');
        });

        it('should add movie by title via Radarr lookup', async () => {
            vi.spyOn(radarr, 'lookupMovieByTerm').mockResolvedValue([{ title: 'Test Movie', tmdbId: 100 }] as any);
            vi.spyOn(radarr, 'addMovieToRadarr').mockResolvedValue({ success: true, message: 'Added Movie!' });
            vi.spyOn(database, 'updateRecommendationStatus').mockImplementation(() => true);

            const res = await approveAndAdd('1');
            expect(res.success).toBe(true);
            expect(res.message).toBe('Added Movie!');
        });
        
        it('should fallback to direct tmdbId if movie title lookup fails', async () => {
            vi.spyOn(radarr, 'lookupMovieByTerm').mockResolvedValue([]);
            vi.spyOn(radarr, 'addMovieToRadarr').mockResolvedValue({ success: true, message: 'Fallback Added' });
            
            const res = await approveAndAdd('1');
            expect(res.success).toBe(true);
        });
        
        it('should add series by title via Sonarr lookup', async () => {
            vi.spyOn(sonarr, 'lookupSeriesByTerm').mockResolvedValue([{ title: 'Test Series', tvdbId: 200 }] as any);
            vi.spyOn(sonarr, 'addSeriesToSonarr').mockResolvedValue({ success: true, message: 'Added Series!' });

            const res = await approveAndAdd('2');
            expect(res.success).toBe(true);
            expect(res.message).toBe('Added Series!');
        });
        
        it('should fallback to direct tvdbId if series title lookup fails', async () => {
            vi.spyOn(sonarr, 'lookupSeriesByTerm').mockResolvedValue([]);
            vi.spyOn(sonarr, 'addSeriesToSonarr').mockResolvedValue({ success: true, message: 'Fallback Added TV' });
            
            const res = await approveAndAdd('2');
            expect(res.success).toBe(true);
        });

        it('should return error for unknown media type', async () => {
             const res = await approveAndAdd('4');
             expect(res.success).toBe(false);
        });
        
        it('should catch generic errors during add', async () => {
             vi.spyOn(radarr, 'lookupMovieByTerm').mockRejectedValue(new Error('Fatal API crash'));
             const res = await approveAndAdd('1');
             expect(res.success).toBe(false);
             expect(res.message).toBe('Fatal API crash');
        });
    });
});
