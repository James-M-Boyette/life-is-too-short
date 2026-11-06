import { TestBed } from '@angular/core/testing';
import { ThemePaletteService } from './theme-palette.service';

describe('ThemePaletteService', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-palette');
        localStorage.removeItem('life-is-too-short.palette-preview');
    });

    it('defaults to Maritime and applies the root palette attribute', () => {
        localStorage.removeItem('life-is-too-short.palette-preview');
        const service = TestBed.inject(ThemePaletteService);

        expect(service.palette()).toBe('maritime');
        expect(document.documentElement.dataset['palette']).toBe('maritime');
    });

    it('switches the palette and retains the choice for the next load', () => {
        const service = TestBed.inject(ThemePaletteService);

        service.setPalette('botanical');

        expect(service.palette()).toBe('botanical');
        expect(document.documentElement.dataset['palette']).toBe('botanical');
        expect(localStorage.getItem('life-is-too-short.palette-preview')).toBe('botanical');
    });

    it('ignores unsupported stored values', () => {
        localStorage.setItem('life-is-too-short.palette-preview', 'unsupported');
        const service = TestBed.inject(ThemePaletteService);

        expect(service.palette()).toBe('maritime');
    });
});
