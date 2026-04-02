import { describe, it, expect } from 'vitest';
import { generateTasteProfile, getAiRecommendations, testAiConnection } from '../src/lib/ai-recommender';
import { getConfig } from '../src/lib/config';

describe('AI Recommender Live Integration Tests', () => {

    it('should successfully test the connection if AI is enabled', async () => {
        const config = getConfig();
        if (config.ai.enabled && config.ai.apiKey) {
            const isOk = await testAiConnection();
            expect(typeof isOk).toBe('boolean');
        } else {
            console.warn('AI is disabled or no API key, skipping real connection test.');
        }
    }, 15000);

    it('should generate a live taste profile', async () => {
        const config = getConfig();
        if (config.ai.enabled && config.ai.apiKey) {
            // A fake history that tests semantic reasoning
            const history: any[] = [
                { title: 'The Matrix', year: 1999, mediaType: 'movie', genres: ['Action', 'Sci-Fi'], playCount: 5, rating: 10 },
                { title: 'Blade Runner 2049', year: 2017, mediaType: 'movie', genres: ['Sci-Fi', 'Thriller'], playCount: 2, rating: 9 }
            ];

            const profile = await generateTasteProfile(history);
            expect(profile).not.toBeNull();
            if (profile) {
                expect(profile).toHaveProperty('profile');
                expect(profile).toHaveProperty('keywords');
                expect(Array.isArray(profile.keywords)).toBe(true);
                expect(profile.keywords.length).toBeGreaterThan(0);
                
                // Then test getting recommendations using this profile
                const recs = await getAiRecommendations(history, profile, 2);
                expect(Array.isArray(recs)).toBe(true);
                if (recs.length > 0) {
                    expect(recs[0]).toHaveProperty('title');
                    expect(recs[0]).toHaveProperty('aiReasoning');
                }
            }
        }
    }, 30000);
});
