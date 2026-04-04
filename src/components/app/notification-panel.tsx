import type { ConnectionResult, SettingsFormData } from './models';
import { HealthBadge } from './health-badge';

interface NotificationPanelProps {
    formData: SettingsFormData;
    updateField: <K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) => void;
    connResults: Record<string, ConnectionResult>;
    onTestChannel: (channel: 'discord' | 'telegram') => void;
}

function channelStatus(enabled: boolean, configured: boolean) {
    if (!enabled) return { label: 'Disabled', status: 'neutral' as const };
    if (!configured) return { label: 'Needs config', status: 'warning' as const };
    return { label: 'Ready', status: 'healthy' as const };
}

export function NotificationPanel({
    formData,
    updateField,
    connResults,
    onTestChannel,
}: NotificationPanelProps) {
    const discordState = channelStatus(formData.discord_enabled === 'true', Boolean(formData.discord_webhook_url));
    const telegramState = channelStatus(
        formData.telegram_enabled === 'true',
        Boolean(formData.telegram_bot_token && formData.telegram_chat_id)
    );

    return (
        <div className="settings-stack">
            <section className="settings-card">
                <div className="section-heading">
                    <div>
                        <p className="section-kicker">Delivery Channels</p>
                        <h3>Discord and Telegram</h3>
                    </div>
                    <div className="section-health-row">
                        <HealthBadge label={`Discord ${discordState.label}`} status={discordState.status} />
                        <HealthBadge label={`Telegram ${telegramState.label}`} status={telegramState.status} />
                    </div>
                </div>

                <div className="settings-grid two">
                    <article className="channel-card">
                        <div className="channel-card-header">
                            <div>
                                <h4>Discord</h4>
                                <p>Send run summaries to a webhook-enabled channel.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.discord_enabled === 'true'}
                                onChange={(event) => updateField('discord_enabled', event.target.checked ? 'true' : 'false')}
                            />
                        </div>
                        <label className="field-row">
                            <span>Webhook URL</span>
                            <input
                                type="password"
                                value={formData.discord_webhook_url}
                                onChange={(event) => updateField('discord_webhook_url', event.target.value)}
                                placeholder="https://discord.com/api/webhooks/..."
                            />
                        </label>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => onTestChannel('discord')}
                            disabled={connResults.discord?.testing}
                        >
                            {connResults.discord?.testing ? (
                                <>
                                    <span className="spinner" />
                                    Sending...
                                </>
                            ) : (
                                'Send test'
                            )}
                        </button>
                    </article>

                    <article className="channel-card">
                        <div className="channel-card-header">
                            <div>
                                <h4>Telegram</h4>
                                <p>Use a bot token and chat ID for run and error updates.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.telegram_enabled === 'true'}
                                onChange={(event) => updateField('telegram_enabled', event.target.checked ? 'true' : 'false')}
                            />
                        </div>
                        <label className="field-row">
                            <span>Bot token</span>
                            <input
                                type="password"
                                value={formData.telegram_bot_token}
                                onChange={(event) => updateField('telegram_bot_token', event.target.value)}
                                placeholder="123456:ABC..."
                            />
                        </label>
                        <label className="field-row">
                            <span>Chat ID</span>
                            <input
                                type="text"
                                value={formData.telegram_chat_id}
                                onChange={(event) => updateField('telegram_chat_id', event.target.value)}
                                placeholder="-1001234567890"
                            />
                        </label>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => onTestChannel('telegram')}
                            disabled={connResults.telegram?.testing}
                        >
                            {connResults.telegram?.testing ? (
                                <>
                                    <span className="spinner" />
                                    Sending...
                                </>
                            ) : (
                                'Send test'
                            )}
                        </button>
                    </article>
                </div>
            </section>

            <section className="settings-card">
                <div className="section-heading">
                    <div>
                        <p className="section-kicker">Event Routing</p>
                        <h3>Choose what gets sent</h3>
                    </div>
                </div>

                <div className="settings-grid three">
                    <label className="toggle-card compact">
                        <div>
                            <strong>Run complete</strong>
                            <p>Always send a completion summary.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={formData.notify_on_run_complete === 'true'}
                            onChange={(event) => updateField('notify_on_run_complete', event.target.checked ? 'true' : 'false')}
                        />
                    </label>

                    <label className="toggle-card compact">
                        <div>
                            <strong>New recommendations</strong>
                            <p>Only notify when fresh titles were created.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={formData.notify_on_new_recommendations === 'true'}
                            onChange={(event) => updateField('notify_on_new_recommendations', event.target.checked ? 'true' : 'false')}
                        />
                    </label>

                    <label className="toggle-card compact">
                        <div>
                            <strong>Errors</strong>
                            <p>Push failures and delivery problems.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={formData.notify_on_errors === 'true'}
                            onChange={(event) => updateField('notify_on_errors', event.target.checked ? 'true' : 'false')}
                        />
                    </label>
                </div>
            </section>
        </div>
    );
}
