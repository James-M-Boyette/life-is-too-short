import { By } from '@angular/platform-browser';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import type { ProjectNode } from '@/features/projects/models/project.model';
import type { Task } from '@/features/tasks/models/tasks.model';
import { TaskRowComponent } from './task-row.component';

describe('TaskRowComponent schedule request', () => {
    it('opens scheduling through an event while displaying only stored dates', () => {
        TestBed.configureTestingModule({ providers: [provideRouter([]),
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

describe('Task card drag preview styling', () => {
    it('keeps the original card layout when CDK clones it outside the row host', () => {
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'preview-task', title: 'Long title '.repeat(30), description: 'Long description '.repeat(80),
            project_id: null, planned_date: '2026-11-05', due_date: '2026-11-04',
        } as Task);
        fixture.detectChanges();
        // The default CDK preview is a deep clone with content attributes, without app-task-row.
        const preview = fixture.nativeElement.querySelector('li.row').cloneNode(true) as HTMLElement;
        preview.classList.add('cdk-drag-preview');
        preview.style.width = '260px';
        document.body.append(preview);
        try {
            const card = getComputedStyle(preview);
            expect(card.display).toBe('flex');
            expect(card.flexDirection).toBe('column');
            expect(card.boxSizing).toBe('border-box');
            expect(card.getPropertyValue('rotate')).toBe('1.5deg');
            expect(card.getPropertyValue('container').replace(/\s/g, '')).toBe('task-card/inline-size');
            expect(preview.querySelectorAll('.date-control')).toHaveLength(2);
            expect(preview.querySelector('.compact-project-link')).toBeTruthy();
            expect(getComputedStyle(preview.querySelector('.task-primary-section')!).display).toBe('flex');
            expect(getComputedStyle(preview.querySelector('.title-btn')!).whiteSpace).toBe('nowrap');
            expect(getComputedStyle(preview.querySelector('.meta')!).display).toBe('flex');
            expect(getComputedStyle(preview.querySelector('app-task-description')!).overflowWrap).toBe('anywhere');
            expect(preview.textContent).toContain('Planned: Nov 5');
            expect(preview.textContent).toContain('Due: Nov 4');
        } finally { preview.remove(); }
    });
});

describe('Card-surface drag initiation', () => {
    function setup() {
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: CalendarClockService, useValue: { today: signal('2026-11-06') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'surface', title: 'Task', description: '**Selectable** [Link](https://example.com)',
            project_id: null, planned_date: '2026-11-06', due_date: '2026-11-05', is_done: false,
        } as Task);
        fixture.componentRef.setInput('draggable', true);
        fixture.detectChanges();
        const root = fixture.nativeElement.querySelector('li.row') as HTMLElement;
        const drag = fixture.debugElement.query(By.directive(CdkDrag)).injector.get(CdkDrag);
        return { fixture, root, drag };
    }

    it('allows surface and wide-handle starts to reach CDK but shields controls and selectable descriptions', () => {
        const { fixture, root, drag } = setup();
        const starts = vi.fn();
        root.addEventListener('mousedown', starts);
        root.addEventListener('touchstart', starts);
        for (const selector of ['.complete-toggle', '.title-btn', '.edit-task-btn', '.schedule-task-btn', '.more-actions-btn',
            '.date-control', '.compact-project-link', 'p-treeselect', '.description-disclosure', '.markdown-content strong', '.markdown-content a', '.compact-description-excerpt']) {
            const target = fixture.nativeElement.querySelector(selector);
            for (const type of ['mousedown', 'touchstart']) {
                const event = new Event(type, { bubbles: true, cancelable: true });
                target.dispatchEvent(event);
                expect(event.defaultPrevented).toBe(false);
            }
        }
        expect(starts).not.toHaveBeenCalled();
        // Deliberately stop at pointer-down: JSDOM cannot establish real threshold/drag/scroll behavior.
        fixture.nativeElement.querySelector('.task-card-content').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        fixture.nativeElement.querySelector('.task-drag-handle').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(starts).toHaveBeenCalledTimes(2);
        expect(drag.disabled).toBe(false);
        const handle = fixture.nativeElement.querySelector('.task-drag-handle');
        expect(handle.tagName).toBe('SPAN');
        expect(handle.getAttribute('aria-hidden')).toBe('true');
        expect(handle.hasAttribute('tabindex')).toBe(false);
        expect(getComputedStyle(root).cursor).toContain('grab');
        expect(drag.dragStartDelay).toEqual({ mouse: 0, touch: 200 });
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    it('preserves normal activation and disables dragging for the existing editor and disabled state', async () => {
        const { fixture, drag } = setup();
        const completed = vi.fn();
        const scheduled = vi.fn();
        fixture.componentInstance.toggleDone.subscribe(completed);
        fixture.componentInstance.scheduleRequested.subscribe(scheduled);
        fixture.nativeElement.querySelector('.complete-toggle').click();
        fixture.nativeElement.querySelector('.schedule-task-btn').click();
        expect(completed).toHaveBeenCalledExactlyOnceWith(fixture.componentInstance.task());
        expect(scheduled).toHaveBeenCalledTimes(1);
        const link = fixture.nativeElement.querySelector('.markdown-content a');
        link.addEventListener('click', (event: Event) => event.preventDefault());
        link.click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        fixture.nativeElement.querySelector('.title-btn').click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(drag.disabled).toBe(true);
        expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
        fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
        fixture.detectChanges();
        fixture.componentRef.setInput('disabled', true);
        fixture.detectChanges();
        expect(drag.disabled).toBe(true);
    });

    it('hides cloned placeholder contents without removing their layout footprint', () => {
        const { root } = setup();
        const placeholder = root.cloneNode(true) as HTMLElement;
        placeholder.classList.add('cdk-drag-placeholder');
        document.body.append(placeholder);
        try {
            expect(getComputedStyle(placeholder).display).toBe('flex');
            expect(getComputedStyle(placeholder).opacity).toBe('1');
            expect(getComputedStyle(placeholder).boxShadow).toBe('none');
            expect(getComputedStyle(placeholder).getPropertyValue('rotate')).not.toBe('1.5deg');
            const content = placeholder.querySelector('.task-card-content')!;
            expect(getComputedStyle(content).visibility).toBe('hidden');
            expect(getComputedStyle(content).display).not.toBe('none');
            expect(content.querySelector('.title-btn')).toBeTruthy();
            expect(content.querySelector('.date-control')).toBeTruthy();
        } finally { placeholder.remove(); }
    });
});

describe('TaskRowComponent content editing', () => {
    async function setup(description: string | null) {
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'description-task', title: 'Task', project_id: null, planned_date: null, due_date: null, description,
        } as Task);
        fixture.detectChanges();
        const changed = vi.fn();
        fixture.componentInstance.contentSaved.subscribe(changed);
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
        fixture.nativeElement.querySelector('button[aria-label="Save task"]').click();
    }

    it('adds Markdown from an empty description and closes only after a confirmed save', async () => {
        const { fixture, changed, editButton } = await setup(null);
        const textarea = type(fixture, '- First\n- **Second**');
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input[aria-label="Task title"]'));
        submit(fixture);
        expect(changed).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), title: 'Task', description: '- First\n- **Second**' });
        expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
        fixture.componentRef.setInput('contentFeedback', { attemptId: 1, pending: true, error: null });
        fixture.detectChanges();
        submit(fixture);
        expect(changed).toHaveBeenCalledTimes(1);
        fixture.componentRef.setInput('task', { ...fixture.componentInstance.task(), description: '- First\n- **Second**' });
        fixture.componentRef.setInput('contentFeedback', { attemptId: 1, pending: false, error: null });
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
            .find(button => button.getAttribute('aria-label') === 'Cancel editing task')!;
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

    it('clicks description text to edit while keeping links and expansion independent', async () => {
        const source = '**Description** ' + 'text '.repeat(70) + '[Example](https://example.com)';
        const { fixture, changed } = await setup(source);
        fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
        fixture.detectChanges();
        const expand = fixture.nativeElement.querySelector('[aria-label="Expand full description"]');
        expand.click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        const link = fixture.nativeElement.querySelector('.markdown-content a');
        link.addEventListener('click', (event: Event) => event.preventDefault());
        link.click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(fixture.nativeElement.querySelector('.markdown-content strong'));
        selection.removeAllRanges();
        selection.addRange(range);
        fixture.nativeElement.querySelector('.markdown-content strong').click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        selection.removeAllRanges();
        fixture.nativeElement.querySelector('.markdown-content strong').click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('textarea').value).toBe(source);
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('textarea'));
        expect(changed).not.toHaveBeenCalled();
        fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
        fixture.componentRef.setInput('disabled', true);
        fixture.detectChanges();
        fixture.nativeElement.querySelector('.description-excerpt').click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    });

    it.each(['title', 'description', 'pencil', 'menu'] as const)('enters one combined editor from %s with correct focus and layout', async entry => {
        const { fixture, changed } = await setup('**Existing**');
        fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
        fixture.detectChanges();
        expect(Array.from(fixture.nativeElement.querySelectorAll('.task-actions button')).map((b: any) => b.getAttribute('aria-label')))
            .toEqual(['Edit task', 'Schedule task', 'More actions for Task']);
        if (entry === 'title') fixture.nativeElement.querySelector('[aria-label="Edit task title"]').click();
        if (entry === 'description') fixture.nativeElement.querySelector('.markdown-content strong').click();
        if (entry === 'pencil') fixture.nativeElement.querySelector('[aria-label="Edit task"]').click();
        if (entry === 'menu') {
            fixture.nativeElement.querySelector('.more-actions-btn').click();
            fixture.detectChanges();
            (document.querySelector('[role="menuitem"] a') as HTMLElement).click();
        }
        fixture.detectChanges();
        await fixture.whenStable();
        const title = fixture.nativeElement.querySelector('input[aria-label="Task title"]');
        const textarea = fixture.nativeElement.querySelector('textarea');
        expect(title.value).toBe('Task');
        expect(textarea.value).toBe('**Existing**');
        expect(document.activeElement).toBe(entry === 'description' ? textarea : title);
        expect(fixture.nativeElement.querySelectorAll('[aria-label="Save task"]')).toHaveLength(1);
        expect(fixture.nativeElement.querySelectorAll('[aria-label="Cancel editing task"]')).toHaveLength(1);
        const actions = fixture.nativeElement.querySelector('.edit-actions');
        expect(actions.closest('.meta-row')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('.editor-title-row').contains(actions)).toBe(false);
        expect(Array.from(fixture.nativeElement.querySelectorAll('.task-actions button')).map((b: any) => b.getAttribute('aria-label')))
            .toEqual(['Schedule task', 'More actions for Task']);
        title.value = 'Draft title';
        title.dispatchEvent(new Event('input'));
        textarea.value = 'Draft description';
        textarea.dispatchEvent(new Event('input'));
        expect(fixture.nativeElement.querySelector('[aria-label="Edit task"]')).toBeNull();
        fixture.detectChanges();
        expect(title.value).toBe('Draft title');
        expect(fixture.nativeElement.querySelector('textarea')).toBe(textarea);
        expect(fixture.nativeElement.querySelector('[aria-label="Schedule task"]').disabled).toBe(true);
        fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(changed).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector(entry === 'title' ? '[aria-label="Edit task title"]' : entry === 'pencil' ? '[aria-label="Edit task"]' : '.more-actions-btn'));
    });

    it('validates titles and applies the title Enter, textarea newline and Ctrl+Enter rules to both drafts', async () => {
        const { fixture, changed } = await setup(null);
        const title = fixture.nativeElement.querySelector('input[aria-label="Task title"]');
        const textarea = fixture.nativeElement.querySelector('textarea');
        expect(textarea.getAttribute('placeholder')).toBe('Add a description…');
        title.value = '   ';
        title.dispatchEvent(new Event('input'));
        fixture.nativeElement.querySelector('[aria-label="Save task"]').click();
        fixture.detectChanges();
        expect(changed).not.toHaveBeenCalled();
        expect(title.getAttribute('aria-invalid')).toBe('true');
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('title is required');
        title.value = ' Combined title ';
        title.dispatchEvent(new Event('input'));
        const source = '    indented code  \n';
        type(fixture, source);
        const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        textarea.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(false);
        expect(changed).not.toHaveBeenCalled();
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
        expect(changed).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), title: 'Combined title', description: source });
        changed.mockClear();
        title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(changed).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), title: 'Combined title', description: source });
        fixture.componentRef.setInput('contentFeedback', { attemptId: 1, pending: true, error: null });
        fixture.detectChanges();
        title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(changed).toHaveBeenCalledTimes(1);
        expect(getComputedStyle(fixture.nativeElement.querySelector('.meta-row')).flexWrap).toBe('wrap');
        expect(getComputedStyle(fixture.nativeElement.querySelector('.edit-actions')).marginLeft).toBe('auto');
    });

    it('discards drafts if the rendered task changes ownership', async () => {
        const { fixture, changed } = await setup('Original');
        type(fixture, 'Old account draft');
        fixture.componentRef.setInput('task', { ...fixture.componentInstance.task(), user_id: 'other-user' });
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(changed).not.toHaveBeenCalled();
    });

    it('opens compact Markdown help and dismisses it with Escape without cancelling the draft', async () => {
        const { fixture, changed } = await setup('Original');
        type(fixture, 'Unsaved draft');
        const trigger = fixture.nativeElement.querySelector('[aria-label="Markdown help"]');
        trigger.focus();
        trigger.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        const help = document.querySelector('.markdown-help')!;
        expect(help.querySelectorAll('dl > div')).toHaveLength(6);
        expect(help.textContent).toContain('**text**');
        expect(help.textContent).toContain('`code`');
        const close = help.querySelector('button')!;
        close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
        expect(fixture.nativeElement.querySelector('textarea').value).toBe('Unsaved draft');
        expect(changed).not.toHaveBeenCalled();
        const save = fixture.nativeElement.querySelector('[aria-label="Save task"]');
        expect(save.form).toBe(fixture.nativeElement.querySelector('.task-content-form'));
        expect(save.closest('.meta-row')).toBeTruthy();
        trigger.click();
        fixture.detectChanges();
        await fixture.whenStable();
        (document.querySelector('.markdown-help button') as HTMLButtonElement).click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('clears only on Save and keeps failed drafts editable for retry', async () => {
        const { fixture, changed } = await setup('**Existing**');
        expect(fixture.nativeElement.querySelector('[aria-label="Clear draft; save to apply"]')).toBeNull();
        type(fixture, '');
        fixture.detectChanges();
        expect(changed).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('textarea').value).toBe('');
        submit(fixture);
        expect(changed).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), title: 'Task', description: null });
        fixture.componentRef.setInput('contentFeedback', { attemptId: 1, pending: false, error: 'Could not save' });
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not save');
        expect(fixture.nativeElement.querySelector('textarea').value).toBe('');
        type(fixture, '*Retry draft*');
        submit(fixture);
        expect(changed).toHaveBeenLastCalledWith({ task: fixture.componentInstance.task(), title: 'Task', description: '*Retry draft*' });
    });
});


