'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedbackProfile, Recommendation } from '@/lib/types';
import type { Counts, RecommendationFilter } from './models';
import { RecommendationDetail } from './recommendation-detail';
import { formatFeedbackReason, getLearningHighlights, getRecommendationSignals } from './utils';

interface RecommendationsWorkspaceProps {
    recs: Recommendation[];
    counts: Counts;
    filter: RecommendationFilter;
    setFilter: (value: RecommendationFilter) => void;
    feedbackProfile: FeedbackProfile;
    loading: boolean;
    listLoading: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    onAction: (id: string, action: string) => void;
    mode: 'queue' | 'library';
}

export function RecommendationsWorkspace({
    recs,
    counts,
    filter,
    setFilter,
    feedbackProfile,
    loading,
    listLoading,
    loadingMore,
    hasMore,
    onLoadMore,
    onAction,
    mode,
}: RecommendationsWorkspaceProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'rating'>('newest');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const deferredQuery = useDeferredValue(searchQuery);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const queueCount = counts.pending + counts.rejected;
    const isQueueMode = mode === 'queue';

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

    useEffect(() => {
        if (!hasMore || loadingMore || listLoading) {
            return;
        }

        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    onLoadMore();
                }
            },
            {
                root,
                rootMargin: '0px 0px 220px 0px',
                threshold: 0.1,
            }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [filteredRecs.length, hasMore, listLoading, loadingMore, onLoadMore]);

    const resolvedSelectedId = filteredRecs.some((rec) => rec.id === selectedId)
        ? selectedId
        : (filteredRecs[0]?.id || null);

    const selectedRecommendation = filteredRecs.find((rec) => rec.id === resolvedSelectedId) || null;

    const copy = isQueueMode
        ? {
            kicker: 'Triage Workspace',
            title: 'Recommendations',
            description: 'Review the active queue in one place, inspect the rationale, and feed the engine better signals.',
            listTitle: `${filteredRecs.length} titles ready for review`,
            emptyIcon: 'Queue',
            emptyTitle: 'No recommendations in this view',
            emptyDescription: 'Try a different status filter or run the engine again to refill the queue.',
            detailEmpty: {
                kicker: 'Triage Workspace',
                title: 'Select a recommendation',
                description: 'Pick a title from the queue to inspect the recommendation rationale, watch the trailer, and approve or reject it.',
            },
            searchPlaceholder: 'Search queue titles, explanations, or feedback...',
            footerDone: 'You have reached the end of the triage queue.',
        }
        : {
            kicker: 'Library Intake',
            title: 'Added Titles',
            description: 'Keep library sends separate from triage so the recommendation queue stays clean and reviewable.',
            listTitle: `${filteredRecs.length} titles already moved into your library workflow`,
            emptyIcon: 'Library',
            emptyTitle: 'No added titles yet',
            emptyDescription: 'Approve a recommendation and it will move here once it is sent to Sonarr or Radarr.',
            detailEmpty: {
                kicker: 'Library Intake',
                title: 'Select an added title',
                description: 'Pick a title to inspect why it was added, review the trailer, and confirm the recommendation context.',
            },
            searchPlaceholder: 'Search added titles, notes, or reasoning...',
            footerDone: 'You have reached the end of the added-title history.',
        };

    return (
        <div className="page-stack">
            <div className="page-header refined">
                <div>
                    <p className="page-kicker">{copy.kicker}</p>
                    <h2>{copy.title}</h2>
                    <p>{copy.description}</p>
                </div>
            </div>

            <div className="filter-shell">
                {isQueueMode && (
                    <div className="filter-tabs wide">
                        {[
                            { key: 'all', label: `All active (${queueCount})` },
                            { key: 'pending', label: `Pending (${counts.pending})` },
                            { key: 'rejected', label: `Rejected (${counts.rejected})` },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                className={`filter-tab ${filter === tab.key ? 'active' : ''}`}
                                onClick={() => setFilter(tab.key as RecommendationFilter)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="workspace-controls">
                    <input
                        type="text"
                        className="workspace-search"
                        placeholder={copy.searchPlaceholder}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'newest' | 'rating')}>
                        <option value="newest">Newest first</option>
                        <option value="rating">Highest rated</option>
                    </select>
                </div>
            </div>

            {listLoading && recs.length === 0 ? (
                <div className="empty-state refined">
                    <div className="spinner spinner-lg" />
                    <h3>Loading titles</h3>
                    <p>Fetching the next slice of recommendations from the queue.</p>
                </div>
            ) : filteredRecs.length === 0 ? (
                <div className="empty-state refined">
                    <div className="empty-icon">{copy.emptyIcon}</div>
                    <h3>{copy.emptyTitle}</h3>
                    <p>{copy.emptyDescription}</p>
                </div>
            ) : (
                <div className="workspace-shell">
                    <aside className="workspace-list">
                        <div className="workspace-list-header">
                            <div>
                                <p className="section-kicker">{isQueueMode ? 'Queue' : 'Library'}</p>
                                <h3>{copy.listTitle}</h3>
                            </div>
                        </div>

                        <div ref={scrollRef} className="workspace-list-scroll">
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

                            <div ref={sentinelRef} className="workspace-feed-state">
                                {loadingMore ? (
                                    <>
                                        <span className="spinner" />
                                        Loading more titles...
                                    </>
                                ) : hasMore ? (
                                    <button type="button" className="btn btn-ghost" onClick={onLoadMore}>
                                        Load more
                                    </button>
                                ) : (
                                    <span className="helper-copy">{copy.footerDone}</span>
                                )}
                            </div>
                        </div>
                    </aside>

                    <div className="workspace-detail">
                        <RecommendationDetail
                            recommendation={selectedRecommendation}
                            feedbackProfile={feedbackProfile}
                            loading={loading}
                            onAction={onAction}
                            emptyState={copy.detailEmpty}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
