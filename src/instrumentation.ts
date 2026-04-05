export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  const { ensureSchedulerWatcher, syncRecommendationScheduler } = await import('./lib/scheduler');
  syncRecommendationScheduler();
  ensureSchedulerWatcher();
}
