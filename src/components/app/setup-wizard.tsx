'use client';

import { useState } from 'react';
import { SetupDiscoveryStep } from './setup-discovery-step';
import type { SettingsFormData } from './models';
import { DEFAULT_SETTINGS_FORM } from './models';

interface SetupWizardProps {
    step: number;
    setStep: (value: number) => void;
    onComplete: () => void;
    toast: (msg: string, type?: string) => void;
}

export function SetupWizard({
    step,
    setStep,
    onComplete,
    toast,
}: SetupWizardProps) {
    const [form, setForm] = useState<SettingsFormData>({ ...DEFAULT_SETTINGS_FORM });
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [discovery, setDiscovery] = useState({
        mediaUsers: [] as Array<{ id: string; name: string }>,
        sonarrProfiles: [] as Array<{ id: number; name: string }>,
        sonarrRootFolders: [] as Array<{ id: number; path: string; freeSpace: number }>,
        radarrProfiles: [] as Array<{ id: number; name: string }>,
        radarrRootFolders: [] as Array<{ id: number; path: string; freeSpace: number }>,
    });

    const update = <K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleDiscovery = (service: string, data: Record<string, unknown>) => {
        if (!data.success) return;

        if (service === 'mediaServer' && Array.isArray(data.users)) {
            const users = data.users as Array<{ id: string; name: string }>;
            setDiscovery((prev) => ({ ...prev, mediaUsers: users }));
            if (!form.media_server_user_id && users.length === 1) {
                update('media_server_user_id', users[0].id);
            }
        }

        if (service === 'sonarr') {
            const profiles = (Array.isArray(data.profiles) ? data.profiles : []) as Array<{ id: number; name: string }>;
            const rootFolders = (Array.isArray(data.rootFolders) ? data.rootFolders : []) as Array<{ id: number; path: string; freeSpace: number }>;
            setDiscovery((prev) => ({ ...prev, sonarrProfiles: profiles, sonarrRootFolders: rootFolders }));
            if (!form.sonarr_quality_profile_id && profiles.length > 0) {
                update('sonarr_quality_profile_id', String(profiles[0].id));
            }
            if (!form.sonarr_root_folder && rootFolders.length > 0) {
                update('sonarr_root_folder', rootFolders[0].path);
            }
        }

        if (service === 'radarr') {
            const profiles = (Array.isArray(data.profiles) ? data.profiles : []) as Array<{ id: number; name: string }>;
            const rootFolders = (Array.isArray(data.rootFolders) ? data.rootFolders : []) as Array<{ id: number; path: string; freeSpace: number }>;
            setDiscovery((prev) => ({ ...prev, radarrProfiles: profiles, radarrRootFolders: rootFolders }));
            if (!form.radarr_quality_profile_id && profiles.length > 0) {
                update('radarr_quality_profile_id', String(profiles[0].id));
            }
            if (!form.radarr_root_folder && rootFolders.length > 0) {
                update('radarr_root_folder', rootFolders[0].path);
            }
        }
    };

    const testConnection = async (service: string) => {
        setTesting(true);
        setTestResult(null);

        try {
            const response = await fetch('/api/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service, settings: form }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Connection failed');
            }

            setTestResult(Boolean(data.success));
            if (data.success) {
                handleDiscovery(service, data);
                toast('Connection successful', 'success');
            } else {
                toast(data.error || 'Connection failed', 'error');
            }
        } catch (error) {
            setTestResult(false);
            toast((error as Error).message, 'error');
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
                        setup_complete: 'true',
                    },
                }),
            });
            toast('Setup complete', 'success');
            onComplete();
        } catch {
            toast('Failed to save setup', 'error');
        } finally {
            setSaving(false);
        }
    };

    const serverLabel = form.media_server_type === 'plex' ? 'Plex' : form.media_server_type === 'jellyfin' ? 'Jellyfin' : 'Emby';
    const steps = [
        { title: 'Media', label: 'Media Server' },
        { title: 'Series', label: 'Sonarr' },
        { title: 'Movies', label: 'Radarr' },
        { title: 'AI', label: 'AI Blend' },
        { title: 'Review', label: 'Review' },
    ];

    const discoverySummary = {
        media: discovery.mediaUsers.length > 0 ? `${discovery.mediaUsers.length} user${discovery.mediaUsers.length === 1 ? '' : 's'} discovered` : 'Test to discover users',
        sonarr: discovery.sonarrProfiles.length > 0
            ? `${discovery.sonarrProfiles.length} profiles · ${discovery.sonarrRootFolders.length} folders`
            : 'Test to discover Sonarr defaults',
        radarr: discovery.radarrProfiles.length > 0
            ? `${discovery.radarrProfiles.length} profiles · ${discovery.radarrRootFolders.length} folders`
            : 'Test to discover Radarr defaults',
    };

    return (
        <div className="setup-wizard refined">
            <div className="setup-container wide">
                <div className="setup-header">
                    <div className="setup-logo">Recomendarr</div>
                    <h1>Connect the stack once</h1>
                    <p>Discovery-first setup fills defaults as you go, then lets you review everything before the first run.</p>
                </div>

                <div className="setup-steps refined">
                    {steps.map((item, index) => (
                        <div key={item.title} className={`setup-step-indicator ${index === step ? 'active' : index < step ? 'done' : ''}`}>
                            <div className="step-dot">{index < step ? '✓' : index + 1}</div>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>

                {step === 0 && (
                    <SetupDiscoveryStep
                        eyebrow="Step 1"
                        title={`Connect ${serverLabel}`}
                        description="Choose the watch history source and test once to discover eligible users immediately."
                        discovery={<p>{discoverySummary.media}</p>}
                        footer={
                            <>
                                <button className="btn btn-ghost" onClick={() => testConnection('mediaServer')} disabled={testing || !form.media_server_url}>
                                    {testing ? 'Testing...' : testResult === true ? 'Connected' : 'Test connection'}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => { setStep(1); setTestResult(null); }}
                                    disabled={!form.media_server_url || !form.media_server_api_key || (form.media_server_type !== 'plex' && !form.media_server_user_id)}
                                >
                                    Continue
                                </button>
                            </>
                        }
                    >
                        <div className="field-row">
                            <label>Server type</label>
                            <div className="chip-grid">
                                {(['plex', 'jellyfin', 'emby'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`chip-button ${form.media_server_type === type ? 'active' : ''}`}
                                        onClick={() => update('media_server_type', type)}
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
                                    value={form.media_server_url}
                                    onChange={(event) => update('media_server_url', event.target.value)}
                                    placeholder={form.media_server_type === 'plex' ? 'http://192.168.1.100:32400' : 'http://192.168.1.100:8096'}
                                />
                            </label>
                            <label className="field-row">
                                <span>{form.media_server_type === 'plex' ? 'Plex token' : 'API key'}</span>
                                <input
                                    type="password"
                                    value={form.media_server_api_key}
                                    onChange={(event) => update('media_server_api_key', event.target.value)}
                                />
                            </label>
                        </div>

                        {form.media_server_type !== 'plex' && (
                            <label className="field-row">
                                <span>User ID</span>
                                <input
                                    type="text"
                                    value={form.media_server_user_id}
                                    onChange={(event) => update('media_server_user_id', event.target.value)}
                                />
                            </label>
                        )}

                        {discovery.mediaUsers.length > 0 && (
                            <label className="field-row">
                                <span>Discovered users</span>
                                <select value={form.media_server_user_id} onChange={(event) => update('media_server_user_id', event.target.value)}>
                                    <option value="">Select a user</option>
                                    {discovery.mediaUsers.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </SetupDiscoveryStep>
                )}

                {step === 1 && (
                    <SetupDiscoveryStep
                        eyebrow="Step 2"
                        title="Connect Sonarr"
                        description="Test once to discover default profiles and root folders instead of typing them later."
                        discovery={<p>{discoverySummary.sonarr}</p>}
                        footer={
                            <>
                                <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                                <button className="btn btn-ghost" onClick={() => testConnection('sonarr')} disabled={testing || !form.sonarr_url}>
                                    {testing ? 'Testing...' : testResult === true ? 'Connected' : 'Test connection'}
                                </button>
                                <button className="btn btn-primary" onClick={() => { setStep(2); setTestResult(null); }} disabled={!form.sonarr_url || !form.sonarr_api_key}>
                                    Continue
                                </button>
                            </>
                        }
                    >
                        <div className="settings-grid two">
                            <label className="field-row">
                                <span>Sonarr URL</span>
                                <input type="text" value={form.sonarr_url} onChange={(event) => update('sonarr_url', event.target.value)} />
                            </label>
                            <label className="field-row">
                                <span>API key</span>
                                <input type="password" value={form.sonarr_api_key} onChange={(event) => update('sonarr_api_key', event.target.value)} />
                            </label>
                        </div>

                        {discovery.sonarrProfiles.length > 0 && (
                            <label className="field-row">
                                <span>Default quality profile</span>
                                <select value={form.sonarr_quality_profile_id} onChange={(event) => update('sonarr_quality_profile_id', event.target.value)}>
                                    <option value="">Select a profile</option>
                                    {discovery.sonarrProfiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {discovery.sonarrRootFolders.length > 0 && (
                            <label className="field-row">
                                <span>Default root folder</span>
                                <select value={form.sonarr_root_folder} onChange={(event) => update('sonarr_root_folder', event.target.value)}>
                                    <option value="">Select a root folder</option>
                                    {discovery.sonarrRootFolders.map((folder) => (
                                        <option key={folder.id} value={folder.path}>
                                            {folder.path} ({(folder.freeSpace / 1e12).toFixed(2)} TB free)
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </SetupDiscoveryStep>
                )}

                {step === 2 && (
                    <SetupDiscoveryStep
                        eyebrow="Step 3"
                        title="Connect Radarr"
                        description="Pull the default movie profile and storage root now so library adds work on the first try."
                        discovery={<p>{discoverySummary.radarr}</p>}
                        footer={
                            <>
                                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                                <button className="btn btn-ghost" onClick={() => testConnection('radarr')} disabled={testing || !form.radarr_url}>
                                    {testing ? 'Testing...' : testResult === true ? 'Connected' : 'Test connection'}
                                </button>
                                <button className="btn btn-primary" onClick={() => { setStep(3); setTestResult(null); }} disabled={!form.radarr_url || !form.radarr_api_key}>
                                    Continue
                                </button>
                            </>
                        }
                    >
                        <div className="settings-grid two">
                            <label className="field-row">
                                <span>Radarr URL</span>
                                <input type="text" value={form.radarr_url} onChange={(event) => update('radarr_url', event.target.value)} />
                            </label>
                            <label className="field-row">
                                <span>API key</span>
                                <input type="password" value={form.radarr_api_key} onChange={(event) => update('radarr_api_key', event.target.value)} />
                            </label>
                        </div>

                        {discovery.radarrProfiles.length > 0 && (
                            <label className="field-row">
                                <span>Default quality profile</span>
                                <select value={form.radarr_quality_profile_id} onChange={(event) => update('radarr_quality_profile_id', event.target.value)}>
                                    <option value="">Select a profile</option>
                                    {discovery.radarrProfiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {discovery.radarrRootFolders.length > 0 && (
                            <label className="field-row">
                                <span>Default root folder</span>
                                <select value={form.radarr_root_folder} onChange={(event) => update('radarr_root_folder', event.target.value)}>
                                    <option value="">Select a root folder</option>
                                    {discovery.radarrRootFolders.map((folder) => (
                                        <option key={folder.id} value={folder.path}>
                                            {folder.path} ({(folder.freeSpace / 1e12).toFixed(2)} TB free)
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </SetupDiscoveryStep>
                )}

                {step === 3 && (
                    <SetupDiscoveryStep
                        eyebrow="Step 4"
                        title="Optional AI blend"
                        description="Enable AI-assisted ranking now, or skip it and rely on TMDb until you are ready."
                        discovery={<p>TMDb is already configured for the baseline recommendation flow.</p>}
                        footer={
                            <>
                                <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
                                {form.ai_enabled === 'true' && (
                                    <button className="btn btn-ghost" onClick={() => testConnection('ai')} disabled={testing || !form.ai_api_key}>
                                        {testing ? 'Testing...' : testResult === true ? 'Connected' : 'Test connection'}
                                    </button>
                                )}
                                <button className="btn btn-primary" onClick={() => { setStep(4); setTestResult(null); }}>
                                    Review setup
                                </button>
                            </>
                        }
                    >
                        <label className="toggle-card">
                            <div>
                                <strong>Enable AI recommendations</strong>
                                <p>Use OpenAI to blend taste-profile and feedback-aware ranking into the queue.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={form.ai_enabled === 'true'}
                                onChange={(event) => update('ai_enabled', event.target.checked ? 'true' : 'false')}
                            />
                        </label>

                        {form.ai_enabled === 'true' && (
                            <div className="settings-grid two">
                                <label className="field-row">
                                    <span>Provider URL</span>
                                    <input type="text" value={form.ai_provider_url} onChange={(event) => update('ai_provider_url', event.target.value)} />
                                </label>
                                <label className="field-row">
                                    <span>Model</span>
                                    <input type="text" value={form.ai_model} onChange={(event) => update('ai_model', event.target.value)} />
                                </label>
                                <label className="field-row span-2">
                                    <span>API key</span>
                                    <input type="password" value={form.ai_api_key} onChange={(event) => update('ai_api_key', event.target.value)} />
                                </label>
                            </div>
                        )}
                    </SetupDiscoveryStep>
                )}

                {step === 4 && (
                    <SetupDiscoveryStep
                        eyebrow="Final step"
                        title="Review before the first run"
                        description="Confirm the discovered defaults and service wiring before Recomendarr saves the stack."
                        discovery={<p>Everything here will also be editable later from Settings.</p>}
                        footer={
                            <>
                                <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
                                <button className="btn btn-primary btn-lg" onClick={finishSetup} disabled={saving}>
                                    {saving ? 'Finishing...' : 'Finish setup'}
                                </button>
                            </>
                        }
                    >
                        <div className="review-grid">
                            <div className="review-card">
                                <span>Media server</span>
                                <strong>{serverLabel}</strong>
                                <p>{form.media_server_url || 'Not set'}</p>
                                <small>{form.media_server_user_id || 'Default / token-auth user'}</small>
                            </div>
                            <div className="review-card">
                                <span>Sonarr</span>
                                <strong>{form.sonarr_url || 'Not set'}</strong>
                                <p>{form.sonarr_quality_profile_id ? `Profile ${form.sonarr_quality_profile_id}` : 'No profile chosen yet'}</p>
                                <small>{form.sonarr_root_folder || 'No root folder selected'}</small>
                            </div>
                            <div className="review-card">
                                <span>Radarr</span>
                                <strong>{form.radarr_url || 'Not set'}</strong>
                                <p>{form.radarr_quality_profile_id ? `Profile ${form.radarr_quality_profile_id}` : 'No profile chosen yet'}</p>
                                <small>{form.radarr_root_folder || 'No root folder selected'}</small>
                            </div>
                            <div className="review-card">
                                <span>AI blend</span>
                                <strong>{form.ai_enabled === 'true' ? 'Enabled' : 'Skipped for now'}</strong>
                                <p>{form.ai_enabled === 'true' ? form.ai_model : 'TMDb-only recommendations remain available'}</p>
                                <small>{form.ai_enabled === 'true' ? form.ai_provider_url : 'You can enable this later in Settings'}</small>
                            </div>
                        </div>
                    </SetupDiscoveryStep>
                )}
            </div>
        </div>
    );
}
