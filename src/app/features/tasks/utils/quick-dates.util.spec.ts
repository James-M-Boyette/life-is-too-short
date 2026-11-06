import { describe, expect, it } from 'vitest';
import { getQuickDates } from './quick-dates.util';

describe('local quick dates', () => {
    it.each([
        ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09'],
        ['2026-11-07', '2026-11-08', '2026-11-07', '2026-11-09'],
        ['2026-11-08', '2026-11-09', '2026-11-08', '2026-11-09'],
        ['2026-11-09', '2026-11-10', '2026-11-14', '2026-11-16'],
        ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-04'],
        ['2028-02-28', '2028-02-29', '2028-03-04', '2028-03-06'],
        ['2026-03-07', '2026-03-08', '2026-03-07', '2026-03-09'],
        ['2026-10-31', '2026-11-01', '2026-10-31', '2026-11-02'],
    ])('uses the correct weekend and next Monday from %s', (today, tomorrow, weekend, monday) => {
        expect(getQuickDates(today).map(option => option.date)).toEqual([today, tomorrow, weekend, monday, null]);
    });
});
