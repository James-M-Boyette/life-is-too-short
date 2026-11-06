import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppSidebarComponent } from './app-sidebar.component';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import type { ProjectNode } from '@/features/projects/models/project.model';
import { Router, provideRouter } from '@angular/router';

@Component({ standalone: true, template: '' })
class ProjectRoute {}

function project(id: string, children: ProjectNode[] = []): ProjectNode {
    return { project: { id, name: id, user_id: 'user', parent_project_id: null, created_at: '', updated_at: '' }, children };
}

describe('AppSidebarComponent', () => {
    let component: AppSidebarComponent;
    let fixture: ComponentFixture<AppSidebarComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AppSidebarComponent],
            providers: [provideRouter([{ path: 'tasks/project/:id', component: ProjectRoute }])],
        }).compileComponents();

        fixture = TestBed.createComponent(AppSidebarComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('projects', [project('parent', [project('child', [project('grandchild')]), project('leaf')])]);
        await fixture.whenStable();
    });

    const link = (id: string): HTMLAnchorElement | null => fixture.nativeElement.querySelector(`a[href="/tasks/project/${id}"]`);
    const row = (id: string): HTMLElement => link(id)!.closest('[role="treeitem"]')!;
    const doubleClick = (id: string) => {
        link(id)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        fixture.detectChanges();
    };
    const action = (label: string) => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find(button => button.textContent?.trim() === label)!;

    it('expands immediate children, reveals grandchildren independently, and collapses on another double-click', () => {
        expect(link('child')).toBeNull();
        doubleClick('parent');
        expect(row('parent').getAttribute('aria-expanded')).toBe('true');
        expect(link('child')).toBeTruthy();
        expect(link('grandchild')).toBeNull();
        doubleClick('child');
        expect(link('grandchild')).toBeTruthy();
        doubleClick('child');
        expect(link('grandchild')).toBeNull();
        doubleClick('leaf');
        expect(row('leaf').getAttribute('aria-expanded')).not.toBe('true');
        doubleClick('parent');
        expect(row('parent').getAttribute('aria-expanded')).toBe('false');
        expect(link('child')).toBeNull();
    });

    it('keeps immediate single-click navigation and expansion through navigation and tree updates', async () => {
        link('parent')!.click();
        await fixture.whenStable();
        expect(TestBed.inject(Router).url).toBe('/tasks/project/parent');
        expect(link('child')).toBeNull();
        doubleClick('parent');
        link('child')!.click();
        await fixture.whenStable();
        expect(TestBed.inject(Router).url).toBe('/tasks/project/child');
        fixture.componentRef.setInput('projects', [project('parent', [project('child', [project('grandchild')]), project('new-leaf')])]);
        fixture.detectChanges();
        expect(row('parent').getAttribute('aria-expanded')).toBe('true');
        expect(link('new-leaf')).toBeTruthy();
        expect(link('grandchild')).toBeNull();
    });

    it('synchronizes double-click with Expand all, Collapse all, chevrons and keyboard expansion', async () => {
        action('Expand all').click();
        fixture.detectChanges();
        expect(link('grandchild')).toBeTruthy();
        doubleClick('parent');
        expect(link('child')).toBeNull();
        action('Collapse all').click();
        fixture.detectChanges();
        doubleClick('parent');
        expect(link('child')).toBeTruthy();
        expect(link('grandchild')).toBeNull();
        (row('parent').querySelector('[data-pc-section="nodetogglebutton"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(link('child')).toBeNull();
        doubleClick('parent');
        expect(link('child')).toBeTruthy();
        row('parent').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }));
        fixture.detectChanges();
        expect(link('child')).toBeNull();
        row('parent').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(link('child')).toBeTruthy();
        doubleClick('parent');
        expect(link('child')).toBeNull();
    });

    it('does not toggle when Edit or Delete controls receive clicks and double-clicks', () => {
        const edited = vi.fn();
        const deleted = vi.fn();
        component.editProject.subscribe(edited);
        component.deleteProject.subscribe(deleted);
        const edit = fixture.nativeElement.querySelector('[aria-label="Edit parent"]');
        const remove = fixture.nativeElement.querySelector('[aria-label="Delete parent"]');
        for (const button of [edit, remove]) {
            button.click();
            button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        }
        fixture.detectChanges();
        expect(edited).toHaveBeenCalledExactlyOnceWith('parent');
        expect(deleted).toHaveBeenCalledExactlyOnceWith('parent');
        expect(link('child')).toBeNull();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
