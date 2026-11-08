import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AccountControlsComponent } from '../account-controls/account-controls.component';
@Component({
    selector: 'app-top-bar', standalone: true, imports: [AccountControlsComponent],
    templateUrl: './top-bar.component.html', styleUrl: './top-bar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
    readonly userEmail = input<string | null>(null);
    readonly mobile = input(false);
    readonly navigationOpen = input(false);
    readonly showNavigation = output<void>();
    readonly createTask = output<void>();
    readonly signOut = output<void>();
}
