import { Component, input, output } from '@angular/core';

import type { ProjectNode } from '@/features/projects/models/project.model';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [],
    templateUrl: './app-sidebar.component.html',
    styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
    readonly projects = input<ProjectNode[]>([]);

    readonly projectSelect = output<string | null>();


}
