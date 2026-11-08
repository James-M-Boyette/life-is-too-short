import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { AccountControlsComponent } from './account-controls.component';
import { ThemePaletteService } from '@/shared/theme/theme-palette.service';
import { PALETTE_OPTIONS } from '@/shared/theme/theme-palette';

describe('AccountControlsComponent', () => {
    let fixture: ComponentFixture<AccountControlsComponent>;
    const trigger = () => fixture.nativeElement.querySelector('.account-trigger') as HTMLButtonElement;
    const panel = () => document.querySelector('.account-panel') as HTMLElement;
    async function settle() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [AccountControlsComponent] }).compileComponents();
        fixture = TestBed.createComponent(AccountControlsComponent);
        document.body.appendChild(fixture.nativeElement);
        fixture.componentRef.setInput('user', { id: 'user', email: 'ada@example.com', user_metadata: { full_name: 'Ada Lovelace' } });
        await settle();
    });
    afterEach(() => fixture.destroy());
    it('opens from the keyboard, shows one trigger avatar only and restores focus on Escape', async () => {
        trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await settle();
        expect(trigger().getAttribute('aria-expanded')).toBe('true');
        expect(fixture.nativeElement.querySelectorAll('.avatar')).toHaveLength(1);
        expect(panel().querySelector('.avatar, .pi-user, .pi-chart-line')).toBeNull();
        expect(panel().textContent).toContain('Ada Lovelace');
        expect(panel().textContent).toContain('ada@example.com');
        expect(document.activeElement?.textContent).toContain('Appearance');
        panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger());
    });
    it('toggles by mouse and uses an inline palette disclosure with immediate selection', async () => {
        trigger().click(); await settle();
        const appearance = panel().querySelector('button')!;
        expect(appearance.getAttribute('aria-expanded')).toBe('false');
        appearance.click(); await settle();
        expect(appearance.getAttribute('aria-expanded')).toBe('true');
        const service = TestBed.inject(ThemePaletteService);
        const selected = vi.spyOn(service, 'setPalette');
        (panel().querySelector(`input[value="${PALETTE_OPTIONS[2].id}"]`) as HTMLInputElement).click(); await settle();
        expect(selected).toHaveBeenCalledExactlyOnceWith(PALETTE_OPTIONS[2].id);
        expect(service.palette()).toBe(PALETTE_OPTIONS[2].id);
        expect(trigger().getAttribute('aria-expanded')).toBe('true');
        trigger().click(); await settle();
        expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });
    it('dismisses on an outside click and does not steal focus from another control', async () => {
        trigger().click(); await settle();
        const outside = document.createElement('button'); document.body.append(outside);
        outside.focus(); outside.click(); await settle();
        await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'));
        expect(document.activeElement).toBe(outside); outside.remove();
    });
    it('closes when its navigation context becomes unavailable or changes account', async () => {
        trigger().click(); await settle();
        fixture.componentRef.setInput('available', false); await settle();
        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        fixture.componentRef.setInput('available', true); await settle();
        trigger().click(); await settle();
        fixture.componentRef.setInput('user', { id: 'other', email: 'other@example.com' }); await settle();
        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        expect(trigger().textContent).toContain('other');
    });
    it('renders untrusted and long identity strings as text without injecting markup', async () => {
        const name = '<img src=x onerror=alert(1)> '.repeat(20);
        fixture.componentRef.setInput('user', { id: 'user', email: 'long'.repeat(50) + '@example.com', user_metadata: { full_name: name } }); await settle();
        trigger().click(); await settle();
        expect(panel().querySelector('img, script')).toBeNull();
        expect(panel().textContent).toContain('<img src=x onerror=alert(1)>');
        expect(panel().textContent).toContain('long'.repeat(50));
    });

    it('emits logout without changing auth itself, and honors pending/error feedback', async () => {
        const requested = vi.fn(); fixture.componentInstance.signOut.subscribe(requested);
        trigger().click(); await settle();
        (panel().querySelector('.logout') as HTMLButtonElement).click();
        expect(requested).toHaveBeenCalledTimes(1);
        fixture.componentRef.setInput('pending', true); fixture.componentRef.setInput('error', 'Please retry'); await settle();
        (panel().querySelector('.logout') as HTMLButtonElement).click();
        expect(requested).toHaveBeenCalledTimes(1);
        expect((panel().querySelector('.logout') as HTMLButtonElement).disabled).toBe(true);
        expect(panel().querySelector('[role="alert"]')?.textContent).toContain('Please retry');
    });
});
