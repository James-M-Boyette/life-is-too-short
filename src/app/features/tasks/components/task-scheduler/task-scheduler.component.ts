import { DatePipe } from '@angular/common';
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';

import type { TaskDateField, TaskDateSelection } from '@/features/tasks/models/task-schedule.model';
import type { Task } from '@/features/tasks/models/tasks.model';
import { getQuickDates } from '@/features/tasks/utils/quick-dates.util';
import { formatLocalDate, parseLocalDate } from '@/shared/utils/date.util';

@Component({
    selector: 'app-task-scheduler',
    standalone: true,
    imports: [DatePipe, FormsModule, DatePickerModule, SelectButtonModule, ButtonModule],
    templateUrl: './task-scheduler.component.html',
    styleUrl: './task-scheduler.component.scss',
})
export class TaskSchedulerComponent {
    readonly task = input.required<Task>();
    readonly persistedTask = input.required<Task>();
    readonly today = input.required<string>();
    readonly pending = input(false);
    readonly disabled = input(false);
    readonly error = input<string | null>(null);

    readonly selectDate = output<TaskDateSelection>();
    readonly retry = output<void>();
    readonly dismiss = output<Event>();

    readonly entryField = input<{ field: TaskDateField }>({ field: 'planned_date' });

    protected readonly field = linkedSignal(() => this.entryField().field);
    protected readonly fields = [
        { label: 'Planned', value: 'planned_date' },
        { label: 'Due', value: 'due_date' },
    ];
    protected readonly quickDates = computed(() => getQuickDates(this.today()));
    protected readonly currentDate = computed(() => parseLocalDate(this.task()[this.field()]));
    protected readonly persistedDate = computed(() =>
        parseLocalDate(this.persistedTask()[this.field()]),
    );
    protected readonly calendarStart = computed(() => parseLocalDate(this.today())!);
    protected readonly blocked = computed(() => this.pending() || this.disabled());

    protected choose(date: string | null): void {
        if (!this.blocked()) {
            this.selectDate.emit({ field: this.field(), date });
        }
    }

    protected chooseCalendarDate(date: Date): void {
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
            this.choose(formatLocalDate(date));
        }
    }
}
