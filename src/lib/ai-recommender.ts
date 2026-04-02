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

export interface TasteProfile {
    profile: string;
    keywords: string[];
}

const TASTE_PROFILE_PROMPT = `You are a psychological film and television analyst. Analyze the provided watch history (with ratings and play counts) and output a Taste Profile.
Understand their pacing preferences, thematic interests, preferred genres, and common tropes they enjoy.
Also, provide 3 highly specific niche keywords (e.g., "cyberpunk", "time loop", "heist") that define their current taste.

Output MUST be a valid JSON object:
{
  "profile": "Detailed paragraph explaining the user's taste.",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}
IMPORTANT: Return ONLY the JSON object, no other text or markdown formatting.`;

const SYSTEM_PROMPT = `You are an expert film and television recommendation engine. You receive a user's psychological Taste Profile and their watch history, and recommend NEW titles they would deeply enjoy.

Rules:
- NEVER recommend titles that are already in the watch history
- Provide a mix of critically acclaimed blockbusters and high-quality hidden gems
- Strongly ground your recommendations in the insights from the provided Taste Profile
- Return results as valid JSON array

Output format (JSON array):
[
  {
    "title": "Movie or Show Title",
    "year": 2024,
    "type": "movie" or "series",
    "tmdb_id": 12345,
    "reasoning": "Brief explanation connecting the recommendation directly back to elements in their Taste Profile"
  }
]

IMPORTANT: Return ONLY the JSON array, no other text or explanation.`;

export async function generateTasteProfile(watchHistory: WatchedItem[]): Promise<TasteProfile | null> {
    const config = getConfig();
    if (!config.ai.enabled || !config.ai.apiKey) return null;
    const client = getClient();
    
    // Pass top 40 for more robust psychological analysis
    const historyContext = watchHistory.slice(0, 40); 
    const historyText = historyContext.map((item, i) => {
        const ratingStr = item.rating ? `, Rating: ${item.rating}/10` : '';
        const playStr = (item.playCount && item.playCount > 1) ? `, Play Count: ${item.playCount}` : '';
        return `${i + 1}. "${item.title}" (${item.year || 'N/A'}) - ${item.mediaType} - Genres: ${item.genres?.join(', ') || 'Unknown'}${ratingStr}${playStr}`;
    }).join('\n');

    const userPrompt = `WATCH HISTORY:\n${historyText}\n\nGenerate the Taste Profile JSON.`;
    
    try {
        const response = await client.chat.completions.create({
            model: config.ai.model,
            messages: [
                { role: 'system', content: TASTE_PROFILE_PROMPT },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 500,
        });
        
        let content = response.choices[0]?.message?.content?.trim();
        if (!content) return null;
        if (content.startsWith('\`\`\`')) { // handle markdown
            content = content.replace(/^\`\`\`(?:json)?\n?/, '').replace(/\n?\`\`\`$/, '');
        }
        
        const parsed = JSON.parse(content) as TasteProfile;
        addLog({ level: 'INFO', message: `🤖 AI generated Taste Profile with keywords: ${parsed.keywords.join(', ')}`, source: 'ai' });
        return parsed;
    } catch (err) {
        addLog({ level: 'WARN', message: `Failed to generate Taste Profile: ${(err as Error).message}`, source: 'ai' });
        return null;
    }
}

interface AiRecommendation {
    title: string;
    year?: number;
    type: 'movie' | 'series';
    tmdb_id?: number;
    reasoning: string;
}

export async function getAiRecommendations(
    watchHistory: WatchedItem[],
    tasteProfile: TasteProfile | null,
    maxRecommendations = 10,
    filters?: { genres?: string[]; language?: string; yearMin?: number; yearMax?: number; mediaType?: 'movie' | 'series' | 'all' }
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
        const ratingStr = item.rating ? `, Rating: ${item.rating}/10` : '';
        const playStr = (item.playCount && item.playCount > 1) ? `, Play Count: ${item.playCount}` : '';
        return `${i + 1}. "${item.title}" (${item.year || 'N/A'}) - ${item.mediaType} - Genres: ${genres}${ratingStr}${playStr}`;
    }).join('\n');

    // Build filter constraints for the prompt
    let filterInstructions = '';
    if (filters) {
        const constraints: string[] = [];
        if (filters.genres && filters.genres.length > 0) {
            constraints.push(`MUST be in these genres: ${filters.genres.join(', ')}`);
        }
        if (filters.yearMin && filters.yearMax) {
            constraints.push(`MUST be released between ${filters.yearMin} and ${filters.yearMax}`);
        } else if (filters.yearMin) {
            constraints.push(`MUST be released after ${filters.yearMin}`);
        } else if (filters.yearMax) {
            constraints.push(`MUST be released before ${filters.yearMax}`);
        }
        if (filters.language && filters.language !== 'all') {
            // ISO 639-1 language code mapping helper for the prompt
            const langNames: Record<string, string> = {
                ar: 'Arabic', bn: 'Bengali', zh: 'Chinese', nl: 'Dutch', en: 'English',
                fr: 'French', de: 'German', el: 'Greek', gu: 'Gujarati', he: 'Hebrew',
                hi: 'Hindi', it: 'Italian', ja: 'Japanese', kn: 'Kannada', ko: 'Korean',
                ml: 'Malayalam', mr: 'Marathi', pa: 'Punjabi', fa: 'Persian', pl: 'Polish',
                pt: 'Portuguese', ru: 'Russian', es: 'Spanish', sv: 'Swedish', ta: 'Tamil',
                te: 'Telugu', th: 'Thai', tr: 'Turkish', ur: 'Urdu', vi: 'Vietnamese'
            };
            const langName = langNames[filters.language] || filters.language;
            constraints.push(`CRITICAL MUST: All recommendations MUST be originally produced in the ${langName} language (${filters.language}). DO NOT recommend English titles.`);
        }
        if (filters.mediaType === 'movie') {
            constraints.push('Recommend ONLY movies, no TV series');
        } else if (filters.mediaType === 'series') {
            constraints.push('Recommend ONLY TV series, no movies');
        }
        if (constraints.length > 0) {
            filterInstructions = `\n\nIMPORTANT FILTER CONSTRAINTS:\n${constraints.map(c => `- ${c}`).join('\n')}`;
        }
    }

    const profileText = tasteProfile ? `\nUSER TASTE PROFILE:\n${tasteProfile.profile}\n` : '';

    const userPrompt = `Based on this watch history and taste profile, recommend ${maxRecommendations} new titles:
${profileText}
WATCH HISTORY:
${historyText}${filterInstructions}

${filterInstructions ? 'Follow the filter constraints strictly.' : 'Recommend a diverse mix of movies and TV series.'} Return ONLY a valid JSON array.`;

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
