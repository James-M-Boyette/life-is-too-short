import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { formatLocalDate } from '@/shared/utils/date.util';
import type { Task } from '@/features/tasks/models/tasks.model';
import { TaskRowComponent } from './task-row.component';
import { By } from '@angular/platform-browser';
import { Popover } from 'primeng/popover';

describe('TaskRowComponent planned date default', () => {
    function setup() {
        TestBed.configureTestingModule({ providers: [
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'old', title: 'Task', project_id: null, planned_date: '2026-10-31', due_date: null,
        } as Task);
        return fixture;
    }

    it('saves the default date with Enter from the open popover and closes it', async () => {
        const fixture = setup();
        fixture.componentRef.setInput('defaultPlannedDateToToday', true);
        const planned = vi.fn();
        const due = vi.fn();
        fixture.componentInstance.plannedDateChange.subscribe(planned);
        fixture.componentInstance.dueDateChange.subscribe(due);
        fixture.detectChanges();
        const popover = fixture.debugElement.query(By.directive(Popover)).componentInstance as Popover;
        const trigger = fixture.nativeElement.querySelector('button');
        popover.show(new MouseEvent('click'), trigger);
        fixture.detectChanges();
        await fixture.whenStable();
        const content = fixture.nativeElement.querySelector('.schedule-popover') ?? document.querySelector('.schedule-popover');
        expect(content).toBeTruthy();
        content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(planned).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), plannedDate: '2026-11-05' });
        expect(due).not.toHaveBeenCalled();
        expect(popover.overlayVisible).toBe(false);
    });

    it('commits changed planned and due dates, including clearing, without redundant writes', () => {
        const fixture = setup();
        const row = fixture.componentInstance;
        const planned = vi.fn();
        const due = vi.fn();
        row.plannedDateChange.subscribe(planned);
        row.dueDateChange.subscribe(due);
        const enter = () => new KeyboardEvent('keydown', { key: 'Enter' });
        expect(row['commitSchedule'](enter(), new Date(2026, 9, 31), null)).toBe(true);
        expect(planned).not.toHaveBeenCalled();
        expect(due).not.toHaveBeenCalled();
        row['commitSchedule'](enter(), null, new Date(2026, 10, 12));
        expect(planned).toHaveBeenCalledExactlyOnceWith({ task: row.task(), plannedDate: null });
        expect(due).toHaveBeenCalledExactlyOnceWith({ task: row.task(), dueDate: '2026-11-12' });
        fixture.componentRef.setInput('disabled', true);
        expect(row['commitSchedule'](enter(), new Date(2026, 10, 5), null)).toBe(false);
        expect(planned).toHaveBeenCalledTimes(1);
        expect(due).toHaveBeenCalledTimes(1);
    });

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
