
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
    TaskCreateComponent,
    type CreateTaskPayload,
} from './task-create.component';

describe('TaskCreateComponent', () => {
    let fixture: ComponentFixture<TaskCreateComponent>;

    beforeEach(async () => {
        TestBed.overrideComponent(TaskCreateComponent, {
            set: {
                template: `
                    <form [formGroup]="form" (ngSubmit)="onSubmit()">
                        <input formControlName="title" />
                        <textarea formControlName="description"></textarea>
                        <button type="submit">Add Task</button>
                    </form>
                `,
            },
        });

        await TestBed.configureTestingModule({
            imports: [TaskCreateComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TaskCreateComponent);
    });

    it('initializes its planned date from the provided context', async () => {
        fixture.componentRef.setInput(
            'defaultPlannedDate',
            '2026-10-30',
        );

        await fixture.whenStable();

        // Submit a valid title so we can inspect the emitted payload.
        const title = fixture.nativeElement.querySelector(
            'input',
        ) as HTMLInputElement;

        title.value = 'Finish project planning';
        title.dispatchEvent(new Event('input'));

        const createSpy = vi.fn<(payload: CreateTaskPayload) => void>();

        fixture.componentInstance.create.subscribe(createSpy);

        const form = fixture.nativeElement.querySelector(
            'form',
        ) as HTMLFormElement;

        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );

        expect(createSpy).toHaveBeenCalledWith({
            title: 'Finish project planning',
            description: null,
            projectId: null,
            plannedDate: '2026-10-30',
        });
    });

    it('preserves entered values after submitting', async () => {
        await fixture.whenStable();

        const title = fixture.nativeElement.querySelector(
            'input',
        ) as HTMLInputElement;

        title.value = 'Buy groceries';
        title.dispatchEvent(new Event('input'));

        const createSpy = vi.fn();
        fixture.componentInstance.create.subscribe(createSpy);

        const form = fixture.nativeElement.querySelector(
            'form',
        ) as HTMLFormElement;

        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );

        expect(createSpy).toHaveBeenCalledOnce();
        expect(title.value).toBe('Buy groceries');

        // The parent has not confirmed a successful save.
        // Therefore the form must not clear itself.
    });

    it('does not emit a creation request for an invalid title', async () => {
        await fixture.whenStable();

        const createSpy = vi.fn();
        fixture.componentInstance.create.subscribe(createSpy);

        const form = fixture.nativeElement.querySelector(
            'form',
        ) as HTMLFormElement;

        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );

        expect(createSpy).not.toHaveBeenCalled();
    });

    it('does not submit while disabled', async () => {
        fixture.componentRef.setInput('disabled', true);
        await fixture.whenStable();

        const title = fixture.nativeElement.querySelector(
            'input',
        ) as HTMLInputElement;

        title.value = 'Test task';
        title.dispatchEvent(new Event('input'));

        const createSpy = vi.fn();
        fixture.componentInstance.create.subscribe(createSpy);

        const form = fixture.nativeElement.querySelector(
            'form',
        ) as HTMLFormElement;

        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );

        expect(createSpy).not.toHaveBeenCalled();
    });
});
