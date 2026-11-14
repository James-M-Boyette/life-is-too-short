import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, isDevMode, Output } from '@angular/core';

import { ButtonModule } from 'primeng/button';

@Component({
    standalone: true,
    selector: 'app-tasks-header',
    imports: [CommonModule, ButtonModule],
    templateUrl: './tasks-header.component.html',
    styleUrls: ['./tasks-header.component.scss'],
})
export class TasksHeaderComponent {
    @Input() title = 'Tasks';
    @Input() realtimeOn = false;
    @Input() errorText: string | null = null;
    @Input() disabled = false;

    @Output() signOut = new EventEmitter<void>();

    // Temporary presentation policy only; this does not grant any privileged capabilities.
    protected readonly showRealtimeDiagnostic = isDevMode();

    protected onSignOutClick(): void {
        if (this.disabled) {
            return;
        }

        this.signOut.emit();
    }
}
