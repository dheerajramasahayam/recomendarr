'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import type { FeedbackProfile, Recommendation } from '@/lib/types';
import type { Counts } from './models';
import { RecommendationDetail } from './recommendation-detail';
import { formatFeedbackReason, getLearningHighlights, getRecommendationSignals } from './utils';

interface RecommendationsWorkspaceProps {
    recs: Recommendation[];
    counts: Counts;
    filter: string;
    setFilter: (value: string) => void;
    feedbackProfile: FeedbackProfile;
    loading: boolean;
    onAction: (id: string, action: string) => void;
}

export function RecommendationsWorkspace({
    recs,
    counts,
    filter,
    setFilter,
    feedbackProfile,
    loading,
    onAction,
}: RecommendationsWorkspaceProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'rating'>('newest');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const deferredQuery = useDeferredValue(searchQuery);

    const filteredRecs = useMemo(() => {
        return recs
            .filter((rec) => {
                if (!deferredQuery) return true;
                const query = deferredQuery.toLowerCase();
                return (
                    rec.title.toLowerCase().includes(query) ||
                    (rec.aiReasoning || '').toLowerCase().includes(query) ||
                    (rec.overview || '').toLowerCase().includes(query) ||
                    formatFeedbackReason(rec.feedbackReason).toLowerCase().includes(query) ||
                    (rec.feedbackNotes || '').toLowerCase().includes(query)
                );
            })
            .sort((a, b) => {
                if (sortBy === 'rating') return (b.voteAverage || 0) - (a.voteAverage || 0);
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });
    }, [deferredQuery, recs, sortBy]);

    const resolvedSelectedId = filteredRecs.some((rec) => rec.id === selectedId)
        ? selectedId
        : (filteredRecs[0]?.id || null);

    const selectedRecommendation = filteredRecs.find((rec) => rec.id === resolvedSelectedId) || null;

    return (
        <div className="page-stack">
            <div className="page-header refined">
                <div>
                    <p className="page-kicker">Triage Workspace</p>
                    <h2>Recommendations</h2>
                    <p>Review the queue in one place, inspect the rationale, and feed the engine better signals.</p>
                </div>
            </div>

            <div className="filter-shell">
                <div className="filter-tabs wide">
                    {[
                        { key: 'all', label: `All (${counts.total})` },
                        { key: 'pending', label: `Pending (${counts.pending})` },
                        { key: 'added', label: `Added (${counts.added})` },
                        { key: 'rejected', label: `Rejected (${counts.rejected})` },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            className={`filter-tab ${filter === tab.key ? 'active' : ''}`}
                            onClick={() => setFilter(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="workspace-controls">
                    <input
                        type="text"
                        className="workspace-search"
                        placeholder="Search titles, explanations, or feedback..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'newest' | 'rating')}>
                        <option value="newest">Newest first</option>
                        <option value="rating">Highest rated</option>
                    </select>
                </div>
            </div>

            {filteredRecs.length === 0 ? (
                <div className="empty-state refined">
                    <div className="empty-icon">Queue</div>
                    <h3>No recommendations in this view</h3>
                    <p>Try a different status filter or run the engine again to refill the queue.</p>
                </div>
            ) : (
                <div className="workspace-shell">
                    <aside className="workspace-list">
                        <div className="workspace-list-header">
                            <div>
                                <p className="section-kicker">Queue</p>
                                <h3>{filteredRecs.length} titles ready for review</h3>
                            </div>
                        </div>

                        <div className="workspace-list-scroll">
                            {filteredRecs.map((rec) => {
                                const signals = getRecommendationSignals(rec, feedbackProfile);
                                const learningHighlights = getLearningHighlights(rec, feedbackProfile);

                                return (
                                    <button
                                        key={rec.id}
                                        type="button"
                                        className={`workspace-item ${resolvedSelectedId === rec.id ? 'active' : ''}`}
                                        onClick={() => setSelectedId(rec.id || null)}
                                    >
                                        <div className="workspace-item-poster">
                                            {rec.posterUrl ? (
                                                <img src={rec.posterUrl} alt={rec.title} />
                                            ) : (
                                                <div className="workspace-item-poster placeholder">No poster</div>
                                            )}
                                        </div>

                                        <div className="workspace-item-copy">
                                            <div className="workspace-item-top">
                                                <h4>{rec.title}</h4>
                                                <span className={`status-pill ${rec.status}`}>{rec.status}</span>
                                            </div>
                                            <p className="workspace-item-subtitle">
                                                {[rec.year, rec.voteAverage ? `${rec.voteAverage.toFixed(1)}/10` : null, rec.source.toUpperCase()]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                            {rec.overview && <p className="workspace-item-overview">{rec.overview}</p>}

                                            <div className="signal-row compact">
                                                {signals.slice(0, 3).map((signal) => (
                                                    <span key={`${signal.label}-${signal.value || ''}`} className={`micro-pill ${signal.tone}`}>
                                                        {signal.label}
                                                        {signal.value ? `: ${signal.value}` : ''}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="learning-card mini">
                                                <strong>Learning from you</strong>
                                                {learningHighlights.length > 0 ? (
                                                    <span>{learningHighlights[0]}</span>
                                                ) : (
                                                    <span>More approvals and rejects will sharpen ranking here.</span>
                                                )}
                                            </div>

                                            {rec.status === 'rejected' && rec.feedbackReason && (
                                                <p className="workspace-feedback-note">Rejected for {formatFeedbackReason(rec.feedbackReason)}</p>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="workspace-detail">
                        <RecommendationDetail
                            recommendation={selectedRecommendation}
                            feedbackProfile={feedbackProfile}
                            loading={loading}
                            onAction={onAction}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
