import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    searchTmdb,
    getTmdbRecommendations,
    getTmdbSimilar,
    getTmdbExternalIds,
    searchTmdbKeyword,
    getTmdbCredits,
    discoverByKeywords,
    discoverByCrew,
    discoverByFilters,
    getRecommendationsForItem
} from '../src/lib/tmdb';
import * as config from '../src/lib/config';

// INCREASE TIMEOUT for real API calls
describe('TMDb Live Integration Tests', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Live Happy Paths', () => {
        it('should successfully search for Inception', async () => {
            const result = await searchTmdb('Inception', 'movie');
            expect(result).toBeDefined();
            if (result !== null) {
                expect(result.id).toBeDefined();
            }
        }, 10000);

        it('should fetch recommendations for a movie ID', async () => {
             const results = await getTmdbRecommendations(27205, 'movie');
             expect(Array.isArray(results)).toBe(true);
        }, 10000);

        it('should fetch similar results for a tv ID', async () => {
             const results = await getTmdbSimilar(1396, 'tv');
             expect(Array.isArray(results)).toBe(true);
        }, 10000);

        it('should search and resolve a keyword', async () => {
            const id = await searchTmdbKeyword('cyberpunk');
            expect(typeof id).toBe('number');
        }, 10000);

        it('should run discoverByKeywords using a real keyword ID', async () => {
            // Using ID for "cyberpunk"
            const results = await discoverByKeywords([818], 'movie', 5);
            expect(Array.isArray(results)).toBe(true);
        }, 10000);

        it('should fetch credits and discover by crew', async () => {
            // Interstellar ID = 157336. Chris Nolan directing.
            const credits = await getTmdbCredits(157336, 'movie');
            expect(credits).toBeDefined();
            const director = credits?.crew.find((c: any) => c.job === 'Director');
            if (director) {
                const works = await discoverByCrew(director.id, 'movie', director.name, 3);
                expect(Array.isArray(works)).toBe(true);
            }
        }, 10000);

        it('should fetch external ids', async () => {
            const ids = await getTmdbExternalIds(1396, 'tv');
            expect(ids).toBeDefined();
        }, 10000);
        
        it('should run getRecommendationsForItem cleanly over network', async () => {
             const recs = await getRecommendationsForItem({ title: 'Interstellar', mediaType: 'movie' }, 2);
             expect(recs.length).toBeGreaterThan(0);
        }, 10000);

        it('should run discoverByFilters cleanly over network', async () => {
             const recs = await discoverByFilters({
                 genres: ['Action'],
                 yearMin: 2010,
                 yearMax: 2020,
                 language: 'en',
                 mediaType: 'movie'
             }, 5);
             expect(recs.length).toBeGreaterThan(0);
             
             const recsAll = await discoverByFilters({ genres: ['Mystery'], mediaType: 'all' }, 2);
             expect(recsAll.length).toBeGreaterThanOrEqual(0);
             
             const recsTv = await discoverByFilters({ mediaType: 'series' }, 2);
             expect(recsTv.length).toBeGreaterThanOrEqual(0);
        }, 30000);
    });

    describe('Dynamically Spied Error Paths', () => {
        beforeEach(() => {
             const realConfig = config.getConfig();
             vi.spyOn(config, 'getConfig').mockReturnValue({
                 ...realConfig,
                 tmdb: { ...realConfig.tmdb, baseUrl: 'http://localhost:59999/invalid' }
             } as any);
        });

        it('should trigger catch block in searchTmdb', async () => {
            const result = await searchTmdb('Inception', 'movie');
            expect(result).toBeNull();
        });

        it('should trigger catch block in getTmdbRecommendations', async () => {
             const result = await getTmdbRecommendations(1, 'movie');
             expect(result).toEqual([]);
        });

        it('should trigger catch block in getTmdbSimilar', async () => {
             const result = await getTmdbSimilar(1, 'tv');
             expect(result).toEqual([]);
        });

        it('should trigger catch block in searchTmdbKeyword', async () => {
             const result = await searchTmdbKeyword('err');
             expect(result).toBeNull();
        });

        it('should trigger catch block in getTmdbCredits', async () => {
             const result = await getTmdbCredits(1, 'movie');
             expect(result).toBeNull();
        });

        it('should trigger catch block in getTmdbExternalIds', async () => {
             const result = await getTmdbExternalIds(1, 'movie');
             expect(result).toEqual({});
        });

        it('should trigger catch block in discoverByKeywords', async () => {
             const result = await discoverByKeywords([1], 'movie');
             expect(result).toEqual([]);
        });

        it('should empty array when given empty keywords in discoverByKeywords', async () => {
             const result = await discoverByKeywords([], 'movie');
             expect(result).toEqual([]);
        });

        it('should trigger catch block in discoverByCrew', async () => {
             const result = await discoverByCrew(1, 'movie', 'dir');
             expect(result).toEqual([]);
        });

        it('should trigger catch block in discoverByFilters', async () => {
             const result = await discoverByFilters({ mediaType: 'all' });
             expect(result).toEqual([]);
        });

        it('should fallback gracefully in getRecommendationsForItem if ID search fails', async () => {
             const result = await getRecommendationsForItem({ title: 'Unknown', mediaType: 'movie' });
             expect(result).toEqual([]);
        });
    });
    
    describe('Edge Cases (No Network Mocks)', () => {
         it('should return null searching for empty/unfindable item', async () => {
             const result = await searchTmdb('ZZZZZ123498xxx', 'movie');
             expect(result).toBeNull();
         }, 10000);
         
         it('should return empty search array for keyword that is completely obscure', async () => {
              const id = await searchTmdbKeyword('aassddffgghhjjj2233');
              expect(id).toBeNull();
         }, 10000);
    });
});