describe('TaskRowComponent More actions', () => {
    async function setup(description: string | null = null) {
        TestBed.configureTestingModule({ providers: [provideRouter([]),
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

    it('opens by keyboard, activates Edit with Enter, and returns focus after Escape cancels editing', async () => {
        const { fixture, trigger } = await setup();
        const changed = vi.fn();
        fixture.componentInstance.contentSaved.subscribe(changed);
        trigger.focus();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        const menu = document.querySelector('[role="menu"]') as HTMLElement;
        expect(menu.textContent).toContain('Edit task');
        expect(menu.textContent).toContain('Delete task');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        const textarea = fixture.nativeElement.querySelector('textarea');
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input[aria-label="Task title"]'));
        for (const label of ['Save task', 'Cancel editing task']) {
            expect(fixture.nativeElement.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
        }
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.more-actions-btn'));
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
        expect(items[0].textContent).toContain('Edit task');
        const deleteAction = Array.from(items).find(item => item.textContent?.includes('Delete task')) as HTMLElement;
        const destructive = deleteAction.closest('[role="menuitem"]') as HTMLElement;
        expect(destructive.closest('app-task-row')).toBeNull();
        expect(destructive.style.getPropertyValue('--p-menu-item-color')).toBe('var(--color-status-danger)');
        expect(destructive.style.getPropertyValue('--p-menu-item-icon-color')).toBe('var(--color-status-danger)');
        expect(destructive.style.getPropertyValue('--p-menu-item-focus-background')).toBe('var(--color-status-danger-soft)');
        document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', bubbles: true }));
        fixture.detectChanges();
        expect(destructive.classList.contains('p-focus')).toBe(true);

        deleteAction.click();
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


describe('Responsive task card interactions', () => {
    afterEach(() => vi.unstubAllGlobals());
    function setup(overrides: Partial<Task> = {}) {
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: CalendarClockService, useValue: { today: signal('2026-11-06') } },
        ] });
        const fixture = TestBed.createComponent(TaskRowComponent);
        fixture.componentRef.setInput('task', {
            id: 'responsive', title: 'Long task title '.repeat(12), project_id: null, description: null,
            planned_date: null, due_date: null, is_done: false, ...overrides,
        } as Task);
        fixture.detectChanges();
        return fixture;
    }

    it('distinguishes Planned and Due scheduling requests and retains the overdue warning', () => {
        const fixture = setup({ planned_date: '2026-11-06', due_date: '2026-11-05' });
        const requested = vi.fn();
        fixture.componentInstance.scheduleRequested.subscribe(requested);
        const planned = fixture.nativeElement.querySelector('[aria-label^="Change planned date"]');
        const due = fixture.nativeElement.querySelector('[aria-label^="Change due date"]');
        planned.click();
        due.click();
        expect(requested.mock.calls.map(call => call[0].field)).toEqual(['planned_date', 'due_date']);
        expect(requested.mock.calls[0][0].anchor).toBe(planned);
        expect(requested.mock.calls[1][0].anchor).toBe(due);
        expect(due.getAttribute('aria-label')).toContain('overdue');
        expect(due.classList.contains('overdue')).toBe(true);
        expect(fixture.nativeElement.querySelector('.compact-schedule-control')).toBeNull();
        fixture.componentRef.setInput('disabled', true);
        fixture.detectChanges();
        planned.click();
        expect(requested).toHaveBeenCalledTimes(2);
    });

    it('omits empty descriptions and retains scheduling and Inbox navigation without dates', async () => {
        const fixture = setup();
        expect(fixture.nativeElement.querySelector('app-task-description')).toBeNull();
        expect(fixture.nativeElement.querySelectorAll('.date-control')).toHaveLength(0);
        const requested = vi.fn();
        fixture.componentInstance.scheduleRequested.subscribe(requested);
        fixture.nativeElement.querySelector('.compact-schedule-control').click();
        expect(requested).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ taskId: 'responsive', field: 'planned_date' }));
        const link = fixture.nativeElement.querySelector('.compact-project-link');
        expect(link.getAttribute('href')).toBe('/tasks/inbox');
        expect(link.textContent).toContain('Inbox');
        const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
        link.click();
        expect(navigate).toHaveBeenCalledTimes(1);
        const completed = vi.fn();
        fixture.componentInstance.toggleDone.subscribe(completed);
        fixture.nativeElement.querySelector('.complete-toggle').click();
        expect(completed).toHaveBeenCalledExactlyOnceWith(fixture.componentInstance.task());
    });

    it.each([false, true])('retains one editor/action pair and compact metadata without duplicate date fallback (scheduled: %s)', async scheduled => {
        const fixture = setup(scheduled ? { planned_date: '2026-11-07', due_date: '2026-11-05' } : {});
        const removed = vi.fn();
        fixture.componentInstance.remove.subscribe(removed);
        fixture.nativeElement.querySelector('.title-btn').click();
        fixture.detectChanges();
        await fixture.whenStable();
        const editor = fixture.nativeElement.querySelector('app-task-content-editor');
        expect(fixture.nativeElement.querySelectorAll('app-task-content-editor')).toHaveLength(1);
        expect(editor.querySelector('textarea')).toBeTruthy();
        expect(editor.querySelector('.compact-edit-project').textContent.trim()).toBe('Inbox');
        expect(editor.querySelectorAll('.date-control')).toHaveLength(scheduled ? 2 : 0);
        expect(editor.querySelectorAll('.compact-schedule-control')).toHaveLength(scheduled ? 0 : 1);
        expect(Array.from(editor.querySelectorAll('.edit-actions button')).map((button: any) => button.getAttribute('aria-label')))
            .toEqual(['Save task', 'Cancel editing task']);
        expect(editor.querySelector('.editor-title-row .edit-actions')).toBeNull();
        expect(editor.querySelector('.edit-task-btn')).toBeNull();
        editor.querySelector('.more-actions-btn').click();
        fixture.detectChanges();
        const deleteItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
            .find(item => item.textContent?.includes('Delete task'))!;
        expect(deleteItem.getAttribute('aria-disabled')).toBe('true');
        (deleteItem.querySelector('a') as HTMLElement).click();
        expect(removed).not.toHaveBeenCalled();
        expect(editor.querySelector('textarea')).toBeTruthy();
    });

    it('edits the compact plain-text preview and falls back to More actions if Pencil is hidden after resizing', async () => {
        const fixture = setup({ description: '**Bold** [Link](https://example.com)' });
        const excerpt = fixture.nativeElement.querySelector('.compact-description-excerpt');
        expect(excerpt.textContent).toContain('Bold Link');
        expect(excerpt.querySelector('a')).toBeNull();
        excerpt.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('textarea'));
        fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
        fixture.detectChanges();
        fixture.nativeElement.querySelector('[aria-label="Edit task"]').click();
        fixture.detectChanges();
        const style = document.createElement('style');
        // Model the visibility outcome of crossing the container breakpoint, without pretending JSDOM lays it out.
        style.textContent = '.edit-task-btn { display: none; }';
        document.head.append(style);
        try {
            fixture.nativeElement.querySelector('[aria-label="Cancel editing task"]').click();
            fixture.detectChanges();
            await fixture.whenStable();
            expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.more-actions-btn'));
        } finally { style.remove(); }
    });

    it('navigates to the assigned nested project and moves using the original TreeSelect and project output', async () => {
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
            matches: false, media: query, onchange: null,
            addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
        })));
        const fixture = setup({ project_id: 'child' });
        const project = (id: string, name: string, children: ProjectNode[] = []): ProjectNode => ({
            project: { id, name, user_id: 'user', parent_project_id: null, created_at: '', updated_at: '' }, children,
        });
        const name = 'A long nested project: "Important" '.repeat(12);
        fixture.componentRef.setInput('projects', [project('root', 'Root', [project('child', name)]), project('destination', 'Destination')]);
        fixture.detectChanges();
        const link = fixture.nativeElement.querySelector('.compact-project-link');
        expect(link.getAttribute('href')).toBe('/tasks/project/child');
        expect(link.textContent).toContain(name);
        expect(fixture.nativeElement.querySelectorAll('p-treeselect')).toHaveLength(1);
        const moved = vi.fn();
        fixture.componentInstance.projectChange.subscribe(moved);
        fixture.nativeElement.querySelector('.more-actions-btn').click();
        fixture.detectChanges();
        (Array.from(document.querySelectorAll('[role="menuitem"] a')).find(item => item.textContent?.includes('Move to project')) as HTMLElement).click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('.project-selector').classList.contains('is-moving')).toBe(true);
        const destination = Array.from(document.querySelectorAll('[role="treeitem"]'))
            .find(item => item.getAttribute('aria-label') === 'Destination')!;
        expect(destination).toBeTruthy();
        (destination.querySelector('[data-pc-section="nodecontent"]') as HTMLElement).click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(moved).toHaveBeenCalledExactlyOnceWith({ task: fixture.componentInstance.task(), projectId: 'destination' });
        expect(fixture.nativeElement.querySelector('.project-selector').classList.contains('is-moving')).toBe(false);
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.more-actions-btn'));
        // The custom native clear button still bubbles to PrimeNG's original clear handler.
        const clear = fixture.nativeElement.querySelector('[aria-label="Move task to Inbox"]');
        clear.click();
        fixture.detectChanges();
        expect(moved).toHaveBeenLastCalledWith({ task: fixture.componentInstance.task(), projectId: null });
        expect(moved).toHaveBeenCalledTimes(2);
    });
});
