import { Component, input, } from '@angular/core';

import type { ProjectNode } from '@/features/projects/models/project.model';
import { RouterLink, RouterLinkActive } from '@angular/router';
@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [RouterLink, RouterLinkActive],
    templateUrl: './app-sidebar.component.html',
    styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
    readonly projects = input<ProjectNode[]>([]);


}
