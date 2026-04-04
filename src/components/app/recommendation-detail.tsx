'use client';

import { useState } from 'react';
import type { FeedbackProfile, Recommendation } from '@/lib/types';
import { formatFeedbackReason, getLearningHighlights, getRecommendationSignals } from './utils';

interface RecommendationDetailProps {
    recommendation: Recommendation | null;
    feedbackProfile: FeedbackProfile;
    loading: boolean;
    onAction: (id: string, action: string) => void;
}

export function RecommendationDetail({
    recommendation,
    feedbackProfile,
    loading,
    onAction,
}: RecommendationDetailProps) {
    const [trailerKey, setTrailerKey] = useState<string | null>(null);
    const [trailerLoading, setTrailerLoading] = useState(false);

    if (!recommendation) {
        return (
            <div className="detail-empty">
                <p className="detail-empty-kicker">Triage Workspace</p>
                <h3>Select a recommendation</h3>
                <p>Pick a title from the queue to inspect the recommendation rationale, watch the trailer, and approve or reject it.</p>
            </div>
        );
    }

    const signals = getRecommendationSignals(recommendation, feedbackProfile);
    const learningHighlights = getLearningHighlights(recommendation, feedbackProfile);

    const fetchTrailer = async () => {
        if (!recommendation.tmdbId) return;
        setTrailerLoading(true);
        try {
            const response = await fetch(`/api/trailer?tmdbId=${recommendation.tmdbId}&type=${recommendation.mediaType}`);
            const data = await response.json();
            if (data.key) {
                setTrailerKey(data.key);
            } else {
                alert('No official YouTube trailer was found for this title.');
            }
        } catch {
            alert('Failed to load the trailer.');
        } finally {
            setTrailerLoading(false);
        }
    };

    return (
        <>
            <section className="recommendation-detail">
                <div className="detail-hero">
                    <div className="detail-poster-wrap">
                        {recommendation.posterUrl ? (
                            <img src={recommendation.posterUrl} alt={recommendation.title} className="detail-poster" />
                        ) : (
                            <div className="detail-poster placeholder">No poster</div>
                        )}
                    </div>

                    <div className="detail-copy">
                        <div className="detail-meta-row">
                            <span className={`status-pill ${recommendation.status}`}>{recommendation.status}</span>
                            <span className={`source-pill ${recommendation.source}`}>{recommendation.source === 'ai' ? 'AI blend' : 'TMDb graph'}</span>
                            <span className={`type-pill-inline ${recommendation.mediaType}`}>{recommendation.mediaType}</span>
                        </div>

                        <h2>{recommendation.title}</h2>
                        <p className="detail-subtitle">
                            {[recommendation.year, recommendation.voteAverage ? `${recommendation.voteAverage.toFixed(1)}/10 TMDb` : null]
                                .filter(Boolean)
                                .join(' · ') || 'Metadata still loading'}
                        </p>

                        {recommendation.genres && recommendation.genres.length > 0 && (
                            <div className="signal-row">
                                {recommendation.genres.slice(0, 6).map((genre) => (
                                    <span key={genre} className="micro-pill neutral">{genre}</span>
                                ))}
                            </div>
                        )}

                        <div className="detail-actions-top">
                            {recommendation.tmdbId && (
                                <button className="btn btn-ghost" onClick={fetchTrailer} disabled={trailerLoading}>
                                    {trailerLoading ? (
                                        <>
                                            <span className="spinner" />
                                            Loading trailer
                                        </>
                                    ) : (
                                        'Watch trailer'
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="detail-section-heading">
                        <h3>Why this was recommended</h3>
                        <p>Expose the reasoning instead of treating the engine like a black box.</p>
                    </div>
                    <div className="signal-row">
                        {signals.map((signal) => (
                            <span key={`${signal.label}-${signal.value || ''}`} className={`micro-pill ${signal.tone}`}>
                                <strong>{signal.label}</strong>
                                {signal.value ? `: ${signal.value}` : ''}
                            </span>
                        ))}
                    </div>
                    {recommendation.aiReasoning && <p className="detail-callout">{recommendation.aiReasoning}</p>}
                    {recommendation.overview && <p className="detail-overview">{recommendation.overview}</p>}
                </div>

                <div className="detail-grid">
                    <div className="detail-section">
                        <div className="detail-section-heading">
                            <h3>Learning from you</h3>
                            <p>Current ranking pressure applied from your approvals and rejects.</p>
                        </div>
                        {learningHighlights.length > 0 ? (
                            <ul className="insight-list">
                                {learningHighlights.map((highlight) => (
                                    <li key={highlight}>{highlight}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="helper-copy">Collect a few rejects and adds to build a stronger feedback profile.</p>
                        )}
                        {feedbackProfile.summary && <p className="detail-callout subtle">{feedbackProfile.summary}</p>}
                    </div>

                    <div className="detail-section">
                        <div className="detail-section-heading">
                            <h3>Recommendation state</h3>
                            <p>Track what happened to this title after it was surfaced.</p>
                        </div>
                        <dl className="detail-definition-list">
                            <div>
                                <dt>Status</dt>
                                <dd>{recommendation.status}</dd>
                            </div>
                            <div>
                                <dt>Source</dt>
                                <dd>{recommendation.source === 'ai' ? 'AI-assisted' : 'TMDb'}</dd>
                            </div>
                            <div>
                                <dt>Based on</dt>
                                <dd>{recommendation.basedOn || 'Not linked to a single title'}</dd>
                            </div>
                            <div>
                                <dt>Feedback</dt>
                                <dd>{recommendation.feedbackReason ? formatFeedbackReason(recommendation.feedbackReason) : 'None yet'}</dd>
                            </div>
                        </dl>
                        {recommendation.feedbackNotes && (
                            <p className="detail-callout subtle">{recommendation.feedbackNotes}</p>
                        )}
                    </div>
                </div>

                <div className="detail-action-bar">
                    {recommendation.status === 'pending' && (
                        <>
                            <button className="btn btn-success" onClick={() => onAction(recommendation.id!, 'approve')} disabled={loading}>
                                Add to library
                            </button>
                            <button className="btn btn-danger" onClick={() => onAction(recommendation.id!, 'reject')} disabled={loading}>
                                Reject with feedback
                            </button>
                        </>
                    )}
                    {recommendation.status === 'rejected' && (
                        <>
                            <span className="helper-copy">Rejected because: {formatFeedbackReason(recommendation.feedbackReason)}</span>
                            <button className="btn btn-ghost" onClick={() => onAction(recommendation.id!, 'pending')} disabled={loading}>
                                Return to queue
                            </button>
                        </>
                    )}
                    {recommendation.status === 'added' && (
                        <span className="helper-copy">This title has already been pushed to your library workflow.</span>
                    )}
                </div>
            </section>

            {trailerKey && (
                <div className="sheet-overlay trailer" onClick={() => setTrailerKey(null)}>
                    <div className="trailer-frame" onClick={(event) => event.stopPropagation()}>
                        <iframe
                            width="100%"
                            height="100%"
                            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                            title={`${recommendation.title} trailer`}
                            frameBorder="0"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                    <button className="sheet-close trailer-close" onClick={() => setTrailerKey(null)} aria-label="Close trailer">
                        x
                    </button>
                </div>
            )}
        </>
    );
}
