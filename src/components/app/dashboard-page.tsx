'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { Recommendation } from '@/lib/types';
import type { DashboardSummary, EngineFilterState } from './models';
import { HealthBadge } from './health-badge';
import { buildFeedbackImpactSummary, formatDateTime, formatRelativeDate } from './utils';

const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'];
const PROVIDERS = [
    { id: 8, name: 'Netflix' },
    { id: 119, name: 'Prime Video' },
    { id: 337, name: 'Disney+' },
    { id: 1899, name: 'Max' },
    { id: 15, name: 'Hulu' },
    { id: 350, name: 'Apple TV+' },
];

interface DashboardPageProps {
    summary: DashboardSummary;
    recs: Recommendation[];
    isRunning: boolean;
    onRun: () => void;
    onOpenRecommendations: () => void;
    engineFilters: EngineFilterState;
    setEngineFilters: Dispatch<SetStateAction<EngineFilterState>>;
}

export function DashboardPage({
    summary,
    recs,
    isRunning,
    onRun,
    onOpenRecommendations,
    engineFilters,
    setEngineFilters,
}: DashboardPageProps) {
    const pendingRecs = recs.filter((rec) => rec.status === 'pending').slice(0, 4);

    const toggleGenre = (genre: string) => {
        setEngineFilters((prev) => ({
            ...prev,
            genres: prev.genres.includes(genre)
                ? prev.genres.filter((item) => item !== genre)
                : [...prev.genres, genre],
        }));
    };

    const toggleProvider = (providerId: number) => {
        setEngineFilters((prev) => ({
            ...prev,
            providers: prev.providers.includes(providerId)
                ? prev.providers.filter((item) => item !== providerId)
                : [...prev.providers, providerId],
        }));
    };

    return (
        <div className="page-stack">
            <div className="page-header refined">
                <div>
                    <p className="page-kicker">Operations Overview</p>
                    <h2>Dashboard</h2>
                    <p>Watch the engine pipeline, schedule health, and queue performance at a glance.</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-ghost" onClick={onOpenRecommendations}>
                        Open triage
                    </button>
                    <button className="btn btn-primary btn-lg" onClick={onRun} disabled={isRunning}>
                        {isRunning ? (
                            <>
                                <span className="spinner" />
                                Running...
                            </>
                        ) : (
                            'Run engine'
                        )}
                    </button>
                </div>
            </div>

            <div className="stats-grid upgraded">
                <article className="stat-card warm">
                    <span className="stat-label">Next scheduled run</span>
                    <strong className="stat-value small">{summary.automation.nextRun ? formatDateTime(summary.automation.nextRun) : 'Manual only'}</strong>
                    <span className="stat-meta">{summary.automation.nextRun ? formatRelativeDate(summary.automation.nextRun) : 'Scheduler disabled'}</span>
                </article>
                <article className="stat-card blue">
                    <span className="stat-label">Last run result</span>
                    <strong className="stat-value small">
                        {summary.lastRun ? `${summary.lastRun.totalNew} saved / ${summary.lastRun.addedToArr} added` : 'No completed runs'}
                    </strong>
                    <span className="stat-meta">
                        {summary.lastRun ? `${summary.lastRun.source} · ${formatRelativeDate(summary.lastRun.timestamp)}` : 'Run the engine to create a baseline'}
                    </span>
                </article>
                <article className="stat-card green">
                    <span className="stat-label">New this week</span>
                    <strong className="stat-value">{summary.newRecommendationsThisWeek}</strong>
                    <span className="stat-meta">Fresh queue entries over the last 7 days</span>
                </article>
                <article className="stat-card ember">
                    <span className="stat-label">Approval rate</span>
                    <strong className="stat-value">{summary.approvalRate}%</strong>
                    <span className="stat-meta">Added versus rejected titles</span>
                </article>
            </div>

            <section className="pipeline-card">
                <div className="section-heading">
                    <div>
                        <p className="section-kicker">Pipeline</p>
                        <h3>Watch history to library flow</h3>
                    </div>
                    <div className="section-health-row">
                        <HealthBadge label={summary.automation.enabled ? 'Automation live' : 'Manual run mode'} status={summary.automation.enabled ? 'healthy' : 'neutral'} />
                        <HealthBadge
                            label={`${summary.automation.activeChannels} notification channel${summary.automation.activeChannels === 1 ? '' : 's'}`}
                            status={summary.automation.activeChannels > 0 ? 'healthy' : 'neutral'}
                        />
                    </div>
                </div>

                <div className="pipeline-strip">
                    {[
                        { label: 'Watch history', value: summary.pipeline.watched },
                        { label: 'Candidates', value: summary.pipeline.candidates },
                        { label: 'Filtered', value: summary.pipeline.filtered },
                        { label: 'Pending', value: summary.pipeline.pending },
                        { label: 'Added', value: summary.pipeline.added },
                    ].map((step) => (
                        <div key={step.label} className="pipeline-step">
                            <span>{step.label}</span>
                            <strong>{step.value}</strong>
                        </div>
                    ))}
                </div>
            </section>

            <div className="dashboard-grid">
                <section className="settings-card run-studio">
                    <div className="section-heading">
                        <div>
                            <p className="section-kicker">Run Studio</p>
                            <h3>Shape the next engine pass</h3>
                        </div>
                    </div>

                    <div className="settings-grid two">
                        <label className="field-row">
                            <span>Media type</span>
                            <div className="chip-grid">
                                {(['all', 'movie', 'series'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`chip-button ${engineFilters.mediaType === type ? 'active' : ''}`}
                                        onClick={() => setEngineFilters((prev) => ({ ...prev, mediaType: type }))}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </label>

                        <label className="field-row">
                            <span>Minimum rating</span>
                            <input
                                type="range"
                                min="0"
                                max="9.5"
                                step="0.5"
                                value={engineFilters.minRating}
                                onChange={(event) => setEngineFilters((prev) => ({ ...prev, minRating: Number(event.target.value) }))}
                            />
                            <small>{engineFilters.minRating > 0 ? `${engineFilters.minRating}/10 and above` : 'No rating floor'}</small>
                        </label>
                    </div>

                    <label className="field-row">
                        <span>Vibe prompt</span>
                        <input
                            type="text"
                            value={engineFilters.vibePrompt}
                            onChange={(event) => setEngineFilters((prev) => ({ ...prev, vibePrompt: event.target.value }))}
                            placeholder="Visually rich sci-fi with emotional payoff..."
                        />
                    </label>

                    <div className="field-row">
                        <span>Preferred genres</span>
                        <div className="chip-grid">
                            {GENRES.map((genre) => (
                                <button
                                    key={genre}
                                    type="button"
                                    className={`chip-button ${engineFilters.genres.includes(genre) ? 'active' : ''}`}
                                    onClick={() => toggleGenre(genre)}
                                >
                                    {genre}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="field-row">
                        <span>Streaming providers</span>
                        <div className="chip-grid">
                            {PROVIDERS.map((provider) => (
                                <button
                                    key={provider.id}
                                    type="button"
                                    className={`chip-button ${engineFilters.providers.includes(provider.id) ? 'active' : ''}`}
                                    onClick={() => toggleProvider(provider.id)}
                                >
                                    {provider.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="settings-grid two">
                        <label className="field-row">
                            <span>Year from</span>
                            <input
                                type="number"
                                min="1900"
                                max="2030"
                                value={engineFilters.yearMin || ''}
                                onChange={(event) => setEngineFilters((prev) => ({ ...prev, yearMin: Number(event.target.value) || 0 }))}
                            />
                        </label>
                        <label className="field-row">
                            <span>Year to</span>
                            <input
                                type="number"
                                min="1900"
                                max="2030"
                                value={engineFilters.yearMax || ''}
                                onChange={(event) => setEngineFilters((prev) => ({ ...prev, yearMax: Number(event.target.value) || 0 }))}
                            />
                        </label>
                    </div>

                    <label className="field-row">
                        <span>Language</span>
                        <select
                            value={engineFilters.language}
                            onChange={(event) => setEngineFilters((prev) => ({ ...prev, language: event.target.value }))}
                        >
                            <option value="all">Any language</option>
                            <option value="en">English</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                            <option value="hi">Hindi</option>
                            <option value="ja">Japanese</option>
                            <option value="ko">Korean</option>
                        </select>
                    </label>
                </section>

                <div className="dashboard-side-stack">
                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Top Sources</p>
                                <h3>What is feeding the queue</h3>
                            </div>
                        </div>
                        <div className="source-list">
                            {summary.topSources.length > 0 ? (
                                summary.topSources.map((source) => (
                                    <div key={source.source} className="source-row">
                                        <div>
                                            <strong>{source.source === 'ai' ? 'AI blend' : 'TMDb graph'}</strong>
                                            <p>{source.count} titles generated</p>
                                        </div>
                                        <span>{source.percentage}%</span>
                                    </div>
                                ))
                            ) : (
                                <p className="helper-copy">Source breakdown will appear after the first run.</p>
                            )}
                        </div>
                    </section>

                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Feedback Signal</p>
                                <h3>How ranking is shifting</h3>
                            </div>
                        </div>
                        <p className="detail-callout subtle">{buildFeedbackImpactSummary(summary.feedbackProfile)}</p>
                        <div className="signal-row compact">
                            {summary.feedbackProfile.preferredGenres.slice(0, 3).map((genre) => (
                                <span key={genre} className="micro-pill positive">Boost: {genre}</span>
                            ))}
                            {summary.feedbackProfile.avoidedGenres.slice(0, 3).map((genre) => (
                                <span key={genre} className="micro-pill warning">Avoid: {genre}</span>
                            ))}
                        </div>
                    </section>

                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Pending Queue</p>
                                <h3>Titles waiting for a decision</h3>
                            </div>
                            <button className="btn btn-ghost" onClick={onOpenRecommendations}>
                                Open queue
                            </button>
                        </div>
                        <div className="mini-queue">
                            {pendingRecs.length > 0 ? (
                                pendingRecs.map((rec) => (
                                    <div key={rec.id} className="mini-queue-item">
                                        {rec.posterUrl ? <img src={rec.posterUrl} alt={rec.title} /> : <div className="mini-queue-poster">No poster</div>}
                                        <div>
                                            <strong>{rec.title}</strong>
                                            <p>{[rec.year, rec.source.toUpperCase()].filter(Boolean).join(' · ')}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="helper-copy">No pending titles. Run the engine or review rejected items.</p>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
