import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { getDatabase, getFeedbackProfile, getLogs, getRecommendationCounts } from '@/lib/database';
import { getSchedulerSnapshot } from '@/lib/scheduler';
import type { LogEntry } from '@/lib/types';

type RunSource = 'manual' | 'scheduled' | 'unknown';

function parseDetails(details?: string) {
    if (!details) return null;
    try {
        return JSON.parse(details) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function extractNumber(message: string, pattern: RegExp): number {
    const match = message.match(pattern);
    return match ? Number(match[1]) : 0;
}

function getLatestRunWindow(logs: LogEntry[]) {
    const engineLogs = logs.filter((log) => log.source === 'engine');
    const runWindow: LogEntry[] = [];

    for (const log of engineLogs) {
        runWindow.push(log);
        const details = parseDetails(log.details);
        if (details?.event === 'run_start' || log.message.includes('Starting recommendation engine run')) {
            break;
        }
    }

    return runWindow.reverse();
}

function getLastRunSummary(logs: LogEntry[]) {
    const runWindow = getLatestRunWindow(logs);
    if (runWindow.length === 0) {
        return null;
    }

    const summary = {
        timestamp: runWindow[runWindow.length - 1]?.timestamp || new Date().toISOString(),
        source: 'unknown' as RunSource,
        watched: 0,
        tmdbRecommendations: 0,
        aiRecommendations: 0,
        filtered: 0,
        totalNew: 0,
        addedToArr: 0,
        errors: 0,
    };

    for (const log of runWindow) {
        const details = parseDetails(log.details);
        if (details?.source === 'manual' || details?.source === 'scheduled') {
            summary.source = details.source;
        }

        if (details?.event === 'run_complete') {
            summary.totalNew = Number(details.totalNew || 0);
            summary.addedToArr = Number(details.addedToArr || 0);
            summary.errors = Number(details.errors || 0);
            summary.timestamp = log.timestamp;
            continue;
        }

        if (log.message.includes('watched items')) {
            summary.watched = extractNumber(log.message, /Found (\d+) watched items/);
        }
        if (log.message.includes('TMDb found')) {
            summary.tmdbRecommendations = extractNumber(log.message, /TMDb found (\d+) recommendations/);
        }
        if (log.message.includes('AI generated')) {
            summary.aiRecommendations = extractNumber(log.message, /AI generated (\d+) recommendations/);
        }
        if (log.message.includes('new unique recommendations')) {
            summary.filtered = extractNumber(log.message, /Saved (\d+) new unique recommendations/);
        }

        const completionMatch = log.message.match(/Run complete(?: \((manual|scheduled)\))?: (\d+) new recommendations, (\d+) added/);
        if (completionMatch) {
            summary.source = (completionMatch[1] as RunSource | undefined) || summary.source;
            summary.totalNew = Number(completionMatch[2]);
            summary.addedToArr = Number(completionMatch[3]);
            summary.timestamp = log.timestamp;
        }
    }

    if (summary.errors === 0) {
        summary.errors = runWindow.filter((log) => log.level === 'ERROR').length;
    }

    return {
        ...summary,
        candidates: summary.tmdbRecommendations + summary.aiRecommendations,
        status: summary.errors > 0 ? (summary.totalNew > 0 ? 'warning' : 'error') : 'success',
    };
}

export async function GET() {
    try {
        const db = getDatabase();
        const config = getConfig();
        const counts = getRecommendationCounts();
        const feedbackProfile = getFeedbackProfile();
        const logs = getLogs(undefined, 250, 0);
        const lastRun = getLastRunSummary(logs);
        const scheduler = getSchedulerSnapshot();

        const newRecommendationsThisWeek = (
            db.prepare(
                "SELECT COUNT(*) as count FROM recommendations WHERE datetime(created_at) >= datetime('now', '-7 days')"
            ).get() as { count: number }
        ).count;

        const topSources = (
            db.prepare(
                'SELECT source, COUNT(*) as count FROM recommendations GROUP BY source ORDER BY count DESC'
            ).all() as Array<{ source: 'tmdb' | 'ai'; count: number }>
        ).map((entry) => ({
            ...entry,
            percentage: counts.total > 0 ? Math.round((entry.count / counts.total) * 100) : 0,
        }));

        const approvalBase = counts.added + counts.rejected;
        const approvalRate = approvalBase > 0 ? Math.round((counts.added / approvalBase) * 100) : 0;
        const activeChannels = Number(config.notifications.discordEnabled) + Number(config.notifications.telegramEnabled);

        return NextResponse.json({
            approvalRate,
            newRecommendationsThisWeek,
            topSources,
            lastRun,
            pipeline: {
                watched: lastRun?.watched || 0,
                candidates: lastRun?.candidates || 0,
                filtered: lastRun?.filtered || lastRun?.totalNew || 0,
                pending: counts.pending,
                added: counts.added,
            },
            automation: {
                enabled: scheduler.enabled,
                cronSchedule: scheduler.cronSchedule,
                nextRun: scheduler.nextRun,
                autoAdd: scheduler.autoAdd,
                activeChannels,
                discordHealthy: config.notifications.discordEnabled && Boolean(config.notifications.discordWebhookUrl),
                telegramHealthy: config.notifications.telegramEnabled && Boolean(config.notifications.telegramBotToken && config.notifications.telegramChatId),
            },
            feedbackProfile,
        });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
