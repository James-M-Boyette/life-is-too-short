import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { PALETTE_OPTIONS, type PaletteId } from '@/shared/theme/theme-palette';
import { ThemePaletteService } from '@/shared/theme/theme-palette.service';

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

    protected readonly paletteService = inject(ThemePaletteService);
    protected readonly paletteOptions = PALETTE_OPTIONS;

    protected changePalette(event: Event): void {
        const value = (event.target as HTMLSelectElement).value as PaletteId;
        if (this.paletteOptions.some((option) => option.id === value)) {
            this.paletteService.setPalette(value);
        }
    }
}
