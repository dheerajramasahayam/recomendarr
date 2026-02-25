import { NextRequest, NextResponse } from 'next/server';
import { getAllSavedSettings, saveSettings, isSetupComplete, getConfig } from '@/lib/config';

// GET /api/settings — returns current config and setup status
export async function GET() {
    try {
        const config = getConfig();
        const savedSettings = getAllSavedSettings();
        const setupComplete = isSetupComplete();

        return NextResponse.json({
            setupComplete,
            config: {
                mediaServer: {
                    type: config.mediaServer.type,
                    url: config.mediaServer.url,
                    apiKey: config.mediaServer.apiKey ? '••••' + config.mediaServer.apiKey.slice(-4) : '',
                    hasApiKey: !!config.mediaServer.apiKey,
                },
                sonarr: {
                    url: config.sonarr.url,
                    apiKey: config.sonarr.apiKey ? '••••' + config.sonarr.apiKey.slice(-4) : '',
                    hasApiKey: !!config.sonarr.apiKey,
                },
                radarr: {
                    url: config.radarr.url,
                    apiKey: config.radarr.apiKey ? '••••' + config.radarr.apiKey.slice(-4) : '',
                    hasApiKey: !!config.radarr.apiKey,
                },
                ai: {
                    enabled: config.ai.enabled,
                    providerUrl: config.ai.providerUrl,
                    apiKey: config.ai.apiKey ? '••••' + config.ai.apiKey.slice(-4) : '',
                    hasApiKey: !!config.ai.apiKey,
                    model: config.ai.model,
                },
            },
            raw: savedSettings,
        });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

// PUT /api/settings — save settings
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { settings } = body;

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ error: 'settings object required' }, { status: 400 });
        }

        // Filter out empty values — don't save blanks
        const filtered: Record<string, string> = {};
        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                filtered[key] = String(value);
            }
        }

        saveSettings(filtered);

        return NextResponse.json({ success: true, saved: Object.keys(filtered).length });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
