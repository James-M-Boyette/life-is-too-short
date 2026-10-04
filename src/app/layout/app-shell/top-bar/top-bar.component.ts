import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-top-bar',
    standalone: true,
    imports: [ButtonModule],
    templateUrl: './top-bar.component.html',
    styleUrl: './top-bar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
    readonly userEmail = input<string | null>(null);

    readonly signOut = output<void>();
}
