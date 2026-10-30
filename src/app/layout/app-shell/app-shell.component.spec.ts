import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AppShellComponent } from './app-shell.component';

@Component({
    standalone: true,
    template: '',
})
class TestLoginComponent {}

describe('AppShellComponent', () => {
    let component: AppShellComponent;
    let fixture: ComponentFixture<AppShellComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AppShellComponent],
            providers: [
                provideRouter([
                    {
                        path: 'login',
                        component: TestLoginComponent,
                    },
                ]),
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(AppShellComponent);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
