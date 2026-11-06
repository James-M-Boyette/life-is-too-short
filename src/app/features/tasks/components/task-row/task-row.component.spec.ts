import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import type { Task } from '@/features/tasks/models/tasks.model';
import { TaskRowComponent } from './task-row.component';

describe('TaskRowComponent schedule request', () => {
    it('opens scheduling through an event while displaying only stored dates', () => {
        TestBed.configureTestingModule({ providers: [
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'old', title: 'Task', project_id: null, planned_date: null, due_date: '2026-11-12',
        } as Task);
        const requested = vi.fn();
        fixture.componentInstance.scheduleRequested.subscribe(requested);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Planned:');
        expect(fixture.nativeElement.textContent).toContain('Due: Nov 12');
        const trigger = fixture.nativeElement.querySelector('[aria-label="Schedule task"]');
        trigger.click();
        expect(requested).toHaveBeenCalledTimes(1);
        expect(requested.mock.calls[0][0]).toMatchObject({ taskId: 'old', anchor: trigger });
        expect(fixture.nativeElement.querySelector('p-popover')).toBeNull();
        fixture.componentRef.setInput('disabled', true);
        fixture.detectChanges();
        trigger.click();
        expect(requested).toHaveBeenCalledTimes(1);
    });
});
