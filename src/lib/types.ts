// ============================================
// Shared types for Recomendarr
// ============================================

export type MediaType = 'movie' | 'series';

export interface WatchedItem {
    title: string;
    year?: number;
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
    createdAt?: string;
    updatedAt?: string;
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
