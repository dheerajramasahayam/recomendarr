'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { AddToLibraryModal } from '@/components/app/add-to-library-modal';
import { DashboardPage } from '@/components/app/dashboard-page';
import { FeedbackModal } from '@/components/app/feedback-modal';
import { RecommendationsWorkspace } from '@/components/app/recommendations-workspace';
import { SettingsPage } from '@/components/app/settings-page';
import { SetupWizard } from '@/components/app/setup-wizard';
import type {
    ConnectionResult,
    Counts,
    EngineFilterState,
    Page,
} from '@/components/app/models';
import { EMPTY_DASHBOARD_SUMMARY } from '@/components/app/models';
import type { LogEntry, Recommendation } from '@/lib/types';

export default function Home() {
    return (
        <Suspense
            fallback={
                <div className="app-loading-screen">
                    <div className="spinner spinner-lg" />
                </div>
            }
        >
            <HomeContent />
        </Suspense>
    );
}

function HomeContent() {
    const [page, setPage] = useState<Page>('dashboard');
    const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
    const [setupStep, setSetupStep] = useState(0);
    const [recs, setRecs] = useState<Recommendation[]>([]);
    const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, added: 0, total: 0 });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState('all');
    const [logFilter, setLogFilter] = useState('all');
    const [isRunning, setIsRunning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: string }>>([]);
    const [dashboardSummary, setDashboardSummary] = useState(EMPTY_DASHBOARD_SUMMARY);

    const [modalRec, setModalRec] = useState<Recommendation | null>(null);
    const [arrProfiles, setArrProfiles] = useState<Array<{ id: number; name: string }>>([]);
    const [arrFolders, setArrFolders] = useState<Array<{ id: number; path: string; freeSpace: number }>>([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<number>(0);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [searchForContent, setSearchForContent] = useState(true);
    const [addingToLibrary, setAddingToLibrary] = useState(false);

    const [feedbackRec, setFeedbackRec] = useState<Recommendation | null>(null);
    const [feedbackReason, setFeedbackReason] = useState<'already_watched' | 'wrong_genre' | 'wrong_mood' | 'too_mainstream' | 'too_old' | 'not_interested'>('not_interested');
    const [feedbackNotes, setFeedbackNotes] = useState('');
    const [savingFeedback, setSavingFeedback] = useState(false);

    const [connResults, setConnResults] = useState<Record<string, ConnectionResult>>({});
    const [engineFilters, setEngineFilters] = useState<EngineFilterState>({
        genres: [],
        language: 'all',
        yearMin: 0,
        yearMax: 0,
        mediaType: 'all',
        vibePrompt: '',
        minRating: 0,
        providers: [],
    });

    const toast = useCallback((msg: string, type = 'info') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
    }, []);

    const fetchRecs = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (filter !== 'all') params.set('status', filter);
            const response = await fetch(`/api/recommendations?${params}`);
            const data = await response.json();
            setRecs(data.recommendations || []);
            setCounts(data.counts || { pending: 0, approved: 0, rejected: 0, added: 0, total: 0 });
        } catch {
            // silent fetch failure
        }
    }, [filter]);

    const fetchDashboardSummary = useCallback(async () => {
        try {
            const response = await fetch('/api/dashboard');
            const data = await response.json();
            setDashboardSummary({ ...EMPTY_DASHBOARD_SUMMARY, ...data });
        } catch {
            // silent fetch failure
        }
    }, []);

    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (logFilter !== 'all') params.set('level', logFilter);
            const response = await fetch(`/api/logs?${params}`);
            const data = await response.json();
            setLogs(data.logs || []);
        } catch {
            // silent fetch failure
        }
    }, [logFilter]);

    const checkEngine = useCallback(async () => {
        try {
            const response = await fetch('/api/engine');
            const data = await response.json();
            setIsRunning(Boolean(data.running));
        } catch {
            // silent fetch failure
        }
    }, []);

    useEffect(() => {
        fetch('/api/settings')
            .then((response) => response.json())
            .then((data) => setSetupComplete(data.setupComplete ?? false))
            .catch(() => setSetupComplete(false));
    }, []);

    useEffect(() => {
        if (!setupComplete) return;
        void Promise.all([fetchRecs(), fetchDashboardSummary(), checkEngine()]);
    }, [checkEngine, fetchDashboardSummary, fetchRecs, setupComplete]);

    useEffect(() => {
        if (page === 'logs' && setupComplete) {
            void fetchLogs();
        }
    }, [fetchLogs, page, setupComplete]);

    if (setupComplete === null) {
        return (
            <div className="app-loading-screen">
                <div className="spinner spinner-lg" />
            </div>
        );
    }

    if (!setupComplete) {
        return (
            <>
                <SetupWizard
                    step={setupStep}
                    setStep={setSetupStep}
                    onComplete={() => {
                        setToasts([{ id: Date.now(), msg: 'Setup complete. Loading workspace...', type: 'success' }]);
                        setTimeout(() => window.location.reload(), 1500);
                    }}
                    toast={toast}
                />
                <div className="toast-container">
                    {toasts.map((item) => (
                        <div key={item.id} className={`toast ${item.type}`}>
                            {item.msg}
                        </div>
                    ))}
                </div>
            </>
        );
    }

    const runEngine = async () => {
        setIsRunning(true);
        toast('Recommendation engine started', 'info');

        try {
            const filters: Record<string, unknown> = {};
            if (engineFilters.genres.length > 0) filters.genres = engineFilters.genres;
            if (engineFilters.language !== 'all') filters.language = engineFilters.language;
            if (engineFilters.yearMin > 0) filters.yearMin = engineFilters.yearMin;
            if (engineFilters.yearMax > 0) filters.yearMax = engineFilters.yearMax;
            if (engineFilters.mediaType !== 'all') filters.mediaType = engineFilters.mediaType;
            if (engineFilters.vibePrompt.trim()) filters.vibePrompt = engineFilters.vibePrompt.trim();
            if (engineFilters.minRating > 0) filters.minRating = engineFilters.minRating;
            if (engineFilters.providers.length > 0) filters.providers = engineFilters.providers;

            const hasFilters = Object.keys(filters).length > 0;
            const response = await fetch('/api/engine', {
                method: 'POST',
                headers: hasFilters ? { 'Content-Type': 'application/json' } : {},
                body: hasFilters ? JSON.stringify({ filters }) : undefined,
            });
            const data = await response.json();

            if (data.error) {
                toast(data.error, 'error');
                return;
            }

            toast(`Found ${data.totalNew} new recommendations`, 'success');
            await Promise.all([fetchRecs(), fetchDashboardSummary()]);
        } catch (error) {
            toast((error as Error).message, 'error');
        } finally {
            setIsRunning(false);
        }
    };

    const openAddModal = async (recommendation: Recommendation) => {
        setModalRec(recommendation);
        setModalLoading(true);
        setArrProfiles([]);
        setArrFolders([]);
        setSelectedProfile(0);
        setSelectedFolder('');
        setSearchForContent(true);

        try {
            const response = await fetch(`/api/arr-options?type=${recommendation.mediaType}`);
            const data = await response.json();
            setArrProfiles(data.profiles || []);
            setArrFolders(data.folders || []);
            if (data.profiles?.length) setSelectedProfile(data.profiles[0].id);
            if (data.folders?.length) setSelectedFolder(data.folders[0].path);
        } catch {
            toast('Could not fetch profile and folder options', 'error');
        } finally {
            setModalLoading(false);
        }
    };

    const confirmAdd = async () => {
        if (!modalRec) return;
        setAddingToLibrary(true);

        try {
            const response = await fetch('/api/recommendations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: modalRec.id,
                    action: 'approve',
                    qualityProfileId: selectedProfile || undefined,
                    rootFolderPath: selectedFolder || undefined,
                    searchForContent,
                }),
            });
            const data = await response.json();
            if (!data.success) {
                toast(data.message || data.error, 'error');
                return;
            }

            toast(data.message, 'success');
            setModalRec(null);
            await Promise.all([fetchRecs(), fetchDashboardSummary()]);
        } catch (error) {
            toast((error as Error).message, 'error');
        } finally {
            setAddingToLibrary(false);
        }
    };

    const submitFeedback = async () => {
        if (!feedbackRec) return;
        setSavingFeedback(true);

        try {
            const response = await fetch('/api/recommendations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: feedbackRec.id,
                    action: 'reject',
                    feedbackReason,
                    feedbackNotes: feedbackNotes.trim() || undefined,
                }),
            });
            const data = await response.json();

            if (!data.success) {
                toast(data.message || data.error, 'error');
                return;
            }

            toast('Feedback saved and recommendation rejected', 'info');
            setFeedbackRec(null);
            setFeedbackReason('not_interested');
            setFeedbackNotes('');
            await Promise.all([fetchRecs(), fetchDashboardSummary()]);
        } catch (error) {
            toast((error as Error).message, 'error');
        } finally {
            setSavingFeedback(false);
        }
    };

    const handleAction = async (id: string, action: string) => {
        if (action === 'approve') {
            const recommendation = recs.find((rec) => rec.id === id);
            if (recommendation) {
                await openAddModal(recommendation);
            }
            return;
        }

        if (action === 'reject') {
            const recommendation = recs.find((rec) => rec.id === id);
            if (recommendation) {
                setFeedbackRec(recommendation);
                setFeedbackReason(recommendation.feedbackReason || 'not_interested');
                setFeedbackNotes(recommendation.feedbackNotes || '');
            }
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/recommendations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            const data = await response.json();

            if (!data.success) {
                toast(data.message || data.error, 'error');
                return;
            }

            toast(action === 'pending' ? 'Returned to queue' : 'Recommendation updated', 'info');
            await Promise.all([fetchRecs(), fetchDashboardSummary()]);
        } catch (error) {
            toast((error as Error).message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const clearLogs = async () => {
        await fetch('/api/logs', { method: 'DELETE' });
        setLogs([]);
        toast('Logs cleared', 'info');
    };

    const testConnection = async (service: string, settings?: Record<string, string>) => {
        setConnResults((prev) => ({ ...prev, [service]: { testing: true } }));
        try {
            const response = await fetch('/api/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service, settings }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Connection test failed');
            }

            setConnResults((prev) => ({
                ...prev,
                [service]: { success: data.success, testing: false, data },
            }));
            return data;
        } catch (error) {
            setConnResults((prev) => ({ ...prev, [service]: { success: false, testing: false } }));
            toast((error as Error).message, 'error');
            return null;
        }
    };

    return (
        <div className="app-shell">
            <aside className="app-sidebar">
                <div className="brand-lockup">
                    <span className="brand-mark">R</span>
                    <div>
                        <h1>Recomendarr</h1>
                        <p>Queue intelligence</p>
                    </div>
                </div>

                <nav className="nav-list">
                    {[
                        { id: 'dashboard', label: 'Dashboard' },
                        { id: 'recommendations', label: `Recommendations${counts.pending > 0 ? ` (${counts.pending})` : ''}` },
                        { id: 'logs', label: 'Logs' },
                        { id: 'settings', label: 'Settings' },
                    ].map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`nav-item ${page === item.id ? 'active' : ''}`}
                            onClick={() => setPage(item.id as Page)}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-card">
                    <p className="section-kicker">Automation</p>
                    <h3>{dashboardSummary.automation.enabled ? 'Scheduler active' : 'Manual only'}</h3>
                    <p>{dashboardSummary.automation.nextRun || 'Enable scheduling in Settings to preview the next run.'}</p>
                </div>
            </aside>

            <main className="app-main">
                {page === 'dashboard' && (
                    <DashboardPage
                        summary={dashboardSummary}
                        recs={recs}
                        isRunning={isRunning}
                        onRun={runEngine}
                        onOpenRecommendations={() => setPage('recommendations')}
                        engineFilters={engineFilters}
                        setEngineFilters={setEngineFilters}
                    />
                )}

                {page === 'recommendations' && (
                    <RecommendationsWorkspace
                        recs={recs}
                        counts={counts}
                        filter={filter}
                        setFilter={setFilter}
                        feedbackProfile={dashboardSummary.feedbackProfile}
                        loading={loading}
                        onAction={handleAction}
                    />
                )}

                {page === 'logs' && (
                    <LogsPage
                        logs={logs}
                        logFilter={logFilter}
                        setLogFilter={setLogFilter}
                        onRefresh={fetchLogs}
                        onClear={clearLogs}
                    />
                )}

                {page === 'settings' && (
                    <SettingsPage
                        connResults={connResults}
                        onTest={testConnection}
                        toast={toast}
                        dashboardSummary={dashboardSummary}
                    />
                )}
            </main>

            <nav className="bottom-nav">
                {[
                    { id: 'dashboard', label: 'Dashboard' },
                    { id: 'recommendations', label: 'Queue' },
                    { id: 'logs', label: 'Logs' },
                    { id: 'settings', label: 'Settings' },
                ].map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`bottom-nav-item ${page === item.id ? 'active' : ''}`}
                        onClick={() => setPage(item.id as Page)}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>

            <AddToLibraryModal
                recommendation={modalRec}
                profiles={arrProfiles}
                folders={arrFolders}
                selectedProfile={selectedProfile}
                selectedFolder={selectedFolder}
                searchForContent={searchForContent}
                loading={modalLoading}
                submitting={addingToLibrary}
                onProfileChange={setSelectedProfile}
                onFolderChange={setSelectedFolder}
                onSearchChange={setSearchForContent}
                onClose={() => setModalRec(null)}
                onSubmit={confirmAdd}
            />

            <FeedbackModal
                recommendation={feedbackRec}
                feedbackReason={feedbackReason}
                feedbackNotes={feedbackNotes}
                saving={savingFeedback}
                onReasonChange={setFeedbackReason}
                onNotesChange={setFeedbackNotes}
                onClose={() => setFeedbackRec(null)}
                onSubmit={submitFeedback}
            />

            <div className="toast-container">
                {toasts.map((item) => (
                    <div key={item.id} className={`toast ${item.type}`}>
                        {item.msg}
                    </div>
                ))}
            </div>
        </div>
    );
}

function LogsPage({
    logs,
    logFilter,
    setLogFilter,
    onRefresh,
    onClear,
}: {
    logs: LogEntry[];
    logFilter: string;
    setLogFilter: (value: string) => void;
    onRefresh: () => void;
    onClear: () => void;
}) {
    return (
        <div className="page-stack">
            <div className="page-header refined">
                <div>
                    <p className="page-kicker">Observability</p>
                    <h2>Logs</h2>
                    <p>Inspect engine, scheduler, and notification activity without leaving the app.</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-ghost" onClick={onRefresh}>Refresh</button>
                    <button className="btn btn-danger" onClick={onClear}>Clear logs</button>
                </div>
            </div>

            <div className="filter-tabs wide">
                {['all', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map((level) => (
                    <button
                        key={level}
                        className={`filter-tab ${logFilter === level ? 'active' : ''}`}
                        onClick={() => setLogFilter(level)}
                    >
                        {level}
                    </button>
                ))}
            </div>

            {logs.length === 0 ? (
                <div className="empty-state refined">
                    <div className="empty-icon">Logs</div>
                    <h3>No log entries yet</h3>
                    <p>Run the engine or test a connection to populate the activity stream.</p>
                </div>
            ) : (
                <div className="log-entries refined">
                    {logs.map((log) => (
                        <div key={log.id} className="log-entry">
                            <span className={`log-level ${log.level}`}>{log.level}</span>
                            <span className="log-time">{new Date(log.timestamp).toLocaleString()}</span>
                            <span className="log-source">[{log.source}]</span>
                            <span className="log-message">{log.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
