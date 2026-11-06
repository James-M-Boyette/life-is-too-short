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
        const editButton = () => fixture.nativeElement.querySelector('.more-actions-btn') as HTMLButtonElement;
        editButton().click();
        fixture.detectChanges();
        (document.querySelector('[role="menuitem"] a') as HTMLElement).click();
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
            .find(button => button.getAttribute('aria-label') === 'Cancel editing description')!;
        cancel.click();
        fixture.detectChanges();
        expect(changed).not.toHaveBeenCalled();
        editButton().click();
        fixture.detectChanges();
        (document.querySelector('[role="menuitem"] a') as HTMLElement).click();
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
            .find(button => button.getAttribute('aria-label') === 'Clear draft; save to apply')!;
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


describe('TaskRowComponent More actions', () => {
    async function setup(description: string | null = null) {
        TestBed.configureTestingModule({ providers: [
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'menu-task', title: 'Read a book', description, project_id: null, planned_date: null, due_date: null,
        } as Task);
        fixture.detectChanges();
        const trigger = fixture.nativeElement.querySelector('[aria-label="More actions for Read a book"]') as HTMLButtonElement;
        return { fixture, trigger };
    }

    it('opens by keyboard, activates Add with Enter, and returns focus after Escape cancels editing', async () => {
        const { fixture, trigger } = await setup();
        const changed = vi.fn();
        fixture.componentInstance.editDescription.subscribe(changed);
        trigger.focus();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        const menu = document.querySelector('[role="menu"]') as HTMLElement;
        expect(menu.textContent).toContain('Add description');
        expect(menu.textContent).toContain('Delete task');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        const textarea = fixture.nativeElement.querySelector('textarea');
        expect(document.activeElement).toBe(textarea);
        for (const label of ['Save description', 'Cancel editing description', 'Clear draft; save to apply']) {
            expect(fixture.nativeElement.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
        }
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(changed).not.toHaveBeenCalled();
    });

    it('opens with a click, emits Delete once, dismisses with Escape and honors disabled state', async () => {
        const { fixture, trigger } = await setup('Existing');
        const removed = vi.fn();
        fixture.componentInstance.remove.subscribe(removed);
        trigger.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        const items = document.querySelectorAll('[role="menuitem"] a');
        expect(items[0].textContent).toContain('Edit description');
        (items[1] as HTMLElement).click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(removed).toHaveBeenCalledExactlyOnceWith('menu-task');
        expect(document.activeElement).toBe(trigger);
        trigger.click();
        fixture.detectChanges();
        await fixture.whenStable();
        document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
        expect(removed).toHaveBeenCalledTimes(1);
        fixture.componentRef.setInput('disabled', true);
        fixture.detectChanges();
        trigger.click();
        fixture.detectChanges();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
});
