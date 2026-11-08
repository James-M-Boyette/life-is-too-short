import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskListComponent } from './task-list.component';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { vi } from 'vitest';
import type { Task } from '@/features/tasks/models/tasks.model';

describe('TaskListComponent', () => {
    let component: TaskListComponent;
    let fixture: ComponentFixture<TaskListComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TaskListComponent],
            providers: [provideRouter([])],
        }).compileComponents();

        fixture = TestBed.createComponent(TaskListComponent);
        component = fixture.componentInstance;

        fixture.componentRef.setInput('tasks', []);

        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    function groupedList() {
        const task = (id: string, position: number) => ({
            id, title: id, project_id: null, planned_date: null, due_date: null,
            planned_position: position,
        }) as Task;
        const planned = [task('p1', 10), task('p2', 30)];
        const due = [task('d1', 20), task('d2', 40)];
        fixture.componentRef.setInput('tasks', [planned[0], due[0], planned[1], due[1]]);
        fixture.componentRef.setInput('groups', [
            { id: 'planned', label: 'Planned for today', tasks: planned },
            { id: 'due', label: 'Due today · Not planned', tasks: due },
        ]);
        fixture.componentRef.setInput('draggable', true);
        fixture.componentRef.setInput('sortable', true);
        fixture.componentRef.setInput('destinationDate', '2026-11-05');
        fixture.detectChanges();
        const listElement = fixture.debugElement.query(By.directive(CdkDropList));
        const list = listElement.injector.get(CdkDropList<Task[]>);
        const drags = fixture.debugElement.queryAll(By.directive(CdkDrag)).map(el => el.injector.get(CdkDrag<Task>));
        return { listElement, list, drags, planned, due };
    }

    it('rejects late CDK drops while disabled and restores existing desktop sorting', () => {
        const { listElement, list, drags } = groupedList();
        const reordered = vi.fn();
        const dropped = vi.fn();
        component.taskReordered.subscribe(reordered);
        component.taskDropped.subscribe(dropped);
        fixture.componentRef.setInput('draggable', false);
        fixture.detectChanges();
        expect(list.disabled).toBe(true);
        expect(list.sortingDisabled).toBe(true);
        expect(drags.every(drag => drag.disabled)).toBe(true);
        expect(list.enterPredicate(drags[0], list)).toBe(false);
        expect(list.sortPredicate(1, drags[0], list)).toBe(false);
        const event = { item: drags[0], previousContainer: list, container: list, previousIndex: 0, currentIndex: 1 };
        listElement.triggerEventHandler('cdkDropListDropped', event);
        listElement.triggerEventHandler('cdkDropListDropped', { ...event, previousContainer: { id: 'external' } });
        expect(reordered).not.toHaveBeenCalled();
        expect(dropped).not.toHaveBeenCalled();
        fixture.componentRef.setInput('draggable', true);
        fixture.detectChanges();
        expect(list.disabled).toBe(false);
        expect(drags.every(drag => !drag.disabled)).toBe(true);
        listElement.triggerEventHandler('cdkDropListDropped', event);
        expect(reordered).toHaveBeenCalledTimes(1);
        expect(dropped).not.toHaveBeenCalled();
    });

    it('renders visual headings within one drop list while keeping each section in its supplied order', () => {
        const { list } = groupedList();
        expect(fixture.debugElement.queryAll(By.directive(CdkDropList))).toHaveLength(1);
        expect(fixture.nativeElement.querySelectorAll('h3')).toHaveLength(2);
        expect(list.data.map(task => task.id)).toEqual(['p1', 'p2', 'd1', 'd2']);
        expect(list.getSortedItems().map(drag => drag.data.id)).toEqual(['p1', 'p2', 'd1', 'd2']);
        // A foreign CDK placeholder may be inserted inside any destination row host.
        // Hosts must not create a second layout box that swallows the list's gap.
        for (const host of fixture.nativeElement.querySelectorAll('app-task-row')) {
            expect(getComputedStyle(host).display).toBe('contents');
        }
    });

    it('blocks internal sorting across sections and emits subgroup-relative reorder indices and neighbors', () => {
        const { listElement, list, drags, due } = groupedList();
        expect(list.sortPredicate(1, drags[0], list)).toBe(true);
        expect(list.sortPredicate(2, drags[0], list)).toBe(false);
        expect(list.sortPredicate(1, drags[2], list)).toBe(false);
        expect(list.sortPredicate(3, drags[2], list)).toBe(true);
        const reordered = vi.fn();
        component.taskReordered.subscribe(reordered);
        listElement.triggerEventHandler('cdkDropListDropped', {
            item: drags[2], previousContainer: list, container: list, previousIndex: 2, currentIndex: 3,
        });
        expect(reordered).toHaveBeenCalledExactlyOnceWith({
            task: due[0], previousIndex: 0, currentIndex: 1, tasks: due, field: 'planned_position',
        });
        listElement.triggerEventHandler('cdkDropListDropped', {
            item: drags[0], previousContainer: list, container: list, previousIndex: 0, currentIndex: 2,
        });
        expect(reordered).toHaveBeenCalledTimes(1);
    });

    it('keeps cross-column drops as scheduling actions regardless of the hovered visual section', () => {
        const { listElement, list } = groupedList();
        const external = { id: 'outside' } as Task;
        const drag = { data: external, dropContainer: { id: 'board-unscheduled' } } as CdkDrag<Task>;
        expect(list.enterPredicate(drag, list)).toBe(true);
        expect(list.sortPredicate(3, drag, list)).toBe(true);
        const dropped = vi.fn();
        const reordered = vi.fn();
        component.taskDropped.subscribe(dropped);
        component.taskReordered.subscribe(reordered);
        listElement.triggerEventHandler('cdkDropListDropped', {
            item: drag, previousContainer: drag.dropContainer, container: list, previousIndex: 0, currentIndex: 3,
        });
        expect(dropped).toHaveBeenCalledExactlyOnceWith({ task: external, plannedDate: '2026-11-05' });
        expect(reordered).not.toHaveBeenCalled();
    });

    it('omits empty section headings and leaves ordinary lists unrestricted', () => {
        groupedList();
        fixture.componentRef.setInput('groups', [{ id: 'empty', label: 'Empty section', tasks: [] }]);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('h3')).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('No tasks.');
        fixture.componentRef.setInput('groups', []);
        fixture.detectChanges();
        const list = fixture.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList<Task[]>);
        const drags = list.getSortedItems();
        expect(list.data).toHaveLength(4);
        expect(list.sortPredicate(3, drags[0], list)).toBe(true);
    });

    function allowPlanning() {
        fixture.componentRef.setInput('planningTransition', {
            sourceGroupId: 'due', targetGroupId: 'planned', plannedDate: '2026-11-05',
        });
        fixture.detectChanges();
    }

    function endTargetPoint() {
        const target = fixture.nativeElement.querySelector('.list__planning-target');
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 200, top: 100, bottom: 140, width: 200, height: 40 });
        return { x: 50, y: 120 };
    }

    it.each([
        ['beginning', 0, null, 'p1'],
        ['middle', 1, 'p1', 'p2'],
        ['end', 2, 'p2', null],
    ])('plans a due-only task at the %s using task indices rather than heading indices', (where, index, previous, next) => {
        const { listElement, list, drags, due } = groupedList();
        allowPlanning();
        expect(list.sortPredicate(0, drags[2], list)).toBe(true);
        expect(list.sortPredicate(2, drags[0], list)).toBe(false);
        const dropped = vi.fn();
        const reordered = vi.fn();
        component.taskDropped.subscribe(dropped);
        component.taskReordered.subscribe(reordered);
        listElement.triggerEventHandler('cdkDropListDropped', {
            item: drags[2], previousContainer: list, container: list, previousIndex: 2, currentIndex: index,
            dropPoint: where === 'end' ? endTargetPoint() : { x: 50, y: 20 },
        });
        expect(dropped).toHaveBeenCalledExactlyOnceWith({
            task: due[0], plannedDate: '2026-11-05', placement: { previousTaskId: previous, nextTaskId: next },
        });
        expect(reordered).not.toHaveBeenCalled();
        // Headings and the end target are not registered as draggables.
        expect(list.getSortedItems()).toHaveLength(4);
    });

    it('makes an empty Planned section reachable even when the only task retains CDK index zero', () => {
        const { listElement, list, drags, due } = groupedList();
        fixture.componentRef.setInput('groups', [
            { id: 'planned', label: 'Planned for today', tasks: [] },
            { id: 'due', label: 'Due today · Not planned', tasks: [due[0]] },
        ]);
        allowPlanning();
        const dropped = vi.fn();
        component.taskDropped.subscribe(dropped);
        expect(fixture.nativeElement.querySelector('.list__planning-target').textContent).toContain('Planned for today');
        listElement.triggerEventHandler('cdkDropListDropped', {
            item: drags[2], previousContainer: list, container: list, previousIndex: 0, currentIndex: 0,
            dropPoint: endTargetPoint(),
        });
        expect(dropped).toHaveBeenCalledExactlyOnceWith({
            task: due[0], plannedDate: '2026-11-05', placement: { previousTaskId: null, nextTaskId: null },
        });
    });

    it('does not plan an unchanged Due drop or reverse a Planned task into Due, and ignores outside releases', () => {
        const { listElement, list, drags } = groupedList();
        allowPlanning();
        const dropped = vi.fn();
        component.taskDropped.subscribe(dropped);
        for (const event of [
            { item: drags[2], previousIndex: 2, currentIndex: 2 },
            { item: drags[0], previousIndex: 0, currentIndex: 2 },
            { item: drags[2], previousIndex: 2, currentIndex: 0, isPointerOverContainer: false },
        ]) {
            listElement.triggerEventHandler('cdkDropListDropped', { ...event, previousContainer: list, container: list });
        }
        expect(dropped).not.toHaveBeenCalled();
    });

    it.each([false, true])('plans around a single Planned item (at end: %s)', atEnd => {
        const { listElement, list, drags, planned, due } = groupedList();
        fixture.componentRef.setInput('groups', [
            { id: 'planned', label: 'Planned for today', tasks: [planned[0]] },
            { id: 'due', label: 'Due today · Not planned', tasks: [due[0]] },
        ]);
        allowPlanning();
        const dropped = vi.fn();
        component.taskDropped.subscribe(dropped);
        listElement.triggerEventHandler('cdkDropListDropped', {
            item: drags[2], previousContainer: list, container: list, previousIndex: 1, currentIndex: atEnd ? 1 : 0,
            dropPoint: atEnd ? endTargetPoint() : { x: 50, y: 20 },
        });
        expect(dropped).toHaveBeenCalledExactlyOnceWith({
            task: due[0], plannedDate: '2026-11-05', placement: {
                previousTaskId: atEnd ? 'p1' : null, nextTaskId: atEnd ? null : 'p1',
            },
        });
    });
});
