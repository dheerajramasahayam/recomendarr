// ============================================
// Shared types for Recomendarr
// ============================================

export type MediaType = 'movie' | 'series';
export type FeedbackReason =
    | 'already_watched'
    | 'wrong_genre'
    | 'wrong_mood'
    | 'too_mainstream'
    | 'too_old'
    | 'not_interested';

export interface WatchedItem {
    title: string;
    year?: number;
    language?: string;
    mediaType: MediaType;
    tmdbId?: number;
    tvdbId?: number;
    imdbId?: string;
    genres?: string[];
    lastPlayedDate?: string;
    playCount?: number;
    rating?: number;
    overview?: string;
    posterUrl?: string;
}

export interface Recommendation {
    id?: string;
    title: string;
    year?: number;
    language?: string;
    mediaType: MediaType;
    tmdbId?: number;
    tvdbId?: number;
    imdbId?: string;
    overview?: string;
    posterUrl?: string;
    genres?: string[];
    voteAverage?: number;
    source: 'tmdb' | 'ai';
    aiReasoning?: string;
    basedOn?: string;      // title of the watched item that triggered this
    status: 'pending' | 'approved' | 'rejected' | 'added';
    feedbackReason?: FeedbackReason;
    feedbackNotes?: string;
    feedbackAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface FeedbackProfile {
    rejectedTitles: string[];
    preferredGenres: string[];
    avoidedGenres: string[];
    preferredMediaTypes: MediaType[];
    avoidedMediaTypes: MediaType[];
    feedbackReasons: Partial<Record<FeedbackReason, number>>;
    summary: string;
}

export interface MediaServerConfig {
    type: 'jellyfin' | 'plex' | 'emby';
    url: string;
    apiKey: string;
    userId: string;
    plexToken?: string;
}

export interface SonarrSeries {
    id?: number;
    title: string;
    tvdbId: number;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored: boolean;
    addOptions?: {
        searchForMissingEpisodes: boolean;
    };
}

export interface RadarrMovie {
    id?: number;
    title: string;
    tmdbId: number;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored: boolean;
    addOptions?: {
        searchForMovie: boolean;
    };
}

export interface LogEntry {
    id?: number;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    source: string;
    timestamp: string;
    details?: string;
}

export interface AppSettings {
    id?: number;
    key: string;
    value: string;
}

export interface QualityProfile {
    id: number;
    name: string;
}

export interface RootFolder {
    id: number;
    path: string;
    freeSpace?: number;
}
