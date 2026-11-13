import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ProjectDialogRequest = {
    action: 'edit' | 'delete';
    projectId: string;
    userId: string;
    sourceUrl: string;
    trigger: HTMLElement;
};

// Shell-scoped, synchronous intentions only: no project data, queue, or persistence state.
@Injectable()
export class ProjectDialogService {
    private readonly intentions = new Subject<ProjectDialogRequest>();
    readonly requests = this.intentions.asObservable();

    open(request: ProjectDialogRequest): void {
        this.intentions.next(request);
    }
}
