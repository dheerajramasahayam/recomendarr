import { NextResponse } from 'next/server';
import { getMediaTrailer } from '@/lib/tmdb';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get('tmdbId');
    const type = searchParams.get('type') as 'movie' | 'series' | null;

    if (!tmdbId || !type) {
        return NextResponse.json({ error: 'Missing tmdbId or type' }, { status: 400 });
    }

    const key = await getMediaTrailer(parseInt(tmdbId), type);
    return NextResponse.json({ key });
}
