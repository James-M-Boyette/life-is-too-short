import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
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

    protected onSignOutClick() {
        if (this.disabled) return;
        this.signOut.emit();
    }
}
