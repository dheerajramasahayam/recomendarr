import type { FeedbackProfile, FeedbackReason, Recommendation } from '@/lib/types';
import { FEEDBACK_OPTIONS, SCHEDULE_PRESETS } from './models';

export interface RecommendationSignal {
    label: string;
    value?: string;
    tone: 'primary' | 'positive' | 'warning' | 'neutral';
}

function prettifyToken(token: string) {
    return token
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function getSchedulePreset(schedule: string) {
    return SCHEDULE_PRESETS.some((preset) => preset.value === schedule) ? schedule : 'custom';
}

export function formatFeedbackReason(reason?: FeedbackReason) {
    return FEEDBACK_OPTIONS.find((option) => option.value === reason)?.label || 'Feedback captured';
}

export function formatRelativeDate(value?: string | null) {
    if (!value) return 'Not scheduled';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'Unknown';

    const deltaMs = timestamp - Date.now();
    const minutes = Math.round(deltaMs / 60000);
    const absMinutes = Math.abs(minutes);

    if (absMinutes < 60) {
        return minutes >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`;
    }

    const hours = Math.round(absMinutes / 60);
    if (hours < 24) {
        return minutes >= 0 ? `in ${hours}h` : `${hours}h ago`;
    }

    const days = Math.round(hours / 24);
    return minutes >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function formatDateTime(value?: string | null) {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function buildFeedbackImpactSummary(feedbackProfile: FeedbackProfile) {
    const summary: string[] = [];
    if (feedbackProfile.preferredGenres.length > 0) {
        summary.push(`Boosting ${feedbackProfile.preferredGenres.slice(0, 2).join(', ')}`);
    }
    if (feedbackProfile.avoidedGenres.length > 0) {
        summary.push(`penalizing ${feedbackProfile.avoidedGenres.slice(0, 2).join(', ')}`);
    }
    if (feedbackProfile.avoidedMediaTypes.length > 0) {
        summary.push(`deprioritizing ${feedbackProfile.avoidedMediaTypes.join(' and ')}`);
    }
    return summary.length > 0 ? summary.join(', ') : 'Not enough explicit feedback yet to shift ranking heavily.';
}

export function getFeedbackReasonBreakdown(feedbackProfile: FeedbackProfile) {
    return Object.entries(feedbackProfile.feedbackReasons)
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .map(([reason, count]) => ({
            key: reason as FeedbackReason,
            label: prettifyToken(reason),
            count: count || 0,
        }));
}

export function getRecommendationSignals(rec: Recommendation, feedbackProfile: FeedbackProfile): RecommendationSignal[] {
    const signals: RecommendationSignal[] = [];
    const genres = (rec.genres || []).map((genre) => genre.toLowerCase());

    if (rec.basedOn) {
        signals.push({ label: 'Based on', value: rec.basedOn, tone: 'primary' });
    }

    const preferredGenre = feedbackProfile.preferredGenres.find((genre) => genres.includes(genre));
    if (preferredGenre) {
        signals.push({ label: 'Matched preferred genre', value: prettifyToken(preferredGenre), tone: 'positive' });
    }

    if (feedbackProfile.avoidedGenres.length > 0 && !genres.some((genre) => feedbackProfile.avoidedGenres.includes(genre))) {
        signals.push({ label: 'Avoided rejected patterns', tone: 'neutral' });
    }

    if (rec.source === 'ai') {
        signals.push({ label: 'AI selection', value: rec.aiReasoning ? 'Taste profile match' : undefined, tone: 'primary' });
    } else if (rec.voteAverage) {
        signals.push({ label: 'TMDb signal', value: `${rec.voteAverage.toFixed(1)}/10`, tone: rec.voteAverage >= 7.5 ? 'positive' : 'neutral' });
    }

    if (rec.aiReasoning && /director|creator|filmmaker/i.test(rec.aiReasoning)) {
        signals.push({ label: 'Director follow', tone: 'positive' });
    }

    if (signals.length < 5 && rec.year && rec.year >= 2020) {
        signals.push({ label: 'Fresh release window', value: String(rec.year), tone: 'neutral' });
    }

    return signals.slice(0, 5);
}

export function getLearningHighlights(rec: Recommendation, feedbackProfile: FeedbackProfile) {
    const highlights: string[] = [];
    const genres = (rec.genres || []).map((genre) => genre.toLowerCase());

    const preferred = feedbackProfile.preferredGenres.filter((genre) => genres.includes(genre));
    if (preferred.length > 0) {
        highlights.push(`Boosted by ${preferred.slice(0, 2).map(prettifyToken).join(', ')}`);
    }

    const avoided = feedbackProfile.avoidedGenres.filter((genre) => genres.includes(genre));
    if (avoided.length > 0) {
        highlights.push(`Watchlist conflict with ${avoided.slice(0, 2).map(prettifyToken).join(', ')}`);
    } else if (feedbackProfile.avoidedGenres.length > 0) {
        highlights.push('No overlap with commonly rejected genres');
    }

    if (feedbackProfile.preferredMediaTypes.includes(rec.mediaType)) {
        highlights.push(`Matches your stronger ${rec.mediaType} approval pattern`);
    }

    if (feedbackProfile.rejectedTitles.includes(rec.title.toLowerCase())) {
        highlights.push('Exact title was previously rejected');
    }

    return highlights.slice(0, 3);
}
