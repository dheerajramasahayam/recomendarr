'use client';

import { useState, useEffect, useCallback } from 'react';

type MediaType = 'movie' | 'series';
type RecStatus = 'pending' | 'approved' | 'rejected' | 'added';
type RecSource = 'tmdb' | 'ai';
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface Recommendation {
  id: string;
  title: string;
  year?: number;
  mediaType: MediaType;
  tmdbId?: number;
  overview?: string;
  posterUrl?: string;
  genres?: string[];
  voteAverage?: number;
  source: RecSource;
  aiReasoning?: string;
  basedOn?: string;
  status: RecStatus;
  createdAt?: string;
}

interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  source: string;
  timestamp: string;
}

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
  added: number;
  total: number;
}

type Page = 'dashboard' | 'recommendations' | 'logs' | 'settings';

interface ArrProfile { id: number; name: string }
interface ArrFolder { id: number; path: string; freeSpace: number }

export default function Home() {
  const [page, setPage] = useState<Page>('dashboard');
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [setupStep, setSetupStep] = useState(0);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, added: 0, total: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [logFilter, setLogFilter] = useState<string>('all');
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);

  // Add to Library modal state
  const [modalRec, setModalRec] = useState<Recommendation | null>(null);
  const [arrProfiles, setArrProfiles] = useState<ArrProfile[]>([]);
  const [arrFolders, setArrFolders] = useState<ArrFolder[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<number>(0);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [searchForContent, setSearchForContent] = useState(true);
  const [addingToLibrary, setAddingToLibrary] = useState(false);

  const toast = useCallback((msg: string, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchRecs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/recommendations?${params}`);
      const data = await res.json();
      setRecs(data.recommendations || []);
      setCounts(data.counts || { pending: 0, approved: 0, rejected: 0, added: 0, total: 0 });
    } catch {
      // silent fail on fetch
    }
  }, [filter]);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (logFilter !== 'all') params.set('level', logFilter);
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      // silent
    }
  }, [logFilter]);

  const checkEngine = useCallback(async () => {
    try {
      const res = await fetch('/api/engine');
      const data = await res.json();
      setIsRunning(data.running);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    // Check if setup is complete
    fetch('/api/settings').then(r => r.json()).then(data => {
      setSetupComplete(data.setupComplete ?? false);
    }).catch(() => setSetupComplete(false));
  }, []);

  useEffect(() => {
    if (setupComplete) {
      fetchRecs();
      checkEngine();
    }
  }, [fetchRecs, checkEngine, setupComplete]);

  useEffect(() => {
    if (page === 'logs' && setupComplete) fetchLogs();
  }, [page, fetchLogs, setupComplete]);

  // Show loading while checking setup status
  if (setupComplete === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  // Show setup wizard if not complete
  if (!setupComplete) {
    return (
      <>
        <SetupWizard
          step={setupStep}
          setStep={setSetupStep}
          onComplete={() => setSetupComplete(true)}
          toast={toast}
        />
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
          ))}
        </div>
      </>
    );
  }

  const runEngine = async () => {
    setIsRunning(true);
    toast('🚀 Recommendation engine started...', 'info');
    try {
      const res = await fetch('/api/engine', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        toast(`❌ ${data.error}`, 'error');
      } else {
        toast(`✅ Found ${data.totalNew} new recommendations!`, 'success');
        fetchRecs();
      }
    } catch (err) {
      toast(`❌ Engine failed: ${(err as Error).message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  // Open the Add to Library modal — fetch quality profiles & folders from the appropriate *arr service
  const openAddModal = async (rec: Recommendation) => {
    setModalRec(rec);
    setModalLoading(true);
    setArrProfiles([]);
    setArrFolders([]);
    setSelectedProfile(0);
    setSelectedFolder('');
    setSearchForContent(true);
    try {
      const res = await fetch(`/api/arr-options?type=${rec.mediaType}`);
      const data = await res.json();
      setArrProfiles(data.profiles || []);
      setArrFolders(data.folders || []);
      if (data.profiles?.length) setSelectedProfile(data.profiles[0].id);
      if (data.folders?.length) setSelectedFolder(data.folders[0].path);
    } catch {
      toast('⚠️ Could not fetch quality profiles / root folders', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  // Confirm add from modal
  const confirmAdd = async () => {
    if (!modalRec) return;
    setAddingToLibrary(true);
    try {
      const res = await fetch('/api/recommendations', {
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
      const data = await res.json();
      if (data.success) {
        toast(`✅ ${data.message}`, 'success');
        fetchRecs();
      } else {
        toast(`⚠️ ${data.message || data.error}`, 'error');
      }
    } catch (err) {
      toast(`❌ ${(err as Error).message}`, 'error');
    } finally {
      setAddingToLibrary(false);
      setModalRec(null);
    }
  };

  const handleAction = async (id: string, action: string) => {
    if (action === 'approve') {
      const rec = recs.find((r) => r.id === id);
      if (rec) { openAddModal(rec); return; }
    }
    setLoading(true);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast(
          action === 'reject'
            ? '🚫 Recommendation rejected'
            : '↩️ Reset to pending',
          'info'
        );
        fetchRecs();
      } else {
        toast(`⚠️ ${data.message || data.error}`, 'error');
      }
    } catch (err) {
      toast(`❌ ${(err as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    setLogs([]);
    toast('🗑️ Logs cleared', 'info');
  };

  // Connection test state
  const [connResults, setConnResults] = useState<Record<string, { success?: boolean; testing: boolean; extra?: string }>>({});

  const testConnection = async (service: string) => {
    setConnResults((prev) => ({ ...prev, [service]: { testing: true } }));
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      setConnResults((prev) => ({
        ...prev,
        [service]: { success: data.success, testing: false, extra: JSON.stringify(data, null, 2) },
      }));
    } catch {
      setConnResults((prev) => ({ ...prev, [service]: { success: false, testing: false } }));
    }
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🎬</div>
          <div>
            <h1>Recomendarr</h1>
            <span className="version-badge">v1.0</span>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Main</div>
          <div className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}>
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </div>
          <div className={`nav-item ${page === 'recommendations' ? 'active' : ''}`} onClick={() => setPage('recommendations')}>
            <span className="nav-icon">🎯</span>
            <span>Recommendations</span>
            {counts.pending > 0 && <span className="badge">{counts.pending}</span>}
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">System</div>
          <div className={`nav-item ${page === 'logs' ? 'active' : ''}`} onClick={() => setPage('logs')}>
            <span className="nav-icon">📋</span>
            <span>Logs</span>
          </div>
          <div className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </div>
        </div>

        <div style={{ marginTop: 'auto', padding: '12px' }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={runEngine}
            disabled={isRunning}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isRunning ? (
              <>
                <div className="spinner" /> Running...
              </>
            ) : (
              <>🚀 Run Now</>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {page === 'dashboard' && (
          <DashboardPage
            counts={counts}
            recs={recs}
            isRunning={isRunning}
            onRun={runEngine}
            onAction={handleAction}
            loading={loading}
          />
        )}

        {page === 'recommendations' && (
          <RecommendationsPage
            recs={recs}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            onAction={handleAction}
            loading={loading}
          />
        )}

        {page === 'logs' && (
          <LogsPage
            logs={logs}
            logFilter={logFilter}
            setLogFilter={setLogFilter}
            onClear={clearLogs}
            onRefresh={fetchLogs}
          />
        )}

        {page === 'settings' && (
          <SettingsPage
            connResults={connResults}
            onTest={testConnection}
            toast={toast}
          />
        )}
      </main>

      {/* Add to Library Modal */}
      {modalRec && (
        <div className="modal-overlay" onClick={() => !addingToLibrary && setModalRec(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add to {modalRec.mediaType === 'movie' ? 'Radarr' : 'Sonarr'}</h3>
              <button className="modal-close" onClick={() => !addingToLibrary && setModalRec(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="modal-title-row">
                {modalRec.posterUrl && <img src={modalRec.posterUrl} alt="" className="modal-poster" />}
                <div>
                  <div className="modal-rec-title">{modalRec.title}</div>
                  {modalRec.year && <div className="modal-rec-year">{modalRec.year}</div>}
                  <span className={`media-badge ${modalRec.mediaType}`}>
                    {modalRec.mediaType === 'movie' ? '🎬 Movie' : '📺 Series'}
                  </span>
                </div>
              </div>

              {modalLoading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p style={{ color: 'var(--text-secondary)' }}>Loading options from {modalRec.mediaType === 'movie' ? 'Radarr' : 'Sonarr'}...</p>
                </div>
              ) : (
                <>
                  <div className="modal-field">
                    <label>Quality Profile</label>
                    <select
                      value={selectedProfile}
                      onChange={(e) => setSelectedProfile(Number(e.target.value))}
                    >
                      {arrProfiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="modal-field">
                    <label>Root Folder</label>
                    <select
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                    >
                      {arrFolders.map((f) => (
                        <option key={f.id} value={f.path}>
                          {f.path} ({(f.freeSpace / 1e12).toFixed(2)} TB free)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="modal-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={searchForContent}
                        onChange={(e) => setSearchForContent(e.target.checked)}
                      />
                      <span>Start search immediately</span>
                    </label>
                    <p className="modal-hint">
                      {modalRec.mediaType === 'movie'
                        ? 'Radarr will immediately search your indexers for this movie'
                        : 'Sonarr will immediately search your indexers for missing episodes'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setModalRec(null)}
                disabled={addingToLibrary}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={confirmAdd}
                disabled={modalLoading || addingToLibrary}
              >
                {addingToLibrary ? (
                  <><div className="spinner" /> Adding...</>
                ) : (
                  <>✅ Add to Library</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Dashboard Page
// ============================================
function DashboardPage({
  counts, recs, isRunning, onRun, onAction, loading,
}: {
  counts: Counts;
  recs: Recommendation[];
  isRunning: boolean;
  onRun: () => void;
  onAction: (id: string, action: string) => void;
  loading: boolean;
}) {
  const pendingRecs = recs.filter((r) => r.status === 'pending').slice(0, 6);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Your media recommendation overview</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={onRun} disabled={isRunning}>
          {isRunning ? (
            <>
              <div className="spinner" /> Running...
            </>
          ) : (
            <>🚀 Run Engine</>
          )}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{counts.total}</div>
          <div className="stat-label">Total Recommendations</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon">⏳</div>
          <div className="stat-value">{counts.pending}</div>
          <div className="stat-label">Pending Review</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{counts.added}</div>
          <div className="stat-label">Added to Library</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon">🚫</div>
          <div className="stat-value">{counts.rejected}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>

      {isRunning && (
        <div style={{
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div className="pulse-dot" />
          <span style={{ fontWeight: 600 }}>Recommendation engine is running...</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Fetching watch history → Finding recommendations → Filtering duplicates
          </span>
        </div>
      )}

      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
        Latest Pending ({counts.pending})
      </h3>

      {pendingRecs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎬</div>
          <h3>No pending recommendations</h3>
          <p>Run the recommendation engine to discover new movies and TV shows based on your watch history.</p>
          <button className="btn btn-primary btn-lg" onClick={onRun} disabled={isRunning}>
            🚀 Get Recommendations
          </button>
        </div>
      ) : (
        <div className="rec-grid">
          {pendingRecs.map((rec) => (
            <RecCard key={rec.id} rec={rec} onAction={onAction} loading={loading} />
          ))}
        </div>
      )}
    </>
  );
}

// ============================================
// Recommendations Page
// ============================================
function RecommendationsPage({
  recs, counts, filter, setFilter, onAction, loading,
}: {
  recs: Recommendation[];
  counts: Counts;
  filter: string;
  setFilter: (f: string) => void;
  onAction: (id: string, action: string) => void;
  loading: boolean;
}) {
  return (
    <>
      <div className="page-header">
        <div>
          <h2>Recommendations</h2>
          <p>Browse, approve, or reject media suggestions</p>
        </div>
      </div>

      <div className="filter-tabs">
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

      {recs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No recommendations found</h3>
          <p>Try changing the filter or run the recommendation engine to discover new content.</p>
        </div>
      ) : (
        <div className="rec-grid">
          {recs.map((rec) => (
            <RecCard key={rec.id} rec={rec} onAction={onAction} loading={loading} />
          ))}
        </div>
      )}
    </>
  );
}

// ============================================
// Recommendation Card Component
// ============================================
function RecCard({ rec, onAction, loading }: { rec: Recommendation; onAction: (id: string, action: string) => void; loading: boolean }) {
  return (
    <div className="rec-card">
      <div className="poster-wrap">
        {rec.posterUrl ? (
          <img src={rec.posterUrl} alt={rec.title} loading="lazy" />
        ) : (
          <div className="no-poster">🎬</div>
        )}
        <div className="poster-badges">
          <span className={`media-badge ${rec.mediaType}`}>
            {rec.mediaType === 'movie' ? '🎬 Movie' : '📺 Series'}
          </span>
          <span className={`source-badge ${rec.source}`}>
            {rec.source === 'ai' ? '🤖 AI' : '🎯 TMDb'}
          </span>
        </div>
        {rec.voteAverage && rec.voteAverage > 0 && (
          <span className="vote-badge">⭐ {rec.voteAverage.toFixed(1)}</span>
        )}
      </div>

      <div className="card-body">
        <div className="card-title">{rec.title}</div>
        {rec.year && <div className="card-year">{rec.year}</div>}

        {rec.genres && rec.genres.length > 0 && (
          <div className="card-genres">
            {rec.genres.slice(0, 4).map((g) => (
              <span key={g} className="genre-tag">{g}</span>
            ))}
          </div>
        )}

        {rec.overview && <div className="card-overview">{rec.overview}</div>}
        {rec.aiReasoning && <div className="ai-reasoning">{rec.aiReasoning}</div>}
        {rec.basedOn && (
          <div className="based-on">
            Based on: <span>{rec.basedOn}</span>
          </div>
        )}

        <div className="card-actions">
          {rec.status === 'pending' && (
            <>
              <button className="btn btn-success" onClick={() => onAction(rec.id, 'approve')} disabled={loading}>
                ✅ Add to Library
              </button>
              <button className="btn btn-danger" onClick={() => onAction(rec.id, 'reject')} disabled={loading}>
                🚫 Reject
              </button>
            </>
          )}
          {rec.status === 'added' && (
            <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '13px' }}>
              ✅ Added to Library
            </span>
          )}
          {rec.status === 'rejected' && (
            <button className="btn btn-ghost" onClick={() => onAction(rec.id, 'pending')} disabled={loading}>
              ↩️ Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Logs Page
// ============================================
function LogsPage({
  logs, logFilter, setLogFilter, onClear, onRefresh,
}: {
  logs: LogEntry[];
  logFilter: string;
  setLogFilter: (f: string) => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="page-header">
        <div>
          <h2>Logs</h2>
          <p>Real-time system activity</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={onRefresh}>🔄 Refresh</button>
          <button className="btn btn-danger" onClick={onClear}>🗑️ Clear</button>
        </div>
      </div>

      <div className="filter-tabs">
        {['all', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map((level) => (
          <button
            key={level}
            className={`filter-tab ${logFilter === level ? 'active' : ''}`}
            onClick={() => setLogFilter(level)}
          >
            {level === 'all' ? 'All' : level}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No logs yet</h3>
          <p>Run the recommendation engine to generate activity logs.</p>
        </div>
      ) : (
        <div className="log-entries">
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
    </>
  );
}

// ============================================
// Settings Page
// ============================================
function SettingsPage({
  connResults,
  onTest,
  toast,
}: {
  connResults: Record<string, { success?: boolean; testing: boolean; extra?: string }>;
  onTest: (service: string) => void;
  toast: (msg: string, type?: string) => void;
}) {
  const [formData, setFormData] = useState({
    media_server_type: 'plex',
    media_server_url: '',
    media_server_api_key: '',
    sonarr_url: '',
    sonarr_api_key: '',
    radarr_url: '',
    radarr_api_key: '',
    ai_enabled: 'false',
    ai_provider_url: 'https://api.openai.com/v1',
    ai_api_key: '',
    ai_model: 'gpt-4o',
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.raw) {
        setFormData(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(data.raw).filter(([k]) => k in prev)
          ),
        }));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: formData }),
      });
      const data = await res.json();
      if (data.success) toast('✅ Settings saved!', 'success');
      else toast(`⚠️ ${data.error}`, 'error');
    } catch (err) {
      toast(`❌ ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Configure your media services and test connections</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="spinner" /> Saving...</> : '💾 Save Settings'}
        </button>
      </div>

      {/* Plex Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-icon">📺</span>
          <div>
            <h3>Plex Media Server</h3>
            <p>Your Plex server for watch history</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onTest('mediaServer')} disabled={connResults['mediaServer']?.testing}>
            {connResults['mediaServer']?.testing ? <div className="spinner" /> : connResults['mediaServer']?.success ? '✅ Connected' : '🔌 Test'}
          </button>
        </div>
        <div className="settings-fields">
          <div className="field-row">
            <label>Plex URL</label>
            <input type="text" placeholder="http://192.168.1.100:32400" value={formData.media_server_url} onChange={e => updateField('media_server_url', e.target.value)} />
          </div>
          <div className="field-row">
            <label>Plex Token</label>
            <input type="password" placeholder="Your Plex Token" value={formData.media_server_api_key} onChange={e => updateField('media_server_api_key', e.target.value)} />
          </div>
          <details className="help-details">
            <summary>How to find your Plex Token</summary>
            <ol>
              <li>Open <strong>Plex Web App</strong> and log in</li>
              <li>Navigate to any movie or show</li>
              <li>Click <strong>⋮</strong> → <strong>Get Info</strong> → <strong>View XML</strong></li>
              <li>In the URL bar, copy the value after <code>X-Plex-Token=</code></li>
            </ol>
          </details>
        </div>
      </div>

      {/* Sonarr Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-icon">📡</span>
          <div>
            <h3>Sonarr</h3>
            <p>TV series management</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onTest('sonarr')} disabled={connResults['sonarr']?.testing}>
            {connResults['sonarr']?.testing ? <div className="spinner" /> : connResults['sonarr']?.success ? '✅ Connected' : '🔌 Test'}
          </button>
        </div>
        <div className="settings-fields">
          <div className="field-row">
            <label>Sonarr URL</label>
            <input type="text" placeholder="http://192.168.1.100:8989" value={formData.sonarr_url} onChange={e => updateField('sonarr_url', e.target.value)} />
          </div>
          <div className="field-row">
            <label>API Key</label>
            <input type="password" placeholder="Found in Sonarr → Settings → General" value={formData.sonarr_api_key} onChange={e => updateField('sonarr_api_key', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Radarr Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-icon">🎬</span>
          <div>
            <h3>Radarr</h3>
            <p>Movie management</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onTest('radarr')} disabled={connResults['radarr']?.testing}>
            {connResults['radarr']?.testing ? <div className="spinner" /> : connResults['radarr']?.success ? '✅ Connected' : '🔌 Test'}
          </button>
        </div>
        <div className="settings-fields">
          <div className="field-row">
            <label>Radarr URL</label>
            <input type="text" placeholder="http://192.168.1.100:7878" value={formData.radarr_url} onChange={e => updateField('radarr_url', e.target.value)} />
          </div>
          <div className="field-row">
            <label>API Key</label>
            <input type="password" placeholder="Found in Radarr → Settings → General" value={formData.radarr_api_key} onChange={e => updateField('radarr_api_key', e.target.value)} />
          </div>
        </div>
      </div>

      {/* AI Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-icon">🤖</span>
          <div>
            <h3>AI Recommendations (Optional)</h3>
            <p>OpenAI-powered smart recommendations</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onTest('ai')} disabled={connResults['ai']?.testing}>
            {connResults['ai']?.testing ? <div className="spinner" /> : connResults['ai']?.success ? '✅ Connected' : '🔌 Test'}
          </button>
        </div>
        <div className="settings-fields">
          <div className="field-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Enable AI
              <input type="checkbox" checked={formData.ai_enabled === 'true'} onChange={e => updateField('ai_enabled', e.target.checked ? 'true' : 'false')} style={{ width: 18, height: 18, accentColor: 'var(--accent-purple)' }} />
            </label>
          </div>
          {formData.ai_enabled === 'true' && (
            <>
              <div className="field-row">
                <label>Provider URL</label>
                <input type="text" placeholder="https://api.openai.com/v1" value={formData.ai_provider_url} onChange={e => updateField('ai_provider_url', e.target.value)} />
              </div>
              <div className="field-row">
                <label>API Key</label>
                <input type="password" placeholder="sk-..." value={formData.ai_api_key} onChange={e => updateField('ai_api_key', e.target.value)} />
              </div>
              <div className="field-row">
                <label>Model</label>
                <input type="text" placeholder="gpt-4o" value={formData.ai_model} onChange={e => updateField('ai_model', e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
        📦 TMDb is pre-configured with a built-in API key — no setup needed.
      </div>
    </>
  );
}

// ============================================
// Setup Wizard Component
// ============================================
function SetupWizard({ step, setStep, onComplete, toast }: {
  step: number;
  setStep: (s: number) => void;
  onComplete: () => void;
  toast: (msg: string, type?: string) => void;
}) {
  const [form, setForm] = useState({
    media_server_url: '',
    media_server_api_key: '',
    sonarr_url: '',
    sonarr_api_key: '',
    radarr_url: '',
    radarr_api_key: '',
    ai_enabled: 'false',
    ai_provider_url: 'https://api.openai.com/v1',
    ai_api_key: '',
    ai_model: 'gpt-4o',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const testConnection = async (service: string) => {
    // Save current settings first so the test-connection endpoint uses them
    setTesting(true);
    setTestResult(null);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { ...form, media_server_type: 'plex' } }),
      });
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      setTestResult(data.success);
      if (data.success) toast('✅ Connection successful!', 'success');
      else toast(`❌ Connection failed: ${data.error || 'Unknown error'}`, 'error');
    } catch {
      setTestResult(false);
      toast('❌ Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const finishSetup = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            ...form,
            media_server_type: 'plex',
            setup_complete: 'true',
          }
        }),
      });
      toast('🎉 Setup complete! Welcome to Recomendarr', 'success');
      onComplete();
    } catch {
      toast('❌ Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { title: 'Plex', icon: '📺' },
    { title: 'Sonarr', icon: '📡' },
    { title: 'Radarr', icon: '🎬' },
    { title: 'AI', icon: '🤖' },
  ];

  return (
    <div className="setup-wizard">
      <div className="setup-container">
        <div className="setup-header">
          <div className="setup-logo">🎬</div>
          <h1>Welcome to Recomendarr</h1>
          <p>Let&apos;s connect your media services. This takes about 2 minutes.</p>
        </div>

        {/* Progress */}
        <div className="setup-steps">
          {steps.map((s, i) => (
            <div key={i} className={`setup-step-indicator ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <div className="step-dot">{i < step ? '✓' : s.icon}</div>
              <span>{s.title}</span>
            </div>
          ))}
        </div>

        {/* Step 0: Plex */}
        {step === 0 && (
          <div className="setup-card">
            <h2>📺 Connect Plex</h2>
            <p className="setup-desc">Enter your Plex server URL and authentication token.</p>

            <div className="setup-field">
              <label>Plex Server URL</label>
              <input type="text" placeholder="http://192.168.1.100:32400" value={form.media_server_url} onChange={e => update('media_server_url', e.target.value)} />
              <span className="field-hint">Include the port (usually 32400)</span>
            </div>

            <div className="setup-field">
              <label>Plex Token</label>
              <input type="password" placeholder="Your Plex authentication token" value={form.media_server_api_key} onChange={e => update('media_server_api_key', e.target.value)} />
            </div>

            <div className="setup-help">
              <h4>🔑 How to find your Plex Token</h4>
              <ol>
                <li>Open <a href="https://app.plex.tv" target="_blank" rel="noreferrer">app.plex.tv</a> and log in</li>
                <li>Navigate to any movie or TV show</li>
                <li>Click the <strong>⋮ menu</strong> → <strong>Get Info</strong> → <strong>View XML</strong></li>
                <li>In the URL bar, find <code>X-Plex-Token=</code> and copy the value after it</li>
              </ol>
              <div className="setup-example">
                <code>https://server:32400/library/...?X-Plex-Token=<strong>abcd1234efgh</strong></code>
              </div>
            </div>

            <div className="setup-actions">
              <button className="btn btn-ghost" onClick={() => testConnection('mediaServer')} disabled={testing || !form.media_server_url}>
                {testing ? <><div className="spinner" /> Testing...</> : testResult === true ? '✅ Connected' : '🔌 Test Connection'}
              </button>
              <button className="btn btn-primary" onClick={() => { setStep(1); setTestResult(null); }} disabled={!form.media_server_url || !form.media_server_api_key}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Sonarr */}
        {step === 1 && (
          <div className="setup-card">
            <h2>📡 Connect Sonarr</h2>
            <p className="setup-desc">Sonarr manages your TV series library.</p>

            <div className="setup-field">
              <label>Sonarr URL</label>
              <input type="text" placeholder="http://192.168.1.100:8989" value={form.sonarr_url} onChange={e => update('sonarr_url', e.target.value)} />
            </div>

            <div className="setup-field">
              <label>Sonarr API Key</label>
              <input type="password" placeholder="Found in Sonarr → Settings → General" value={form.sonarr_api_key} onChange={e => update('sonarr_api_key', e.target.value)} />
              <span className="field-hint">Sonarr → Settings → General → API Key</span>
            </div>

            <div className="setup-actions">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-ghost" onClick={() => testConnection('sonarr')} disabled={testing || !form.sonarr_url}>
                {testing ? <><div className="spinner" /> Testing...</> : testResult === true ? '✅ Connected' : '🔌 Test'}
              </button>
              <button className="btn btn-primary" onClick={() => { setStep(2); setTestResult(null); }} disabled={!form.sonarr_url || !form.sonarr_api_key}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Radarr */}
        {step === 2 && (
          <div className="setup-card">
            <h2>🎬 Connect Radarr</h2>
            <p className="setup-desc">Radarr manages your movie library.</p>

            <div className="setup-field">
              <label>Radarr URL</label>
              <input type="text" placeholder="http://192.168.1.100:7878" value={form.radarr_url} onChange={e => update('radarr_url', e.target.value)} />
            </div>

            <div className="setup-field">
              <label>Radarr API Key</label>
              <input type="password" placeholder="Found in Radarr → Settings → General" value={form.radarr_api_key} onChange={e => update('radarr_api_key', e.target.value)} />
              <span className="field-hint">Radarr → Settings → General → API Key</span>
            </div>

            <div className="setup-actions">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-ghost" onClick={() => testConnection('radarr')} disabled={testing || !form.radarr_url}>
                {testing ? <><div className="spinner" /> Testing...</> : testResult === true ? '✅ Connected' : '🔌 Test'}
              </button>
              <button className="btn btn-primary" onClick={() => { setStep(3); setTestResult(null); }} disabled={!form.radarr_url || !form.radarr_api_key}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: AI (Optional) + Finish */}
        {step === 3 && (
          <div className="setup-card">
            <h2>🤖 AI Recommendations (Optional)</h2>
            <p className="setup-desc">Enable AI-powered recommendations using OpenAI. You can skip this step.</p>

            <div className="setup-field" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <label style={{ margin: 0 }}>Enable AI</label>
              <input type="checkbox" checked={form.ai_enabled === 'true'} onChange={e => update('ai_enabled', e.target.checked ? 'true' : 'false')} style={{ width: 20, height: 20, accentColor: 'var(--accent-purple)' }} />
            </div>

            {form.ai_enabled === 'true' && (
              <>
                <div className="setup-field">
                  <label>Provider URL</label>
                  <input type="text" value={form.ai_provider_url} onChange={e => update('ai_provider_url', e.target.value)} />
                </div>
                <div className="setup-field">
                  <label>API Key</label>
                  <input type="password" placeholder="sk-..." value={form.ai_api_key} onChange={e => update('ai_api_key', e.target.value)} />
                </div>
                <div className="setup-field">
                  <label>Model</label>
                  <input type="text" value={form.ai_model} onChange={e => update('ai_model', e.target.value)} />
                </div>
              </>
            )}

            <div style={{ padding: '12px 16px', background: 'rgba(139, 92, 246, 0.06)', borderRadius: 10, border: '1px solid rgba(139, 92, 246, 0.15)', marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              📦 TMDb is pre-configured — no setup needed for basic recommendations.
            </div>

            <div className="setup-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={finishSetup} disabled={saving}>
                {saving ? <><div className="spinner" /> Finishing...</> : '🚀 Finish Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
