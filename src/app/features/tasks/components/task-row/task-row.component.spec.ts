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

describe('TaskRowComponent description editing', () => {
    async function setup(description: string | null) {
        TestBed.configureTestingModule({ providers: [
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'description-task', title: 'Task', project_id: null, planned_date: null, due_date: null, description,
        } as Task);
        fixture.detectChanges();
        const changed = vi.fn();
        fixture.componentInstance.editDescription.subscribe(changed);
        const editButton = () => fixture.nativeElement.querySelector('.description-edit-button') as HTMLButtonElement;
        editButton().click();
        fixture.detectChanges();
        await fixture.whenStable();
        return { fixture, changed, editButton };
    }

    function type(fixture: ReturnType<typeof TestBed.createComponent<TaskRowComponent>>, source: string) {
        const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
        textarea.value = source;
        textarea.dispatchEvent(new Event('input'));
        return textarea;
    }

    function submit(fixture: ReturnType<typeof TestBed.createComponent<TaskRowComponent>>) {
        fixture.nativeElement.querySelector('.edit-description-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }

    it('adds Markdown from an empty description and closes only after a confirmed save', async () => {
        const { fixture, changed, editButton } = await setup(null);
        const textarea = type(fixture, '- First\n- **Second**');
        expect(document.activeElement).toBe(textarea);
        submit(fixture);
        expect(changed).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), description: '- First\n- **Second**' });
        expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
        fixture.componentRef.setInput('descriptionFeedback', { attemptId: 1, pending: true, error: null });
        fixture.detectChanges();
        submit(fixture);
        expect(changed).toHaveBeenCalledTimes(1);
        fixture.componentRef.setInput('task', { ...fixture.componentInstance.task(), description: '- First\n- **Second**' });
        fixture.componentRef.setInput('descriptionFeedback', { attemptId: 1, pending: false, error: null });
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(fixture.nativeElement.querySelectorAll('.markdown-content li')).toHaveLength(2);
        expect(document.activeElement).toBe(editButton());
    });

    it('loads the original source unchanged, cancels edits, and avoids an unchanged write', async () => {
        const source = '    indented code\n\n**Existing**  \n';
        const { fixture, changed, editButton } = await setup(source);
        expect(fixture.nativeElement.querySelector('textarea').value).toBe(source);
        type(fixture, 'discard me');
        const cancel = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
            .find(button => button.textContent?.trim() === 'Cancel')!;
        cancel.click();
        fixture.detectChanges();
        expect(changed).not.toHaveBeenCalled();
        editButton().click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea').value).toBe(source);
        submit(fixture);
        fixture.detectChanges();
        expect(changed).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    });

    it('clears only on Save and keeps failed drafts editable for retry', async () => {
        const { fixture, changed } = await setup('**Existing**');
        const clear = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
            .find(button => button.textContent?.trim() === 'Clear description')!;
        clear.click();
        fixture.detectChanges();
        expect(changed).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('textarea').value).toBe('');
        submit(fixture);
        expect(changed).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), description: null });
        fixture.componentRef.setInput('descriptionFeedback', { attemptId: 1, pending: false, error: 'Could not save' });
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not save');
        expect(fixture.nativeElement.querySelector('textarea').value).toBe('');
        type(fixture, '*Retry draft*');
        submit(fixture);
        expect(changed).toHaveBeenLastCalledWith({ task: fixture.componentInstance.task(), description: '*Retry draft*' });
    });
});
