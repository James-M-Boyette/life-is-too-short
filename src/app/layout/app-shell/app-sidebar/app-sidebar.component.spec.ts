import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AppSidebarComponent } from './app-sidebar.component';
import type { ProjectNode } from '@/features/projects/models/project.model';

@Component({ standalone: true, template: '' })
class ProjectRoute {}

function project(id: string, children: ProjectNode[] = []): ProjectNode {
    return { project: { id, name: id, user_id: 'user', parent_project_id: null, created_at: '', updated_at: '' }, children };
}
const hierarchy = () => [project('parent', [project('child', [project('grandchild')]), project('leaf')]), project('other', [project('hidden')])];

describe('AppSidebarComponent', () => {
    let fixture: ComponentFixture<AppSidebarComponent>;
    const link = (id: string): HTMLAnchorElement | null => fixture.nativeElement.querySelector(`a[href="/tasks/project/${id}"]`);
    const row = (id: string): HTMLElement => link(id)!.closest('[role="treeitem"]')!;
    const button = (id: string): HTMLButtonElement | null => link(id)!.closest('.project-tree-item')!.querySelector('.project-toggle');
    const toggle = (id: string) => {
        button(id)!.click();
        fixture.detectChanges();
    };
    const action = (label: string) => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find(button => button.textContent?.trim() === label)!;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AppSidebarComponent],
            providers: [provideRouter([{ path: 'tasks/project/:id', component: ProjectRoute }])],
        }).compileComponents();
        fixture = TestBed.createComponent(AppSidebarComponent);
        fixture.componentRef.setInput('projects', hierarchy());
        await fixture.whenStable();
    });

    afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); });

    it('orders the name, optional chevron and More actions consistently for pointer and keyboard users', () => {
        const controls = (id: string) => Array.from(link(id)!.closest('.project-tree-item')!.children)
            .map(control => control.tagName === 'A' ? 'name' : control.className);
        expect(controls('parent')).toEqual(['name', 'project-toggle', 'project-more']);
        toggle('parent');
        expect(controls('child')).toEqual(['name', 'project-toggle', 'project-more']);
        expect(controls('leaf')).toEqual(['name', 'project-more']);
        expect(link('parent')!.closest('.project-tree-item')!.querySelector('[tabindex]')).toBeNull();
    });

    it('navigates on a name click without expanding and retains active styling', async () => {
        const navigated = vi.fn();
        fixture.componentInstance.navigated.subscribe(navigated);
        link('parent')!.click();
        await fixture.whenStable();
        expect(TestBed.inject(Router).url).toBe('/tasks/project/parent');
        expect(navigated).toHaveBeenCalledOnce();
        expect(link('child')).toBeNull();
        expect(link('parent')!.classList.contains('active')).toBe(true);
        expect(link('parent')!.getAttribute('aria-current')).toBe('page');
        link('parent')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        fixture.detectChanges();
        expect(link('child')).toBeNull();
    });

    it('toggles nested branches independently without navigation or drawer closure', () => {
        const navigated = vi.fn();
        fixture.componentInstance.navigated.subscribe(navigated);
        toggle('parent');
        expect(link('child')).toBeTruthy();
        expect(link('grandchild')).toBeNull();
        toggle('child');
        expect(link('grandchild')).toBeTruthy();
        toggle('parent');
        expect(link('child')).toBeNull();
        toggle('parent');
        expect(link('grandchild')).toBeTruthy();
        toggle('child');
        expect(link('grandchild')).toBeNull();
        expect(button('leaf')).toBeNull();
        expect(navigated).not.toHaveBeenCalled();
        expect(TestBed.inject(Router).url).toBe('/');
    });

    it('supports Expand all, Collapse all and existing tree arrow-key navigation', () => {
        action('Expand all').click();
        fixture.detectChanges();
        expect(link('grandchild')).toBeTruthy();
        expect(link('hidden')).toBeTruthy();
        action('Collapse all').click();
        fixture.detectChanges();
        expect(link('child')).toBeNull();
        expect(link('hidden')).toBeNull();
        row('parent').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
        fixture.detectChanges();
        expect(link('child')).toBeTruthy();
        row('parent').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }));
        fixture.detectChanges();
        expect(link('child')).toBeNull();
    });

    const more = (id: string): HTMLButtonElement => link(id)!.closest('.project-tree-item')!.querySelector('.project-more')!;
    const menuAction = (label: string): HTMLElement => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"] a'))
        .find(item => item.textContent?.trim() === label)!;

    it('uses one menu and emits Edit/Delete intentions without navigation or expansion', async () => {
        document.body.appendChild(fixture.nativeElement);
        const edit = vi.fn(), remove = vi.fn(), navigated = vi.fn();
        fixture.componentInstance.editProject.subscribe(edit);
        fixture.componentInstance.deleteProject.subscribe(remove);
        fixture.componentInstance.navigated.subscribe(navigated);
        action('Expand all').click(); await fixture.whenStable();
        expect(fixture.nativeElement.querySelectorAll('p-menu')).toHaveLength(1);
        more('child').click(); await fixture.whenStable();
        expect(link('grandchild')).toBeTruthy();
        expect(menuAction('Edit project')).toBeTruthy();
        menuAction('Edit project').click(); await fixture.whenStable();
        expect(edit).toHaveBeenCalledExactlyOnceWith('child');
        await vi.waitFor(() => expect(more('child').getAttribute('aria-expanded')).toBe('false'));
        more('parent').click(); await fixture.whenStable();
        const deletion = menuAction('Delete project');
        expect(deletion.closest('[role="menuitem"]')?.getAttribute('style')).toContain('--p-menu-item-color: var(--color-status-danger)');
        deletion.click(); await fixture.whenStable();
        expect(remove).toHaveBeenCalledExactlyOnceWith('parent');
        expect(navigated).not.toHaveBeenCalled();
        expect(TestBed.inject(Router).url).toBe('/');
    });

    it('switches the shared menu context and activates the selected project through the keyboard', async () => {
        document.body.appendChild(fixture.nativeElement);
        const edit = vi.fn();
        fixture.componentInstance.editProject.subscribe(edit);
        more('parent').click(); await fixture.whenStable();
        more('other').click(); await fixture.whenStable();
        await vi.waitFor(() => expect(more('other').getAttribute('aria-expanded')).toBe('true'));
        await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('menu'));
        const menu = document.activeElement!;
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await fixture.whenStable();
        expect(edit).toHaveBeenCalledExactlyOnceWith('other');
    });

    it('dismisses with Escape and restores the trigger without bubbling into a surrounding drawer', async () => {
        document.body.appendChild(fixture.nativeElement);
        more('parent').click(); await fixture.whenStable();
        await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('menu'));
        const bubbled = vi.fn();
        document.addEventListener('keydown', bubbled);
        document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        await fixture.whenStable();
        await vi.waitFor(() => expect(more('parent').getAttribute('aria-expanded')).toBe('false'));
        document.removeEventListener('keydown', bubbled);
        expect(bubbled).not.toHaveBeenCalled();
        expect(more('parent').getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(more('parent'));
    });

    it('fails safely if the selected project disappears, and uses the next project context on reopening', async () => {
        document.body.appendChild(fixture.nativeElement);
        const remove = vi.fn();
        fixture.componentInstance.deleteProject.subscribe(remove);
        more('parent').click(); await fixture.whenStable();
        const stale = menuAction('Delete project');
        fixture.componentRef.setInput('projects', [project('other')]); await fixture.whenStable();
        stale.click(); await fixture.whenStable();
        expect(remove).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
        more('other').click(); await fixture.whenStable();
        menuAction('Delete project').click(); await fixture.whenStable();
        expect(remove).toHaveBeenCalledExactlyOnceWith('other');
    });

    it('expands only routed ancestors after late data arrival and respects subsequent manual collapse', async () => {
        fixture.componentRef.setInput('projects', []);
        await TestBed.inject(Router).navigateByUrl('/tasks/project/grandchild');
        await fixture.whenStable();
        fixture.componentRef.setInput('projects', hierarchy());
        await fixture.whenStable();
        expect(link('grandchild')).toBeTruthy();
        expect(link('hidden')).toBeNull();
        toggle('parent');
        fixture.componentRef.setInput('projects', [...hierarchy(), project('new')]);
        await fixture.whenStable();
        expect(link('child')).toBeNull();
        await TestBed.inject(Router).navigateByUrl('/tasks/project/grandchild?sort=name');
        await fixture.whenStable();
        expect(link('child')).toBeNull();
        await TestBed.inject(Router).navigateByUrl('/tasks/project/child');
        await fixture.whenStable();
        expect(link('child')).toBeTruthy();
    });

    it('reopens a manually collapsed ancestor when navigating to a sibling with the same path', async () => {
        const router = TestBed.inject(Router);
        await router.navigateByUrl('/tasks/project/child');
        await fixture.whenStable();
        expect(link('child')).toBeTruthy();

        toggle('parent');
        expect(link('leaf')).toBeNull();

        await router.navigateByUrl('/tasks/project/leaf');
        await fixture.whenStable();
        expect(link('leaf')).toBeTruthy();
    });

    it('preserves expansion through project navigation and hierarchy refresh', async () => {
        toggle('parent');
        toggle('child');
        link('leaf')!.click();
        await fixture.whenStable();
        fixture.componentRef.setInput('projects', hierarchy());
        await fixture.whenStable();
        expect(link('grandchild')).toBeTruthy();
        expect(link('hidden')).toBeNull();
    });

    it('preserves shell expansion requests without repeatedly overriding user collapse', async () => {
        fixture.componentRef.setInput('expandProjectRequest', { projectId: 'parent' });
        await fixture.whenStable();
        expect(link('child')).toBeTruthy();
        toggle('parent');
        await fixture.whenStable();
        expect(link('child')).toBeNull();
    });

    it('keeps modified clicks as browser links without requesting drawer closure', async () => {
        const navigated = vi.fn();
        fixture.componentInstance.navigated.subscribe(navigated);
        for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
            link('parent')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }));
        }
        await fixture.whenStable();
        expect(navigated).not.toHaveBeenCalled();
        expect(TestBed.inject(Router).url).toBe('/');
        expect(link('child')).toBeNull();
    });

    it('uses a native accessible button and isolates Enter/Space from tree keyboard handling', () => {
        expect(button('parent')!.type).toBe('button');
        expect(button('parent')!.getAttribute('aria-label')).toBe('Expand parent');
        expect(button('parent')!.getAttribute('aria-expanded')).toBe('false');
        const bubbled = vi.fn();
        row('parent').addEventListener('keydown', bubbled);
        for (const key of ['Enter', ' ']) {
            button('parent')!.dispatchEvent(new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true }));
            link('parent')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        }
        expect(bubbled).not.toHaveBeenCalled();
        toggle('parent');
        expect(button('parent')!.getAttribute('aria-expanded')).toBe('true');
        expect(button('parent')!.getAttribute('aria-label')).toBe('Collapse parent');
        expect(row('parent').getAttribute('aria-expanded')).toBe('true');
    });
});
