import { NextRequest, NextResponse } from 'next/server';
import { getSonarrQualityProfiles, getSonarrRootFolders } from '@/lib/sonarr';
import { getRadarrQualityProfiles, getRadarrRootFolders } from '@/lib/radarr';

// GET /api/arr-options?type=movie|series
// Returns quality profiles and root folders for the target *arr service
export async function GET(request: NextRequest) {
    const type = request.nextUrl.searchParams.get('type') || 'movie';

    try {
        if (type === 'series') {
            const [profiles, folders] = await Promise.all([
                getSonarrQualityProfiles(),
                getSonarrRootFolders(),
            ]);
            return NextResponse.json({ profiles, folders });
        } else {
            const [profiles, folders] = await Promise.all([
                getRadarrQualityProfiles(),
                getRadarrRootFolders(),
            ]);
            return NextResponse.json({ profiles, folders });
        }
    } catch (err) {
        return NextResponse.json(
            { error: `Failed to fetch options: ${(err as Error).message}` },
            { status: 500 }
        );
    }
}
