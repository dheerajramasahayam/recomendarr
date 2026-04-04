import type { FeedbackProfile, FeedbackReason } from '@/lib/types';

export type Page = 'dashboard' | 'recommendations' | 'logs' | 'settings';
export type SettingsTabId = 'media' | 'arr' | 'ai' | 'automation' | 'notifications' | 'advanced';

export interface Counts {
    pending: number;
    approved: number;
    rejected: number;
    added: number;
    total: number;
}

export interface ArrProfile {
    id: number;
    name: string;
}

export interface ArrFolder {
    id: number;
    path: string;
    freeSpace: number;
}

export interface DiscoveryUser {
    id: string;
    name: string;
}

export interface SettingsFormData {
    media_server_type: 'plex' | 'jellyfin' | 'emby';
    media_server_url: string;
    media_server_api_key: string;
    media_server_user_id: string;
    sonarr_url: string;
    sonarr_api_key: string;
    sonarr_quality_profile_id: string;
    sonarr_root_folder: string;
    radarr_url: string;
    radarr_api_key: string;
    radarr_quality_profile_id: string;
    radarr_root_folder: string;
    ai_enabled: string;
    ai_provider_url: string;
    ai_api_key: string;
    ai_model: string;
    scheduler_enabled: string;
    cron_schedule: string;
    auto_add: string;
    max_recommendations: string;
    watch_history_limit: string;
    discord_enabled: string;
    discord_webhook_url: string;
    telegram_enabled: string;
    telegram_bot_token: string;
    telegram_chat_id: string;
    notify_on_run_complete: string;
    notify_on_new_recommendations: string;
    notify_on_errors: string;
}

export interface ConnectionResult {
    success?: boolean;
    testing: boolean;
    data?: {
        success?: boolean;
        users?: DiscoveryUser[];
        profiles?: ArrProfile[];
        rootFolders?: ArrFolder[];
        error?: string;
        type?: string;
        model?: string;
    };
}

export interface EngineFilterState {
    genres: string[];
    language: string;
    yearMin: number;
    yearMax: number;
    mediaType: 'movie' | 'series' | 'all';
    vibePrompt: string;
    minRating: number;
    providers: number[];
}

export interface DashboardSummary {
    approvalRate: number;
    newRecommendationsThisWeek: number;
    topSources: Array<{
        source: 'tmdb' | 'ai';
        count: number;
        percentage: number;
    }>;
    lastRun: {
        timestamp: string;
        source: 'manual' | 'scheduled' | 'unknown';
        watched: number;
        tmdbRecommendations: number;
        aiRecommendations: number;
        filtered: number;
        totalNew: number;
        addedToArr: number;
        errors: number;
        candidates: number;
        status: 'success' | 'warning' | 'error';
    } | null;
    pipeline: {
        watched: number;
        candidates: number;
        filtered: number;
        pending: number;
        added: number;
    };
    automation: {
        enabled: boolean;
        cronSchedule: string;
        nextRun: string | null;
        autoAdd: boolean;
        activeChannels: number;
        discordHealthy: boolean;
        telegramHealthy: boolean;
    };
    feedbackProfile: FeedbackProfile;
}

export const EMPTY_FEEDBACK_PROFILE: FeedbackProfile = {
    rejectedTitles: [],
    preferredGenres: [],
    avoidedGenres: [],
    preferredMediaTypes: [],
    avoidedMediaTypes: [],
    feedbackReasons: {},
    summary: '',
};

export const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
    approvalRate: 0,
    newRecommendationsThisWeek: 0,
    topSources: [],
    lastRun: null,
    pipeline: {
        watched: 0,
        candidates: 0,
        filtered: 0,
        pending: 0,
        added: 0,
    },
    automation: {
        enabled: false,
        cronSchedule: '',
        nextRun: null,
        autoAdd: false,
        activeChannels: 0,
        discordHealthy: false,
        telegramHealthy: false,
    },
    feedbackProfile: EMPTY_FEEDBACK_PROFILE,
};

export const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; hint: string }> = [
    { id: 'media', label: 'Media Server', hint: 'Watch history source and user selection' },
    { id: 'arr', label: 'Arr Apps', hint: 'Sonarr and Radarr defaults' },
    { id: 'ai', label: 'AI', hint: 'Provider and ranking behavior' },
    { id: 'automation', label: 'Automation', hint: 'Scheduler, cadence, and auto-add rules' },
    { id: 'notifications', label: 'Notifications', hint: 'Discord and Telegram delivery' },
    { id: 'advanced', label: 'Advanced', hint: 'Learning loop and runtime limits' },
];

export const FEEDBACK_OPTIONS: Array<{ value: FeedbackReason; label: string; hint: string }> = [
    { value: 'already_watched', label: 'Already watched', hint: 'Don’t bring this title back again.' },
    { value: 'wrong_genre', label: 'Wrong genre', hint: 'Genre fit was off.' },
    { value: 'wrong_mood', label: 'Wrong mood', hint: 'Timing or vibe was wrong.' },
    { value: 'too_mainstream', label: 'Too mainstream', hint: 'Needs more hidden-gem energy.' },
    { value: 'too_old', label: 'Too old', hint: 'Leaning too far back in time.' },
    { value: 'not_interested', label: 'Not interested', hint: 'General pass for now.' },
];

export const SCHEDULE_PRESETS = [
    { value: '0 9 * * *', label: 'Daily at 9 AM' },
    { value: '0 9,21 * * *', label: 'Twice daily at 9 AM / 9 PM' },
    { value: '0 0,8,16 * * *', label: 'Three times daily' },
    { value: '0 */6 * * *', label: 'Every 6 hours' },
];

export const DEFAULT_SETTINGS_FORM: SettingsFormData = {
    media_server_type: 'plex',
    media_server_url: '',
    media_server_api_key: '',
    media_server_user_id: '',
    sonarr_url: '',
    sonarr_api_key: '',
    sonarr_quality_profile_id: '',
    sonarr_root_folder: '',
    radarr_url: '',
    radarr_api_key: '',
    radarr_quality_profile_id: '',
    radarr_root_folder: '',
    ai_enabled: 'false',
    ai_provider_url: 'https://api.openai.com/v1',
    ai_api_key: '',
    ai_model: 'gpt-4o',
    scheduler_enabled: 'true',
    cron_schedule: '0 0,8,16 * * *',
    auto_add: 'false',
    max_recommendations: '20',
    watch_history_limit: '50',
    discord_enabled: 'false',
    discord_webhook_url: '',
    telegram_enabled: 'false',
    telegram_bot_token: '',
    telegram_chat_id: '',
    notify_on_run_complete: 'true',
    notify_on_new_recommendations: 'true',
    notify_on_errors: 'true',
};
