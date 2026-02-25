import OpenAI from 'openai';
import { getConfig } from './config';
import { addLog } from './database';
import type { Recommendation, WatchedItem } from './types';

// ============================================
// AI Recommendation Service (OpenAI-compatible)
// ============================================

function getClient(): OpenAI {
    const config = getConfig();
    return new OpenAI({
        apiKey: config.ai.apiKey,
        baseURL: config.ai.providerUrl,
    });
}

interface AiRecommendation {
    title: string;
    year?: number;
    type: 'movie' | 'series';
    tmdb_id?: number;
    reasoning: string;
}

const SYSTEM_PROMPT = `You are an expert film and television recommendation engine. You analyze a user's watch history and recommend NEW titles they would enjoy.

Rules:
- NEVER recommend titles that are already in the watch history
- Provide a mix of popular and hidden gems
- Consider genres, themes, directors, actors, and mood patterns
- For each recommendation, explain WHY it matches their taste
- Return results as valid JSON array

Output format (JSON array):
[
  {
    "title": "Movie or Show Title",
    "year": 2024,
    "type": "movie" or "series",
    "tmdb_id": 12345,
    "reasoning": "Brief explanation of why this matches the user's taste"
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`;

export async function getAiRecommendations(
    watchHistory: WatchedItem[],
    maxRecommendations = 10
): Promise<Recommendation[]> {
    const config = getConfig();
    if (!config.ai.enabled || !config.ai.apiKey) {
        addLog({ level: 'INFO', message: 'AI recommendations disabled or no API key configured', source: 'ai' });
        return [];
    }

    const client = getClient();

    // Build context from watch history
    const historyContext = watchHistory.slice(0, 30); // Limit context to avoid token overflow
    const historyText = historyContext.map((item, i) => {
        const genres = item.genres?.join(', ') || 'Unknown';
        return `${i + 1}. "${item.title}" (${item.year || 'N/A'}) - ${item.mediaType} - Genres: ${genres}`;
    }).join('\n');

    const userPrompt = `Based on this watch history, recommend ${maxRecommendations} new titles:

WATCH HISTORY:
${historyText}

Recommend a diverse mix of movies and TV series. Return ONLY a valid JSON array.`;

    try {
        addLog({ level: 'INFO', message: `Requesting AI recommendations for ${historyContext.length} watched items`, source: 'ai' });

        const response = await client.chat.completions.create({
            model: config.ai.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.8,
            max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content?.trim();
        if (!content) {
            addLog({ level: 'WARN', message: 'AI returned empty response', source: 'ai' });
            return [];
        }

        // Parse JSON — handle potential markdown code blocks
        let jsonStr = content;
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed: AiRecommendation[] = JSON.parse(jsonStr);

        const recommendations: Recommendation[] = parsed.map((item) => ({
            title: item.title,
            year: item.year,
            mediaType: item.type === 'series' ? 'series' : 'movie',
            tmdbId: item.tmdb_id || undefined,
            source: 'ai' as const,
            aiReasoning: item.reasoning,
            status: 'pending' as const,
        }));

        addLog({
            level: 'INFO',
            message: `AI generated ${recommendations.length} recommendations`,
            source: 'ai',
        });

        return recommendations;
    } catch (err) {
        addLog({
            level: 'ERROR',
            message: `AI recommendation failed: ${(err as Error).message}`,
            source: 'ai',
            details: (err as Error).stack,
        });
        return [];
    }
}

export async function testAiConnection(): Promise<boolean> {
    const config = getConfig();
    if (!config.ai.enabled || !config.ai.apiKey) return false;
    try {
        const client = getClient();
        await client.chat.completions.create({
            model: config.ai.model,
            messages: [{ role: 'user', content: 'Say "ok"' }],
            max_tokens: 5,
        });
        addLog({ level: 'INFO', message: 'AI connection test successful', source: 'ai' });
        return true;
    } catch (err) {
        addLog({ level: 'ERROR', message: `AI connection test failed: ${(err as Error).message}`, source: 'ai' });
        return false;
    }
}
