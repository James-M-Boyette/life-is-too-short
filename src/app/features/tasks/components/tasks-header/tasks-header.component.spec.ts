import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TasksHeaderComponent } from './tasks-header.component';

describe('TasksHeaderComponent', () => {
    let component: TasksHeaderComponent;
    let fixture: ComponentFixture<TasksHeaderComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TasksHeaderComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TasksHeaderComponent);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
