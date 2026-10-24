import { Injectable, OnDestroy, signal } from '@angular/core';
import { getLocalDateString } from '@/shared/utils/date.util';

@Injectable({ providedIn: 'root' })
export class CalendarClockService implements OnDestroy {
    private readonly _today = signal(getLocalDateString());

    readonly today = this._today.asReadonly();

    private midnightTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.scheduleNextMidnight();

        // Also correct the date when a laptop wakes from sleep
        // or the user returns to the browser tab.
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('focus', this.refreshToday);
    }

    private readonly refreshToday = (): void => {
        this._today.set(getLocalDateString());
        this.scheduleNextMidnight();
    };

    private readonly handleVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') {
            this.refreshToday();
        }
    };

    private scheduleNextMidnight(): void {
        if (this.midnightTimer !== null) {
            clearTimeout(this.midnightTimer);
        }

        const now = new Date();

        const nextMidnight = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
        );

        const millisecondsUntilMidnight =
            nextMidnight.getTime() - now.getTime();

        this.midnightTimer = setTimeout(
            this.refreshToday,
            millisecondsUntilMidnight + 100,
        );
    }

    ngOnDestroy(): void {
        if (this.midnightTimer !== null) {
            clearTimeout(this.midnightTimer);
        }

        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('focus', this.refreshToday);
    }
}
