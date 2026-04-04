import axios from 'axios';
import { addLog } from './database';
import { getConfig, getConfigWithOverrides } from './config';

interface RunSummary {
    watchedCount: number;
    tmdbRecommendations: number;
    aiRecommendations: number;
    totalNew: number;
    addedToArr: number;
    errors: string[];
}

type NotificationChannel = 'discord' | 'telegram';

async function sendDiscord(webhookUrl: string, message: string): Promise<void> {
    await axios.post(webhookUrl, { content: message });
}

async function sendTelegram(botToken: string, chatId: string, message: string): Promise<void> {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
    });
}

async function sendConfiguredNotifications(message: string, overrides?: Record<string, string>): Promise<void> {
    const cfg = overrides ? getConfigWithOverrides(overrides).notifications : getConfig().notifications;
    const tasks: Promise<void>[] = [];

    if (cfg.discordEnabled && cfg.discordWebhookUrl) {
        tasks.push(sendDiscord(cfg.discordWebhookUrl, message));
    }
    if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
        tasks.push(sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, message));
    }

    if (tasks.length === 0) {
        throw new Error('No enabled notification channels are fully configured');
    }

    const results = await Promise.allSettled(tasks);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length === results.length) {
        throw new Error('All notification channels failed');
    }
}

function hasConfiguredChannel() {
    const cfg = getConfig().notifications;
    return (cfg.discordEnabled && !!cfg.discordWebhookUrl) ||
        (cfg.telegramEnabled && !!cfg.telegramBotToken && !!cfg.telegramChatId);
}

function buildRunMessage(result: RunSummary, source: 'manual' | 'scheduled'): string {
    const lines = [
        `Recomendarr ${source === 'scheduled' ? 'scheduled' : 'manual'} run finished`,
        `Watched items analyzed: ${result.watchedCount}`,
        `TMDb candidates: ${result.tmdbRecommendations}`,
        `AI candidates: ${result.aiRecommendations}`,
        `New recommendations saved: ${result.totalNew}`,
        `Added to library: ${result.addedToArr}`,
    ];

    if (result.errors.length > 0) {
        lines.push(`Errors: ${result.errors.length}`);
        lines.push(`Latest error: ${result.errors[0]}`);
    }

    return lines.join('\n');
}

export async function sendTestNotification(channel: NotificationChannel, overrides?: Record<string, string>): Promise<void> {
    const message = `Recomendarr test notification\nChannel: ${channel}\nTimestamp: ${new Date().toISOString()}`;
    const cfg = overrides ? getConfigWithOverrides(overrides).notifications : getConfig().notifications;

    if (channel === 'discord') {
        if (!cfg.discordEnabled || !cfg.discordWebhookUrl) {
            throw new Error('Discord is not fully configured');
        }
        await sendDiscord(cfg.discordWebhookUrl, message);
        addLog({ level: 'INFO', message: 'Discord test notification sent', source: 'notifications' });
        return;
    }

    if (!cfg.telegramEnabled || !cfg.telegramBotToken || !cfg.telegramChatId) {
        throw new Error('Telegram is not fully configured');
    }
    await sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, message);
    addLog({ level: 'INFO', message: 'Telegram test notification sent', source: 'notifications' });
}

export async function notifyRunResult(result: RunSummary, source: 'manual' | 'scheduled' = 'manual'): Promise<void> {
    const cfg = getConfig().notifications;
    if (!hasConfiguredChannel()) {
        return;
    }
    const shouldNotify =
        (result.errors.length > 0 && cfg.notifyOnErrors) ||
        (result.totalNew > 0 && cfg.notifyOnNewRecommendations) ||
        cfg.notifyOnRunComplete;

    if (!shouldNotify) {
        return;
    }

    try {
        await sendConfiguredNotifications(buildRunMessage(result, source));
        addLog({ level: 'INFO', message: `Sent run notification (${source})`, source: 'notifications' });
    } catch (err) {
        addLog({ level: 'WARN', message: `Notification delivery failed: ${(err as Error).message}`, source: 'notifications' });
    }
}
