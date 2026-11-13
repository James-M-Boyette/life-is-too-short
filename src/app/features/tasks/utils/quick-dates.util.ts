import { addLocalDays, parseLocalDate } from '@/shared/utils/date.util';

export function getQuickDates(today: string) {
    const day = parseLocalDate(today)!.getDay();
    return [
        { label: 'Today', icon: 'pi-calendar', date: today },
        { label: 'Tomorrow', icon: 'pi-sun', date: addLocalDays(today, 1) },
        // Wish we had  pi-coffee ...
        // pi-image
        {
            label: 'This weekend',
            icon: 'pi-cloud',
            date: addLocalDays(today, day === 0 || day === 6 ? 0 : 6 - day),
        },
        {
            label: 'Next week',
            icon: 'pi-calendar-plus',
            date: addLocalDays(today, (8 - day) % 7 || 7),
        },
        { label: 'No date', icon: 'pi-calendar-times', date: null },
    ];
}
