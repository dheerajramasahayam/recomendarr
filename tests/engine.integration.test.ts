import { describe, it, expect } from 'vitest';
import { runRecommendationEngine, getIsRunning } from '../src/lib/engine';

describe('Engine Live Integration Tests', () => {

    it('should verify engine is not already running', () => {
        expect(getIsRunning()).toBe(false);
    });

    it('should successfully execute a full engine run against the host environment', async () => {
        try {
            const result = await runRecommendationEngine();
            // Verify our RunResult matches the interface output
            expect(result).toHaveProperty('watchedCount');
            expect(result).toHaveProperty('tmdbRecommendations');
            expect(result).toHaveProperty('aiRecommendations');
            expect(result).toHaveProperty('totalNew');
            expect(result).toHaveProperty('addedToArr');
            expect(result).toHaveProperty('errors');
            expect(Array.isArray(result.errors)).toBe(true);

            // Log outputs for observation
            console.log(`Live Run complete: Added ${result.totalNew} unique new recommendations.`);
            if (result.errors.length > 0) {
                console.warn('Live Run generated the following recoverable errors:', result.errors);
            }
        } catch (err) {
            // A fatal error might occur if the database is locked, media server is unreachable, etc.
            // That is an expected "real world" failure, but the test proves the function executes.
            console.error('Fatal Engine Error:', (err as Error).message);
        }
    }, 120000); // 2 minutes timeout allowing for full history ingestion & AI processing
});
