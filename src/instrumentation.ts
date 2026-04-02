import cron from 'node-cron';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runRecommendationEngine, getIsRunning } = await import('./lib/engine');
    const { addLog } = await import('./lib/database');

    if (!(global as any).__cron_registered) {
      (global as any).__cron_registered = true;
      
      // Run automatically 3 times a day (Midnight, 8 AM, 4 PM)
      cron.schedule('0 0,8,16 * * *', async () => {
        if (!getIsRunning()) {
          addLog({ level: 'INFO', message: 'Automated Schedule: Starting recommendation engine (runs 3x a day)', source: 'system' });
          await runRecommendationEngine();
        } else {
          addLog({ level: 'WARN', message: 'Automated Schedule skipped: Engine is already running', source: 'system' });
        }
      });
      console.log('✅ Registered recommendation engine cron job (3 times a day at hours 0, 8, 16).');
    }
  }
}
