'use client';

import { useEffect, useMemo, useState } from 'react';
import { AutomationPanel } from './automation-panel';
import { HealthBadge } from './health-badge';
import { NotificationPanel } from './notification-panel';
import type { ConnectionResult, DashboardSummary, SettingsFormData, SettingsTabId } from './models';
import { DEFAULT_SETTINGS_FORM, SETTINGS_TABS } from './models';
import { buildFeedbackImpactSummary, getFeedbackReasonBreakdown, getSchedulePreset } from './utils';

interface SettingsPageProps {
    connResults: Record<string, ConnectionResult>;
    onTest: (service: string, settings?: Record<string, string>) => Promise<ConnectionResult['data'] | null>;
    toast: (msg: string, type?: string) => void;
    dashboardSummary: DashboardSummary;
}

function serviceHealth(result: ConnectionResult | undefined, configured: boolean) {
    if (result?.testing) return { label: 'Testing', status: 'warning' as const };
    if (result?.success) return { label: 'Connected', status: 'healthy' as const };
    if (configured) return { label: 'Configured', status: 'neutral' as const };
    return { label: 'Needs config', status: 'warning' as const };
}

export function SettingsPage({
    connResults,
    onTest,
    toast,
    dashboardSummary,
}: SettingsPageProps) {
    const [formData, setFormData] = useState<SettingsFormData>({ ...DEFAULT_SETTINGS_FORM });
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTabId>('media');
    const [savedSnapshot, setSavedSnapshot] = useState('');
    const [schedulePreset, setSchedulePreset] = useState(getSchedulePreset(DEFAULT_SETTINGS_FORM.cron_schedule));
    const [savedNextRun, setSavedNextRun] = useState<string | null>(dashboardSummary.automation.nextRun);
    const [schedulerPreview, setSchedulerPreview] = useState<{ nextRun: string | null; valid: boolean } | null>(null);
    const [discovery, setDiscovery] = useState({
        mediaUsers: [] as Array<{ id: string; name: string }>,
        sonarrProfiles: [] as Array<{ id: number; name: string }>,
        sonarrRootFolders: [] as Array<{ id: number; path: string; freeSpace: number }>,
        radarrProfiles: [] as Array<{ id: number; name: string }>,
        radarrRootFolders: [] as Array<{ id: number; path: string; freeSpace: number }>,
    });

    useEffect(() => {
        fetch('/api/settings')
            .then((response) => response.json())
            .then((data) => {
                if (!data.raw) {
                    setLoaded(true);
                    return;
                }

                const merged = {
                    ...DEFAULT_SETTINGS_FORM,
                    ...Object.fromEntries(
                        Object.entries(data.raw).filter(([key]) => key in DEFAULT_SETTINGS_FORM)
                    ),
                } as SettingsFormData;

                setFormData(merged);
                setSavedSnapshot(JSON.stringify(merged));
                setSchedulePreset(getSchedulePreset(merged.cron_schedule));
                setSavedNextRun(data.config?.scheduler?.nextRun || dashboardSummary.automation.nextRun || null);
                setLoaded(true);
            })
            .catch(() => setLoaded(true));
    }, [dashboardSummary.automation.nextRun]);

    useEffect(() => {
        if (!loaded) return;

        const enabled = formData.scheduler_enabled === 'true';
        const cron = formData.cron_schedule.trim();

        if (!enabled) {
            setSchedulerPreview({ nextRun: null, valid: true });
            return;
        }

        if (!cron) {
            setSchedulerPreview({ nextRun: null, valid: false });
            return;
        }

        const timeout = setTimeout(() => {
            fetch(`/api/scheduler-preview?enabled=${enabled}&cron=${encodeURIComponent(cron)}`)
                .then((response) => response.json())
                .then((data) => setSchedulerPreview({ nextRun: data.nextRun || null, valid: Boolean(data.valid) }))
                .catch(() => setSchedulerPreview({ nextRun: null, valid: false }));
        }, 200);

        return () => clearTimeout(timeout);
    }, [formData.cron_schedule, formData.scheduler_enabled, loaded]);

    const updateField = <K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        if (key === 'cron_schedule') {
            setSchedulePreset(getSchedulePreset(String(value)));
        }
    };

    const handleDiscovery = (service: string, data: ConnectionResult['data']) => {
        if (!data?.success) return;

        if (service === 'mediaServer' && data.users) {
            setDiscovery((prev) => ({ ...prev, mediaUsers: data.users || [] }));
            if (!formData.media_server_user_id && data.users.length === 1) {
                updateField('media_server_user_id', data.users[0].id);
            }
        }

        if (service === 'sonarr') {
            setDiscovery((prev) => ({
                ...prev,
                sonarrProfiles: data.profiles || [],
                sonarrRootFolders: data.rootFolders || [],
            }));
            if (!formData.sonarr_quality_profile_id && data.profiles?.length) {
                updateField('sonarr_quality_profile_id', String(data.profiles[0].id));
            }
            if (!formData.sonarr_root_folder && data.rootFolders?.length) {
                updateField('sonarr_root_folder', data.rootFolders[0].path);
            }
        }

        if (service === 'radarr') {
            setDiscovery((prev) => ({
                ...prev,
                radarrProfiles: data.profiles || [],
                radarrRootFolders: data.rootFolders || [],
            }));
            if (!formData.radarr_quality_profile_id && data.profiles?.length) {
                updateField('radarr_quality_profile_id', String(data.profiles[0].id));
            }
            if (!formData.radarr_root_folder && data.rootFolders?.length) {
                updateField('radarr_root_folder', data.rootFolders[0].path);
            }
        }
    };

    const handleTest = async (service: string) => {
        const data = await onTest(service, formData as unknown as Record<string, string>);
        if (data?.success) {
            toast('Connection successful', 'success');
            handleDiscovery(service, data);
        }
    };

    const handleSave = async () => {
        if (formData.scheduler_enabled === 'true' && !formData.cron_schedule.trim()) {
            toast('Scheduler cron is required when automatic runs are enabled', 'error');
            return;
        }

        setSaving(true);
        try {
            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: formData }),
            });
            const data = await response.json();
            if (!data.success) {
                toast(data.error || 'Failed to save settings', 'error');
                return;
            }

            const nextRun = schedulerPreview?.nextRun ?? null;
            setSavedSnapshot(JSON.stringify(formData));
            setSavedNextRun(nextRun);
            toast('Settings saved', 'success');
        } catch (error) {
            toast((error as Error).message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const feedbackBreakdown = useMemo(
        () => getFeedbackReasonBreakdown(dashboardSummary.feedbackProfile),
        [dashboardSummary.feedbackProfile]
    );
    const isDirty = loaded && JSON.stringify(formData) !== savedSnapshot;

    if (!loaded) {
        return (
            <div className="loading-panel">
                <span className="spinner spinner-lg" />
            </div>
        );
    }

    const mediaUsers = discovery.mediaUsers.length > 0 ? discovery.mediaUsers : (connResults.mediaServer?.data?.users || []);
    const sonarrProfiles = discovery.sonarrProfiles.length > 0 ? discovery.sonarrProfiles : (connResults.sonarr?.data?.profiles || []);
    const sonarrRootFolders = discovery.sonarrRootFolders.length > 0 ? discovery.sonarrRootFolders : (connResults.sonarr?.data?.rootFolders || []);
    const radarrProfiles = discovery.radarrProfiles.length > 0 ? discovery.radarrProfiles : (connResults.radarr?.data?.profiles || []);
    const radarrRootFolders = discovery.radarrRootFolders.length > 0 ? discovery.radarrRootFolders : (connResults.radarr?.data?.rootFolders || []);

    const mediaStatus = serviceHealth(connResults.mediaServer, Boolean(formData.media_server_url && formData.media_server_api_key));
    const sonarrStatus = serviceHealth(connResults.sonarr, Boolean(formData.sonarr_url && formData.sonarr_api_key));
    const radarrStatus = serviceHealth(connResults.radarr, Boolean(formData.radarr_url && formData.radarr_api_key));
    const aiStatus = serviceHealth(connResults.ai, Boolean(formData.ai_enabled === 'true' && formData.ai_provider_url && formData.ai_api_key));

    return (
        <div className="page-stack settings-page">
            <div className="page-header refined">
                <div>
                    <p className="page-kicker">Configuration</p>
                    <h2>Settings</h2>
                    <p>Split by domain so you can tune infrastructure, automation, and feedback behavior without hunting through one long form.</p>
                </div>
            </div>

            <section className="learning-banner">
                <div>
                    <p className="section-kicker">Learning from you</p>
                    <h3>Ranking impact now visible</h3>
                    <p>{buildFeedbackImpactSummary(dashboardSummary.feedbackProfile)}</p>
                </div>
                <div className="learning-banner-metrics">
                    <div>
                        <span>Preferred genres</span>
                        <strong>{dashboardSummary.feedbackProfile.preferredGenres.slice(0, 3).join(', ') || 'None yet'}</strong>
                    </div>
                    <div>
                        <span>Avoided genres</span>
                        <strong>{dashboardSummary.feedbackProfile.avoidedGenres.slice(0, 3).join(', ') || 'None yet'}</strong>
                    </div>
                </div>
            </section>

            <div className="settings-tabbar">
                {SETTINGS_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <strong>{tab.label}</strong>
                        <span>{tab.hint}</span>
                    </button>
                ))}
            </div>

            {activeTab === 'media' && (
                <div className="settings-stack">
                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Watch History Source</p>
                                <h3>Media server</h3>
                            </div>
                            <div className="section-health-row">
                                <HealthBadge label={mediaStatus.label} status={mediaStatus.status} />
                                <button className="btn btn-ghost btn-sm" onClick={() => handleTest('mediaServer')} disabled={connResults.mediaServer?.testing}>
                                    {connResults.mediaServer?.testing ? 'Testing...' : 'Test connection'}
                                </button>
                            </div>
                        </div>

                        <div className="field-row">
                            <label>Server type</label>
                            <div className="chip-grid">
                                {(['plex', 'jellyfin', 'emby'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`chip-button ${formData.media_server_type === type ? 'active' : ''}`}
                                        onClick={() => updateField('media_server_type', type)}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="settings-grid two">
                            <label className="field-row">
                                <span>Server URL</span>
                                <input
                                    type="text"
                                    value={formData.media_server_url}
                                    onChange={(event) => updateField('media_server_url', event.target.value)}
                                    placeholder={formData.media_server_type === 'plex' ? 'http://192.168.1.100:32400' : 'http://192.168.1.100:8096'}
                                />
                            </label>
                            <label className="field-row">
                                <span>{formData.media_server_type === 'plex' ? 'Plex token' : 'API key'}</span>
                                <input
                                    type="password"
                                    value={formData.media_server_api_key}
                                    onChange={(event) => updateField('media_server_api_key', event.target.value)}
                                />
                            </label>
                        </div>

                        {formData.media_server_type !== 'plex' && (
                            <label className="field-row">
                                <span>User ID</span>
                                <input
                                    type="text"
                                    value={formData.media_server_user_id}
                                    onChange={(event) => updateField('media_server_user_id', event.target.value)}
                                    placeholder="Paste the Jellyfin or Emby user ID"
                                />
                            </label>
                        )}

                        {mediaUsers.length > 0 && (
                            <label className="field-row">
                                <span>Discovered users</span>
                                <select
                                    value={formData.media_server_user_id}
                                    onChange={(event) => updateField('media_server_user_id', event.target.value)}
                                >
                                    <option value="">Select a user</option>
                                    {mediaUsers.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </section>
                </div>
            )}

            {activeTab === 'arr' && (
                <div className="settings-stack">
                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Series Workflow</p>
                                <h3>Sonarr</h3>
                            </div>
                            <div className="section-health-row">
                                <HealthBadge label={sonarrStatus.label} status={sonarrStatus.status} />
                                <button className="btn btn-ghost btn-sm" onClick={() => handleTest('sonarr')} disabled={connResults.sonarr?.testing}>
                                    {connResults.sonarr?.testing ? 'Testing...' : 'Test connection'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-grid two">
                            <label className="field-row">
                                <span>Sonarr URL</span>
                                <input type="text" value={formData.sonarr_url} onChange={(event) => updateField('sonarr_url', event.target.value)} />
                            </label>
                            <label className="field-row">
                                <span>API key</span>
                                <input type="password" value={formData.sonarr_api_key} onChange={(event) => updateField('sonarr_api_key', event.target.value)} />
                            </label>
                        </div>

                        {sonarrProfiles.length > 0 && (
                            <label className="field-row">
                                <span>Default quality profile</span>
                                <select value={formData.sonarr_quality_profile_id} onChange={(event) => updateField('sonarr_quality_profile_id', event.target.value)}>
                                    <option value="">Select a quality profile</option>
                                    {sonarrProfiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {sonarrRootFolders.length > 0 && (
                            <label className="field-row">
                                <span>Default root folder</span>
                                <select value={formData.sonarr_root_folder} onChange={(event) => updateField('sonarr_root_folder', event.target.value)}>
                                    <option value="">Select a root folder</option>
                                    {sonarrRootFolders.map((folder) => (
                                        <option key={folder.id} value={folder.path}>
                                            {folder.path} ({(folder.freeSpace / 1e12).toFixed(2)} TB free)
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </section>

                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Movie Workflow</p>
                                <h3>Radarr</h3>
                            </div>
                            <div className="section-health-row">
                                <HealthBadge label={radarrStatus.label} status={radarrStatus.status} />
                                <button className="btn btn-ghost btn-sm" onClick={() => handleTest('radarr')} disabled={connResults.radarr?.testing}>
                                    {connResults.radarr?.testing ? 'Testing...' : 'Test connection'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-grid two">
                            <label className="field-row">
                                <span>Radarr URL</span>
                                <input type="text" value={formData.radarr_url} onChange={(event) => updateField('radarr_url', event.target.value)} />
                            </label>
                            <label className="field-row">
                                <span>API key</span>
                                <input type="password" value={formData.radarr_api_key} onChange={(event) => updateField('radarr_api_key', event.target.value)} />
                            </label>
                        </div>

                        {radarrProfiles.length > 0 && (
                            <label className="field-row">
                                <span>Default quality profile</span>
                                <select value={formData.radarr_quality_profile_id} onChange={(event) => updateField('radarr_quality_profile_id', event.target.value)}>
                                    <option value="">Select a quality profile</option>
                                    {radarrProfiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {radarrRootFolders.length > 0 && (
                            <label className="field-row">
                                <span>Default root folder</span>
                                <select value={formData.radarr_root_folder} onChange={(event) => updateField('radarr_root_folder', event.target.value)}>
                                    <option value="">Select a root folder</option>
                                    {radarrRootFolders.map((folder) => (
                                        <option key={folder.id} value={folder.path}>
                                            {folder.path} ({(folder.freeSpace / 1e12).toFixed(2)} TB free)
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </section>
                </div>
            )}

            {activeTab === 'ai' && (
                <div className="settings-stack">
                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">AI Blend</p>
                                <h3>Provider and model</h3>
                            </div>
                            <div className="section-health-row">
                                <HealthBadge label={aiStatus.label} status={aiStatus.status} />
                                <button className="btn btn-ghost btn-sm" onClick={() => handleTest('ai')} disabled={connResults.ai?.testing}>
                                    {connResults.ai?.testing ? 'Testing...' : 'Test connection'}
                                </button>
                            </div>
                        </div>

                        <label className="toggle-card">
                            <div>
                                <strong>Enable AI recommendations</strong>
                                <p>Blend TMDb graph suggestions with an OpenAI-ranked taste profile.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.ai_enabled === 'true'}
                                onChange={(event) => updateField('ai_enabled', event.target.checked ? 'true' : 'false')}
                            />
                        </label>

                        {formData.ai_enabled === 'true' && (
                            <div className="settings-grid two">
                                <label className="field-row">
                                    <span>Provider URL</span>
                                    <input type="text" value={formData.ai_provider_url} onChange={(event) => updateField('ai_provider_url', event.target.value)} />
                                </label>
                                <label className="field-row">
                                    <span>Model</span>
                                    <input type="text" value={formData.ai_model} onChange={(event) => updateField('ai_model', event.target.value)} />
                                </label>
                                <label className="field-row span-2">
                                    <span>API key</span>
                                    <input type="password" value={formData.ai_api_key} onChange={(event) => updateField('ai_api_key', event.target.value)} />
                                </label>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {activeTab === 'automation' && (
                <AutomationPanel
                    formData={formData}
                    updateField={updateField}
                    schedulePreset={schedulePreset}
                    setSchedulePreset={setSchedulePreset}
                    savedNextRun={savedNextRun}
                    schedulerPreview={schedulerPreview}
                />
            )}

            {activeTab === 'notifications' && (
                <NotificationPanel
                    formData={formData}
                    updateField={updateField}
                    connResults={connResults}
                    onTestChannel={(channel) => handleTest(channel)}
                />
            )}

            {activeTab === 'advanced' && (
                <div className="settings-stack">
                    <section className="settings-card">
                        <div className="section-heading">
                            <div>
                                <p className="section-kicker">Feedback Analytics</p>
                                <h3>What the model is learning</h3>
                            </div>
                        </div>

                        <div className="settings-grid two">
                            <div className="settings-metric-card">
                                <span>Preferred media types</span>
                                <strong>{dashboardSummary.feedbackProfile.preferredMediaTypes.join(', ') || 'None yet'}</strong>
                            </div>
                            <div className="settings-metric-card">
                                <span>Avoided media types</span>
                                <strong>{dashboardSummary.feedbackProfile.avoidedMediaTypes.join(', ') || 'None yet'}</strong>
                            </div>
                        </div>

                        <div className="reason-grid">
                            {feedbackBreakdown.length > 0 ? (
                                feedbackBreakdown.map((reason) => (
                                    <div key={reason.key} className="reason-card">
                                        <strong>{reason.label}</strong>
                                        <span>{reason.count}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="helper-copy">Reject a few recommendations with structured reasons to populate this panel.</p>
                            )}
                        </div>

                        {dashboardSummary.feedbackProfile.summary && (
                            <p className="detail-callout subtle">{dashboardSummary.feedbackProfile.summary}</p>
                        )}
                    </section>
                </div>
            )}

            <div className={`sticky-save-bar ${isDirty ? 'dirty' : ''}`}>
                <div>
                    <strong>{isDirty ? 'Unsaved changes' : 'All changes saved'}</strong>
                    <p>
                        {isDirty
                            ? 'Save to apply scheduler, notification, and library routing updates.'
                            : 'Your current settings are synced with the stored configuration.'}
                    </p>
                </div>
                <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving || !isDirty}>
                    {saving ? (
                        <>
                            <span className="spinner" />
                            Saving...
                        </>
                    ) : (
                        'Save settings'
                    )}
                </button>
            </div>
        </div>
    );
}
