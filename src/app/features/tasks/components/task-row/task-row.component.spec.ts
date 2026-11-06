import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { formatLocalDate } from '@/shared/utils/date.util';
import type { Task } from '@/features/tasks/models/tasks.model';
import { TaskRowComponent } from './task-row.component';

describe('TaskRowComponent planned date default', () => {
    it('defaults only the picker to today without saving, and allows another date or clearing', () => {
        TestBed.configureTestingModule({ providers: [
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        const row = fixture.componentInstance;
        fixture.componentRef.setInput('task', { id: 'old', planned_date: '2026-10-31' } as Task);
        const changed = vi.fn();
        row.plannedDateChange.subscribe(changed);
        expect(formatLocalDate(row['plannedDateForPicker']())).toBe('2026-10-31');
        fixture.componentRef.setInput('defaultPlannedDateToToday', true);
        expect(formatLocalDate(row['plannedDateForPicker']())).toBe('2026-11-05');
        expect(formatLocalDate(row['plannedDate']())).toBe('2026-10-31');
        expect(changed).not.toHaveBeenCalled();
        row['onPlannedDateChange'](new Date(2026, 10, 12));
        expect(changed).toHaveBeenLastCalledWith({ task: row.task(), plannedDate: '2026-11-12' });
        row['onPlannedDateChange'](null);
        expect(changed).toHaveBeenLastCalledWith({ task: row.task(), plannedDate: null });
    });
});
