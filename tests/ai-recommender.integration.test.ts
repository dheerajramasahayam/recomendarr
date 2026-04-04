import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { generateTasteProfile, getAiRecommendations, testAiConnection } from '../src/lib/ai-recommender';
import * as config from '../src/lib/config';
import type { AppConfig } from '../src/lib/config';
import type { WatchedItem } from '../src/lib/types';

describe('AI Recommender Live Integration Tests', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const history: WatchedItem[] = [
        { title: 'The Matrix', year: 1999, mediaType: 'movie', genres: ['Action', 'Sci-Fi'], playCount: 5, rating: 10 },
        { title: 'Blade Runner 2049', year: 2017, mediaType: 'movie', genres: ['Sci-Fi', 'Thriller'], playCount: 2, rating: 9 }
    ];

    describe('Live Happy Paths', () => {
        it('should successfully test the connection if AI is enabled', async () => {
            const cfg = config.getConfig();
            if (cfg.ai.enabled && cfg.ai.apiKey) {
                const isOk = await testAiConnection();
                expect(typeof isOk).toBe('boolean');
            } else {
                console.warn('AI is disabled or no API key, skipping real connection test.');
            }
        }, 15000);

        it('should generate a live taste profile', async () => {
            const cfg = config.getConfig();
            if (cfg.ai.enabled && cfg.ai.apiKey) {
                const profile = await generateTasteProfile(history);
                expect(profile).not.toBeNull();
                if (profile) {
                    expect(profile).toHaveProperty('profile');
                    expect(profile).toHaveProperty('keywords');
                    expect(Array.isArray(profile.keywords)).toBe(true);
                }
            }
        }, 30000);

        it('should get live recommendations using a mock profile', async () => {
             const cfg = config.getConfig();
             if (cfg.ai.enabled && cfg.ai.apiKey) {
                 const profile = { profile: 'Loves slow sci-fi.', keywords: ['cyberpunk'] };
                 const recs = await getAiRecommendations(history, profile, 2);
                 expect(Array.isArray(recs)).toBe(true);
             }
        }, 30000);
        
        it('should get live recommendations with filters', async () => {
             const cfg = config.getConfig();
             if (cfg.ai.enabled && cfg.ai.apiKey) {
                 const recs = await getAiRecommendations(history, null, 1, {
                     genres: ['Action'], yearMin: 2000, yearMax: 2020, language: 'en', mediaType: 'movie'
                 });
                 expect(Array.isArray(recs)).toBe(true);
                 
                 const recs2 = await getAiRecommendations(history, null, 1, {
                     yearMin: 2000, mediaType: 'series'
                 });
                 expect(Array.isArray(recs2)).toBe(true);
                 
                 const recs3 = await getAiRecommendations(history, null, 1, {
                     yearMax: 2020, language: 'es'
                 });
                 expect(Array.isArray(recs3)).toBe(true);
             }
        }, 60000); // Allow lots of time due to multiple AI network hits
    });

    describe('Dynamically Spied Error Paths', () => {
         beforeEach(() => {
             const realConfig = config.getConfig();
             vi.spyOn(config, 'getConfig').mockReturnValue({
                 ...realConfig,
                 ai: { ...realConfig.ai, providerUrl: 'http://localhost:59999/invalid', enabled: true }
             } as AppConfig);
         });

         it('should fail gracefully in testAiConnection on 401', async () => {
             const result = await testAiConnection();
             expect(result).toBe(false);
         }, 15000);

         it('should return null in generateTasteProfile on 401', async () => {
             const result = await generateTasteProfile(history);
             expect(result).toBeNull();
         }, 30000);

         it('should return empty array in getAiRecommendations on 401', async () => {
             const result = await getAiRecommendations(history, null, 2);
             expect(result).toEqual([]);
         }, 30000);
    });

    describe('Dynamically Disabled Paths', () => {
         beforeEach(() => {
             const realConfig = config.getConfig();
             vi.spyOn(config, 'getConfig').mockReturnValue({
                 ...realConfig,
                 ai: { ...realConfig.ai, enabled: false }
             } as AppConfig);
         });

         it('should return false in testAiConnection if disabled', async () => {
             const result = await testAiConnection();
             expect(result).toBe(false);
         });

         it('should return null in generateTasteProfile if disabled', async () => {
             const result = await generateTasteProfile(history);
             expect(result).toBeNull();
         });

         it('should return empty array in getAiRecommendations if disabled', async () => {
             const result = await getAiRecommendations(history, null, 2);
             expect(result).toEqual([]);
         });
    });
});
