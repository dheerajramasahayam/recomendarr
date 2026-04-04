export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { ensureSchedulerWatcher, syncRecommendationScheduler } = await import('./lib/scheduler');
  syncRecommendationScheduler();
  ensureSchedulerWatcher();
}
