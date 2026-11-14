import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Popover, PopoverModule } from 'primeng/popover';
import { FocusTrapModule } from 'primeng/focustrap';
import { PALETTE_OPTIONS, type PaletteId } from '@/shared/theme/theme-palette';
import { ThemePaletteService } from '@/shared/theme/theme-palette.service';
import { accountIdentity, type AccountUser } from './account-identity';

@Component({
    selector: 'app-account-controls',
    standalone: true,
    imports: [PopoverModule, FocusTrapModule],
    templateUrl: './account-controls.component.html',
    styleUrl: './account-controls.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountControlsComponent {
    readonly user = input<AccountUser | null>(null);
    readonly available = input(true);
    readonly mobile = input(false);
    readonly pending = input(false);
    readonly error = input<string | null>(null);
    readonly signOut = output<void>();
    protected readonly identity = computed(() => accountIdentity(this.user()));
    protected readonly paletteService = inject(ThemePaletteService);
    protected readonly paletteOptions = PALETTE_OPTIONS;
    protected readonly appearanceOpen = signal(false);
    protected readonly menuOpen = signal(false);
    protected readonly overlayParent = signal<HTMLElement | 'body'>('body');
    private readonly document = inject(DOCUMENT);
    private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
    private readonly popover = viewChild<Popover>('accountPopover');
    private readonly appearanceButton =
        viewChild<ElementRef<HTMLButtonElement>>('appearanceButton');
    private restoreOnHide = true;

    constructor() {
        let previousMobile = this.mobile();
        let previousOwner = this.user()?.id;
        effect(() => {
            const mobile = this.mobile();
            const owner = this.user()?.id;
            if (!this.available() || mobile !== previousMobile || owner !== previousOwner)
                this.dismiss(false);
            previousMobile = mobile;
            previousOwner = owner;
        });
    }

    protected toggle(event: Event): void {
        event.stopPropagation();
        if (this.popover()?.overlayVisible) {
            this.dismiss();
            return;
        }
        this.restoreOnHide = true;
        // Attach outside the scrolling content but within the drawer's stacking/focus context.
        this.overlayParent.set(
            this.trigger().nativeElement.closest<HTMLElement>('.p-drawer') ?? 'body',
        );
        this.menuOpen.set(true);
        this.popover()?.show(event, this.trigger().nativeElement);
    }
    protected shown(): void {
        this.appearanceButton()?.nativeElement.focus();
    }
    protected hidden(): void {
        this.menuOpen.set(false);
        this.appearanceOpen.set(false);
        const focused = this.document.activeElement;
        if (
            this.restoreOnHide &&
            (focused === this.document.body || this.popover()?.container?.contains(focused))
        )
            this.restoreFocus();
    }
    dismiss(restoreFocus = true): void {
        this.restoreOnHide = restoreFocus;
        this.menuOpen.set(false);
        this.appearanceOpen.set(false);
        this.popover()?.hide();
        if (restoreFocus) this.restoreFocus();
    }
    private restoreFocus(): void {
        const button = this.trigger().nativeElement;
        if (this.available() && button.isConnected && !button.closest('[hidden], [inert]'))
            button.focus({ preventScroll: true });
    }
    protected escape(event: Event): void {
        if (!this.menuOpen()) return;
        // Consume Escape here so the drawer does not dismiss the same interaction.
        event.stopPropagation();
        event.preventDefault();
        this.dismiss();
    }
    protected changePalette(value: PaletteId): void {
        this.paletteService.setPalette(value);
    }
    protected requestSignOut(): void {
        if (!this.pending()) this.signOut.emit();
    }
}
