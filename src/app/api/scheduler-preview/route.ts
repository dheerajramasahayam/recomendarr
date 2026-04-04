import { NextRequest, NextResponse } from 'next/server';
import cron from 'node-cron';

export async function GET(request: NextRequest) {
    const cronSchedule = request.nextUrl.searchParams.get('cron') || '';
    const enabled = request.nextUrl.searchParams.get('enabled') !== 'false';

    if (!enabled) {
        return NextResponse.json({ enabled: false, valid: true, nextRun: null });
    }

    if (!cron.validate(cronSchedule)) {
        return NextResponse.json({ enabled: true, valid: false, nextRun: null });
    }

    const previewTask = cron.schedule(cronSchedule, () => undefined);

    try {
        return NextResponse.json({
            enabled: true,
            valid: true,
            nextRun: previewTask.getNextRun()?.toISOString() || null,
        });
    } finally {
        previewTask.stop();
        if ('destroy' in previewTask && typeof previewTask.destroy === 'function') {
            previewTask.destroy();
        }
    }
}
