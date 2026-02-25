import { NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/database';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const level = searchParams.get('level') || undefined;
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const logs = getLogs(level, limit, offset);
        return NextResponse.json({ logs });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        clearLogs();
        return NextResponse.json({ success: true, message: 'Logs cleared' });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
