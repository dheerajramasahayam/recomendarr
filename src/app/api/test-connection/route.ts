import { NextResponse } from 'next/server';
import { createMediaServerConnector } from '@/lib/media-server';
import { testSonarrConnection, getSonarrQualityProfiles, getSonarrRootFolders } from '@/lib/sonarr';
import { testRadarrConnection, getRadarrQualityProfiles, getRadarrRootFolders } from '@/lib/radarr';
import { testAiConnection } from '@/lib/ai-recommender';
import { getConfigWithOverrides } from '@/lib/config';
import { sendTestNotification } from '@/lib/notifications';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { service, settings } = body;
        const config = getConfigWithOverrides(settings || {});

        switch (service) {
            case 'mediaServer': {
                const connector = createMediaServerConnector(config.mediaServer);
                const connected = await connector.testConnection();
                let users: { id: string; name: string }[] = [];
                if (connected) {
                    try { users = await connector.getUsers(); } catch { /* ignore */ }
                }
                return NextResponse.json({ success: connected, users, type: config.mediaServer.type });
            }

            case 'sonarr': {
                const connected = await testSonarrConnection(config.sonarr);
                let profiles: { id: number; name: string }[] = [];
                let rootFolders: { id: number; path: string }[] = [];
                if (connected) {
                    try {
                        profiles = await getSonarrQualityProfiles(config.sonarr);
                        rootFolders = await getSonarrRootFolders(config.sonarr);
                    } catch { /* ignore */ }
                }
                return NextResponse.json({ success: connected, profiles, rootFolders });
            }

            case 'radarr': {
                const connected = await testRadarrConnection(config.radarr);
                let profiles: { id: number; name: string }[] = [];
                let rootFolders: { id: number; path: string }[] = [];
                if (connected) {
                    try {
                        profiles = await getRadarrQualityProfiles(config.radarr);
                        rootFolders = await getRadarrRootFolders(config.radarr);
                    } catch { /* ignore */ }
                }
                return NextResponse.json({ success: connected, profiles, rootFolders });
            }

            case 'ai': {
                const connected = await testAiConnection(config.ai);
                return NextResponse.json({ success: connected, model: config.ai.model });
            }

            case 'tmdb': {
                // Simple check — try fetching a known movie
                try {
                    const axios = (await import('axios')).default;
                    const res = await axios.get(`${config.tmdb.baseUrl}/movie/550`, {
                        params: { api_key: config.tmdb.apiKey },
                    });
                    return NextResponse.json({ success: true, movieTitle: res.data.title });
                } catch {
                    return NextResponse.json({ success: false });
                }
            }

            case 'discord': {
                await sendTestNotification('discord', settings || {});
                return NextResponse.json({ success: true });
            }

            case 'telegram': {
                await sendTestNotification('telegram', settings || {});
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: 'Unknown service' }, { status: 400 });
        }
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
