import type { Dispatch, SetStateAction } from 'react';
import type { SettingsFormData } from './models';
import { SCHEDULE_PRESETS } from './models';
import { HealthBadge } from './health-badge';
import { formatDateTime, formatRelativeDate } from './utils';

interface SchedulerPreview {
    nextRun: string | null;
    valid: boolean;
}

interface AutomationPanelProps {
    formData: SettingsFormData;
    updateField: <K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) => void;
    schedulePreset: string;
    setSchedulePreset: Dispatch<SetStateAction<string>>;
    savedNextRun: string | null;
    schedulerPreview: SchedulerPreview | null;
}

export function AutomationPanel({
    formData,
    updateField,
    schedulePreset,
    setSchedulePreset,
    savedNextRun,
    schedulerPreview,
}: AutomationPanelProps) {
    const previewNextRun = schedulerPreview?.nextRun ?? savedNextRun;
    const previewValid = schedulerPreview?.valid ?? true;
    const automationEnabled = formData.scheduler_enabled === 'true';

    return (
        <div className="settings-stack">
            <section className="settings-card">
                <div className="section-heading">
                    <div>
                        <p className="section-kicker">Automation Control Center</p>
                        <h3>Scheduler and Auto-Add</h3>
                    </div>
                    <div className="section-health-row">
                        <HealthBadge label={automationEnabled ? 'Scheduler enabled' : 'Manual only'} status={automationEnabled ? 'healthy' : 'neutral'} />
                        <HealthBadge label={formData.auto_add === 'true' ? 'Auto-add on' : 'Review required'} status={formData.auto_add === 'true' ? 'warning' : 'neutral'} />
                    </div>
                </div>

                <label className="toggle-card">
                    <div>
                        <strong>Automatic runs</strong>
                        <p>Let the scheduler launch recommendation runs without a manual click.</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={automationEnabled}
                        onChange={(event) => updateField('scheduler_enabled', event.target.checked ? 'true' : 'false')}
                    />
                </label>

                <div className="settings-grid two">
                    <div className="settings-metric-card">
                        <span>Next run</span>
                        <strong>{previewNextRun ? formatDateTime(previewNextRun) : 'Disabled'}</strong>
                        <small>{previewNextRun ? formatRelativeDate(previewNextRun) : 'Automation is currently off'}</small>
                    </div>
                    <div className="settings-metric-card">
                        <span>Schedule state</span>
                        <strong>{previewValid ? 'Valid schedule' : 'Fix cron expression'}</strong>
                        <small>{automationEnabled ? formData.cron_schedule : 'Manual execution only'}</small>
                    </div>
                </div>

                {automationEnabled && (
                    <>
                        <div className="field-row">
                            <label>Schedule presets</label>
                            <div className="chip-grid">
                                {SCHEDULE_PRESETS.map((preset) => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        className={`chip-button ${formData.cron_schedule === preset.value ? 'active' : ''}`}
                                        onClick={() => {
                                            setSchedulePreset(preset.value);
                                            updateField('cron_schedule', preset.value);
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className={`chip-button ${schedulePreset === 'custom' ? 'active' : ''}`}
                                    onClick={() => setSchedulePreset('custom')}
                                >
                                    Custom cron
                                </button>
                            </div>
                        </div>

                        {schedulePreset === 'custom' && (
                            <label className="field-row">
                                <span>Cron schedule</span>
                                <input
                                    type="text"
                                    value={formData.cron_schedule}
                                    onChange={(event) => updateField('cron_schedule', event.target.value)}
                                    placeholder="0 8,20 * * *"
                                />
                            </label>
                        )}
                    </>
                )}
            </section>

            <section className="settings-card">
                <div className="section-heading">
                    <div>
                        <p className="section-kicker">Run Limits</p>
                        <h3>Recommendation throughput</h3>
                    </div>
                </div>

                <div className="settings-grid two">
                    <label className="field-row">
                        <span>Max recommendations per run</span>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.max_recommendations}
                            onChange={(event) => updateField('max_recommendations', event.target.value)}
                        />
                    </label>

                    <label className="field-row">
                        <span>Watch history depth</span>
                        <input
                            type="number"
                            min="5"
                            max="500"
                            value={formData.watch_history_limit}
                            onChange={(event) => updateField('watch_history_limit', event.target.value)}
                        />
                    </label>
                </div>

                <label className="toggle-card">
                    <div>
                        <strong>Auto-add approved recommendations</strong>
                        <p>Send newly generated recommendations straight into Sonarr/Radarr without manual triage.</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={formData.auto_add === 'true'}
                        onChange={(event) => updateField('auto_add', event.target.checked ? 'true' : 'false')}
                    />
                </label>
            </section>
        </div>
    );
}
