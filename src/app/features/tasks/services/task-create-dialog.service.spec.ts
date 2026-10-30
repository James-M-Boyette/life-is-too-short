
import { TestBed } from '@angular/core/testing';

import { TaskCreateDialogService } from './task-create-dialog.service';

describe('TaskCreateDialogService', () => {
    let service: TaskCreateDialogService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [TaskCreateDialogService],
        });

        service = TestBed.inject(TaskCreateDialogService);
    });

    it('starts with no active creation context', () => {
        expect(service.context()).toBeNull();
    });

    it('opens Quick Add with the requested context', () => {
        service.open({
            projectId: null,
            plannedDate: '2026-10-30',
        });

        expect(service.context()).toEqual({
            projectId: null,
            plannedDate: '2026-10-30',
        });
    });

    it('preserves the original context when another open is requested', () => {
        service.open({
            projectId: null,
            plannedDate: '2026-10-30',
        });

        service.open({
            projectId: 'another-project',
            plannedDate: null,
        });

        expect(service.context()).toEqual({
            projectId: null,
            plannedDate: '2026-10-30',
        });
    });

    it('closes Quick Add and allows a different context afterward', () => {
        service.open({
            projectId: null,
            plannedDate: '2026-10-30',
        });

        service.close();

        expect(service.context()).toBeNull();

        service.open({
            projectId: 'project-123',
            plannedDate: null,
        });

        expect(service.context()).toEqual({
            projectId: 'project-123',
            plannedDate: null,
        });
    });
});
