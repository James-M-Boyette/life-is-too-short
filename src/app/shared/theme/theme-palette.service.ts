import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from './theme-palette';

const STORAGE_KEY = 'life-is-too-short.palette-preview';

@Injectable({ providedIn: 'root' })
export class ThemePaletteService {
    private readonly document = inject(DOCUMENT);

    private readonly selected = signal<PaletteId>(DEFAULT_PALETTE);
    readonly palette = this.selected.asReadonly();

    constructor() {
        let initial: PaletteId = DEFAULT_PALETTE;

        try {
            const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
            if (stored && isPaletteId(stored)) {
                initial = stored;
            }
        } catch {
            // The preview still works when browser storage is restricted.
        }

        this.applyPalette(initial);
    }

    setPalette(next: PaletteId): void {
        this.applyPalette(next);

        try {
            this.document.defaultView?.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Persistence is optional; theme selection is not.
        }
    }

    private applyPalette(next: PaletteId): void {
        this.document.documentElement.dataset['palette'] = next;
        this.selected.set(next);
    }
}
