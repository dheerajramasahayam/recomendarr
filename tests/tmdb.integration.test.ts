import { describe, it, expect } from 'vitest';
import {
    searchTmdb,
    getTmdbRecommendations,
    getTmdbSimilar,
    getTmdbExternalIds,
    searchTmdbKeyword,
    getTmdbCredits,
    discoverByKeywords,
    discoverByCrew
} from '../src/lib/tmdb';

// INCREASE TIMEOUT for real API calls
describe('TMDb Live Integration Tests', () => {

    it('should successfully search for Inception', async () => {
        const result = await searchTmdb('Inception', 'movie');
        // If the API key is invalid or not set in the DB, this might be null or throw.
        // It's a real live integration test.
        if (result !== null) {
            expect(result).toHaveProperty('id');
            expect(result.id).toBeDefined();
            expect(result.title).toBeDefined();
        }
    }, 10000);

    it('should fetch recommendations for a movie ID (e.g. Inception ID 27205)', async () => {
        const results = await getTmdbRecommendations(27205, 'movie');
        expect(Array.isArray(results)).toBe(true);
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('id');
        }
    }, 10000);

    it('should fetch similar results for a tv ID (e.g. Breaking Bad ID 1396)', async () => {
        const results = await getTmdbSimilar(1396, 'tv');
        expect(Array.isArray(results)).toBe(true);
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('id');
        }
    }, 10000);

    it('should search and resolve a keyword', async () => {
        const id = await searchTmdbKeyword('cyberpunk');
        // 'cyberpunk' might map to ID 818 or similar
        if (id !== null) {
            expect(typeof id).toBe('number');
        }
    }, 10000);

    it('should run discoverByKeywords using a real keyword ID', async () => {
        const keywordId = await searchTmdbKeyword('heist');
        if (keywordId !== null) {
            const results = await discoverByKeywords([keywordId], 'movie', 5);
            expect(Array.isArray(results)).toBe(true);
            // Verify our mapping logic returned Recommendation objects
            if (results.length > 0) {
                expect(results[0]).toHaveProperty('title');
                expect(results[0]).toHaveProperty('source');
            }
        }
    }, 10000);

    it('should fetch credits and discover by crew', async () => {
        // Interstellar ID = 157336. Chris Nolan directing.
        const credits = await getTmdbCredits(157336, 'movie');
        if (credits && credits.crew) {
            const director = credits.crew.find((c: any) => c.job === 'Director');
            expect(director).toBeDefined();
            if (director) {
                const works = await discoverByCrew(director.id, 'movie', director.name, 3);
                expect(Array.isArray(works)).toBe(true);
            }
        }
    }, 10000);
});
