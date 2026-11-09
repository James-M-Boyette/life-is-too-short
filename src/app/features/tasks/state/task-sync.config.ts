import { InjectionToken } from '@angular/core';
import { environment } from '@/environments/environment';

export type TaskSyncConfig = {
    mode: 'postgres-changes' | 'broadcast' | 'api-only';
    /** Visible/online safety catch-up; 0 disables it explicitly. */
    safetyRefreshMs: number;
};

// Rollout is a deliberate build configuration change, never join-status detection.
export const TASK_SYNC_CONFIG = new InjectionToken<TaskSyncConfig>('TASK_SYNC_CONFIG', {
    providedIn: 'root',
    factory: () => ({ mode: (environment as { taskSyncMode?: TaskSyncConfig['mode'] }).taskSyncMode ?? 'postgres-changes', safetyRefreshMs: 120_000 }),
});
