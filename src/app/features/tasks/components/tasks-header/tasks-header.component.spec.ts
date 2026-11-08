import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TasksHeaderComponent } from './tasks-header.component';

describe('TasksHeaderComponent diagnostic presentation', () => {
    afterEach(() => vi.unstubAllGlobals());
    for (const development of [true, false]) {
        it(`shows routine realtime status only in development (development=${development}), retaining errors`, async () => {
            await TestBed.configureTestingModule({ imports: [TasksHeaderComponent] }).compileComponents();
            // Exercise Angular's real isDevMode() result, not a component-private flag.
            vi.stubGlobal('ngDevMode', development);
            const fixture = TestBed.createComponent(TasksHeaderComponent);
            fixture.componentRef.setInput('title', 'Today');
            fixture.componentRef.setInput('errorText', 'Synchronization failed. Please retry.');
            fixture.componentRef.setInput('realtimeOn', true);
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Today');
            expect(fixture.nativeElement.querySelector('.error').textContent).toContain('Synchronization failed');
            expect(fixture.nativeElement.querySelector('.status')?.textContent ?? '').toBe(development ? 'Realtime: on' : '');
            fixture.componentRef.setInput('realtimeOn', false); fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.status')?.textContent ?? '').toBe(development ? 'Realtime: off' : '');
            fixture.destroy();
        });
    }
});
