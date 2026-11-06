import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DatePicker } from 'primeng/datepicker';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@/features/tasks/models/tasks.model';
import { TaskSchedulerComponent } from './task-scheduler.component';

async function setup() {
    const fixture = TestBed.createComponent(TaskSchedulerComponent);
    const task = { id: 'task', planned_date: null, due_date: '2026-11-12' } as Task;
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('persistedTask', task);
    fixture.componentRef.setInput('today', '2026-11-05');
    const selected = vi.fn();
    fixture.componentInstance.selectDate.subscribe(selected);
    fixture.detectChanges();
    await fixture.whenStable();
    const button = (label: string) => Array.from(fixture.nativeElement.querySelectorAll('button, [role="button"]') as NodeListOf<HTMLElement>)
        .find(el => el.textContent?.trim() === label || el.getAttribute('aria-label')?.startsWith(label + ' —'))!;
    return { fixture, selected, button };
}

describe('TaskSchedulerComponent', () => {
    it.each([
        ['Today', '2026-11-05'], ['Tomorrow', '2026-11-06'],
        ['This weekend', '2026-11-07'], ['Next week', '2026-11-09'], ['No date', null],
    ])('%s emits only the active field', async (label, date) => {
        const { fixture, selected, button } = await setup();
        expect(selected).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelectorAll('.quick-date')).toHaveLength(5);
        button(label!).click();
        expect(selected).toHaveBeenLastCalledWith({ field: 'planned_date', date });
        button('Due').click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(selected).toHaveBeenCalledTimes(1);
        button(label!).click();
        expect(selected).toHaveBeenLastCalledWith({ field: 'due_date', date });
        expect(fixture.nativeElement.querySelector('.current-date').textContent).toContain('Nov 12, 2026');
    });

    it('keeps suggestions unselected and does not commit on opening, Enter on the container, or Escape', async () => {
        const { fixture, selected } = await setup();
        expect(fixture.nativeElement.querySelector('.current-date').textContent).toContain('None');
        const dismissed = vi.fn();
        fixture.componentInstance.dismiss.subscribe(dismissed);
        const section = fixture.nativeElement.querySelector('section');
        section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(selected).not.toHaveBeenCalled();
        expect(dismissed).toHaveBeenCalledTimes(1);
        expect(fixture.nativeElement.querySelector('input')).toBeNull();
    });

    it('calendar pointer and keyboard selections commit once while navigation does not save', async () => {
        const { fixture, selected, button } = await setup();
        button('Due').click();
        fixture.detectChanges();
        const calendar = fixture.debugElement.query(By.directive(DatePicker));
        const cell = calendar.nativeElement.querySelector('span[data-date="2026-10-15"]') ??
            Array.from(calendar.nativeElement.querySelectorAll('td span[data-date]') as NodeListOf<HTMLElement>)
                .find(el => el.textContent?.trim() === '15')!;
        expect(cell).toBeTruthy();
        cell.click();
        expect(selected).toHaveBeenCalledExactlyOnceWith({ field: 'due_date', date: '2026-11-15' });
        selected.mockClear();
        cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, which: 39, bubbles: true }));
        expect(selected).not.toHaveBeenCalled();
        cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        expect(selected).toHaveBeenCalledExactlyOnceWith({ field: 'due_date', date: '2026-11-15' });
    });

    it('blocks submissions while pending and exposes errors with a retry action', async () => {
        const { fixture, selected, button } = await setup();
        fixture.componentRef.setInput('pending', true);
        fixture.detectChanges();
        button('Today').click();
        expect(selected).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain('Saving date');
        fixture.componentRef.setInput('pending', false);
        fixture.componentRef.setInput('error', 'Could not save');
        fixture.detectChanges();
        const retry = vi.fn();
        fixture.componentInstance.retry.subscribe(retry);
        button('Retry').click();
        expect(retry).toHaveBeenCalledTimes(1);
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not save');
    });
});
