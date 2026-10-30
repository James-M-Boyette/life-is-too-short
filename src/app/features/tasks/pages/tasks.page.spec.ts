import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskCreateDialogService } from '@/features/tasks/services/task-create-dialog.service';
import { TasksPage } from './tasks.page';

describe('TasksPage', () => {
    let component: TasksPage;
    let fixture: ComponentFixture<TasksPage>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TasksPage],
            providers: [TaskCreateDialogService],
        }).compileComponents();

        fixture = TestBed.createComponent(TasksPage);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
