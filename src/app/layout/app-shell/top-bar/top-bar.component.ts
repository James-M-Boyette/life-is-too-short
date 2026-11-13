import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
@Component({
    selector: 'app-top-bar',
    standalone: true,
    imports: [],
    templateUrl: './top-bar.component.html',
    styleUrl: './top-bar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
    readonly navigationOpen = input(false);
    readonly showNavigation = output<void>();
    readonly createTask = output<void>();
}
