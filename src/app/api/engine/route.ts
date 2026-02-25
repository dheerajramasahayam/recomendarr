import { NextResponse } from 'next/server';
import { runRecommendationEngine, getIsRunning } from '@/lib/engine';

export async function POST() {
    try {
        if (getIsRunning()) {
            return NextResponse.json({ error: 'Engine is already running' }, { status: 409 });
        }

        const result = await runRecommendationEngine();
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ running: getIsRunning() });
}
