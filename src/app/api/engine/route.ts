import { NextResponse } from 'next/server';
import { runRecommendationEngine, getIsRunning } from '@/lib/engine';
import type { EngineFilters } from '@/lib/engine';

export async function POST(request: Request) {
    try {
        if (getIsRunning()) {
            return NextResponse.json({ error: 'Engine is already running' }, { status: 409 });
        }

        // Parse optional filters from request body
        let filters: EngineFilters | undefined;
        try {
            const body = await request.json();
            if (body.filters) {
                filters = body.filters;
            }
        } catch {
            // No body or invalid JSON — run without filters
        }

        const result = await runRecommendationEngine(filters);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ running: getIsRunning() });
}
