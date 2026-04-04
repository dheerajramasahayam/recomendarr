import cron, { type ScheduledTask } from 'node-cron';
import { getConfig } from './config';
import { addLog } from './database';
import { getIsRunning, runRecommendationEngine } from './engine';

interface SchedulerState {
    task: ScheduledTask | null;
    signature: string | null;
    watcher: NodeJS.Timeout | null;
}

export interface SchedulerSnapshot {
    enabled: boolean;
    cronSchedule: string;
    autoAdd: boolean;
    nextRun: string | null;
    active: boolean;
}

function getSchedulerState(): SchedulerState {
    const globalState = globalThis as typeof globalThis & {
        __recomendarrScheduler?: SchedulerState;
    };

    if (!globalState.__recomendarrScheduler) {
        globalState.__recomendarrScheduler = {
            task: null,
            signature: null,
            watcher: null,
        };
    }

    return globalState.__recomendarrScheduler;
}

function stopTask(task: ScheduledTask | null) {
    if (!task) return;
    task.stop();
    if ('destroy' in task && typeof task.destroy === 'function') {
        task.destroy();
    }
}

export function syncRecommendationScheduler() {
    const state = getSchedulerState();
    const scheduler = getConfig().scheduler;
    const signature = `${scheduler.enabled}:${scheduler.cronSchedule}`;

    if (state.signature === signature) {
        return;
    }

    stopTask(state.task);
    state.task = null;
    state.signature = signature;

    if (!scheduler.enabled) {
        addLog({ level: 'INFO', message: 'Scheduler disabled from settings', source: 'scheduler' });
        return;
    }

    if (!cron.validate(scheduler.cronSchedule)) {
        addLog({ level: 'ERROR', message: `Invalid scheduler cron expression: ${scheduler.cronSchedule}`, source: 'scheduler' });
        return;
    }

    state.task = cron.schedule(scheduler.cronSchedule, async () => {
        if (getIsRunning()) {
            addLog({ level: 'WARN', message: 'Automated schedule skipped because engine is already running', source: 'scheduler' });
            return;
        }

        addLog({ level: 'INFO', message: 'Automated schedule triggered recommendation engine', source: 'scheduler' });
        await runRecommendationEngine(undefined, 'scheduled');
    });

    addLog({ level: 'INFO', message: `Scheduler registered with cron ${scheduler.cronSchedule}`, source: 'scheduler' });
}

export function ensureSchedulerWatcher() {
    const state = getSchedulerState();
    if (state.watcher) {
        return;
    }

    state.watcher = setInterval(() => {
        try {
            syncRecommendationScheduler();
        } catch (err) {
            addLog({ level: 'WARN', message: `Scheduler sync failed: ${(err as Error).message}`, source: 'scheduler' });
        }
    }, 30000);
}

function computeNextRunFromSchedule(cronSchedule: string): string | null {
    if (!cron.validate(cronSchedule)) {
        return null;
    }

    const previewTask = cron.schedule(cronSchedule, () => undefined);
    try {
        return previewTask.getNextRun()?.toISOString() || null;
    } finally {
        stopTask(previewTask);
    }
}

export function getSchedulerSnapshot(): SchedulerSnapshot {
    const scheduler = getConfig().scheduler;
    const state = getSchedulerState();
    const signature = `${scheduler.enabled}:${scheduler.cronSchedule}`;
    const liveTaskActive = state.signature === signature && Boolean(state.task);

    return {
        enabled: scheduler.enabled,
        cronSchedule: scheduler.cronSchedule,
        autoAdd: scheduler.autoAdd,
        nextRun: scheduler.enabled
            ? (liveTaskActive ? state.task?.getNextRun()?.toISOString() || null : computeNextRunFromSchedule(scheduler.cronSchedule))
            : null,
        active: liveTaskActive,
    };
}
