import { NextResponse } from 'next/server';
import { getRecommendations, updateRecommendationStatus, getRecommendationCounts } from '@/lib/database';
import { approveAndAdd } from '@/lib/engine';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || undefined;
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const countsOnly = searchParams.get('counts') === 'true';

        if (countsOnly) {
            const counts = getRecommendationCounts();
            return NextResponse.json(counts);
        }

        const recommendations = getRecommendations(status, limit, offset);
        const counts = getRecommendationCounts();
        return NextResponse.json({ recommendations, counts });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, action } = body;

        if (!id || !action) {
            return NextResponse.json({ error: 'id and action required' }, { status: 400 });
        }

        if (action === 'approve') {
            const options = {
                qualityProfileId: body.qualityProfileId,
                rootFolderPath: body.rootFolderPath,
                searchForContent: body.searchForContent,
            };
            const result = await approveAndAdd(id, options);
            return NextResponse.json(result);
        } else if (action === 'reject') {
            updateRecommendationStatus(id, 'rejected');
            return NextResponse.json({ success: true, message: 'Recommendation rejected' });
        } else if (action === 'pending') {
            updateRecommendationStatus(id, 'pending');
            return NextResponse.json({ success: true, message: 'Recommendation reset to pending' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
