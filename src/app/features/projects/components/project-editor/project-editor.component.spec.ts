import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectEditorComponent } from './project-editor.component';
import { vi } from 'vitest';
import type { Project, ProjectNode } from '@/features/projects/models/project.model';

const project = (id: string, parent: string | null = null): Project => ({
  id, name: id, user_id: 'owner', parent_project_id: parent, created_at: '', updated_at: '',
});
const node = (item: Project, children: ProjectNode[] = []): ProjectNode => ({ project: item, children });

describe('ProjectEditorComponent', () => {
  let component: ProjectEditorComponent;
  let fixture: ComponentFixture<ProjectEditorComponent>;

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    await TestBed.configureTestingModule({
      imports: [ProjectEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProjectEditorComponent);
    component = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); vi.unstubAllGlobals(); });

  const nameInput = () => fixture.nativeElement.querySelector('#project-name') as HTMLInputElement;
  const saveButton = () => fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  const parentLabel = () => fixture.nativeElement.querySelector('.p-treeselect-label')?.textContent?.trim();
  async function settle() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function typeName(value: string) {
    nameInput().value = value; nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  }
  function submit() {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
  async function showParents() {
    fixture.nativeElement.querySelector('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    await settle();
  }
  async function selectParent(label: string) {
    await showParents();
    const item = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).find(item => item.getAttribute('aria-label') === label)!;
    expect(item).toBeTruthy();
    (item.querySelector('.p-tree-node-content') as HTMLElement).click(); await settle();
  }
  async function clearParent() {
    fixture.nativeElement.querySelector('.p-treeselect-clear-icon').dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses styled actions while preserving cancel and valid form submission', () => {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('footer.form-actions button')
    ) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every(button => button.classList.contains('p-button'))).toBe(true);
    expect(buttons[0].textContent?.trim()).toBe('Cancel');
    expect(buttons[1].disabled).toBe(true);

    const onCancel = vi.fn();
    const onSave = vi.fn();
    component.cancel.subscribe(onCancel);
    component.save.subscribe(onSave);
    buttons[0].click();
    expect(onCancel).toHaveBeenCalledOnce();

    const name = fixture.nativeElement.querySelector('input[formcontrolname="name"]') as HTMLInputElement;
    name.value = 'Home';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(buttons[1].disabled).toBe(false);
    buttons[1].click();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ name: 'Home', parentProjectId: null });
  });
  it('preserves an unsaved name when available projects refresh for the same editing session', async () => {
    const editing = project('Edited');
    fixture.componentRef.setInput('project', editing);
    fixture.componentRef.setInput('projects', [node(editing), node(project('Parent'))]);
    await fixture.whenStable();
    const name = fixture.nativeElement.querySelector('#project-name') as HTMLInputElement;
    name.value = 'Unsaved name'; name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.componentRef.setInput('projects', [node({ ...editing }), node({ ...project('Parent'), name: 'Renamed parent' })]);
    await fixture.whenStable();
    expect(name.value).toBe('Unsaved name');
  });

  it('keeps a chosen parent by ID, updates its label, and submits both drafts after replacing node objects', async () => {
    const editing = project('Edited', 'Original parent');
    fixture.componentRef.setInput('project', editing);
    fixture.componentRef.setInput('projects', [node(editing), node(project('Original parent')), node(project('Chosen parent'))]);
    await settle();
    const saved = vi.fn(); component.save.subscribe(saved);
    typeName(' Unsaved name '); await selectParent('Chosen parent');
    fixture.componentRef.setInput('project', { ...editing, name: 'Remote name' });
    fixture.componentRef.setInput('projects', [node({ ...editing }), node(project('Original parent')), node({ ...project('Chosen parent'), name: 'Refreshed choice' })]);
    await settle();
    expect(nameInput().value).toBe(' Unsaved name ');
    expect(parentLabel()).toBe('Refreshed choice');
    await showParents();
    const selected = document.querySelector('[role="treeitem"][aria-label="Refreshed choice"]');
    expect(selected?.getAttribute('aria-selected')).toBe('true');
    fixture.nativeElement.querySelector('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await settle(); submit();
    expect(saved).toHaveBeenCalledExactlyOnceWith({ name: 'Unsaved name', parentProjectId: 'Chosen parent' });
  });

  it('preserves an explicitly cleared parent across same-project snapshots and options refresh', async () => {
    const editing = project('Edited', 'Parent');
    fixture.componentRef.setInput('project', editing);
    fixture.componentRef.setInput('projects', [node(editing), node(project('Parent'))]); await settle();
    await clearParent(); typeName('Draft');
    fixture.componentRef.setInput('project', { ...editing });
    fixture.componentRef.setInput('projects', [node({ ...editing }), node(project('Parent'))]); await settle();
    const saved = vi.fn(); component.save.subscribe(saved); submit();
    expect(saved).toHaveBeenCalledExactlyOnceWith({ name: 'Draft', parentProjectId: null });
  });

  it('initializes a different project and then a create session instead of inheriting prior drafts', async () => {
    fixture.componentRef.setInput('project', project('First', 'Parent'));
    fixture.componentRef.setInput('projects', [node(project('First')), node(project('Second')), node(project('Parent'))]); await settle();
    typeName('First draft'); await selectParent('Second');
    fixture.componentRef.setInput('project', project('Second', 'Parent')); await settle();
    expect(nameInput().value).toBe('Second'); expect(parentLabel()).toBe('Parent');
    typeName('Second draft');
    fixture.componentRef.setInput('project', null); await settle();
    expect(nameInput().value).toBe(''); expect(parentLabel()).toBe('None (top-level project)');
    expect(saveButton().disabled).toBe(true);
  });

  it('preserves name and parent drafts while disabled, after an options refresh, and when enabled again', async () => {
    fixture.componentRef.setInput('project', project('Edited'));
    fixture.componentRef.setInput('projects', [node(project('Edited')), node(project('Parent'))]); await settle();
    typeName('Draft'); await selectParent('Parent');
    fixture.componentRef.setInput('disabled', true); await settle();
    fixture.componentRef.setInput('projects', [node(project('Edited')), node({ ...project('Parent'), name: 'New label' })]); await settle();
    const saved = vi.fn(); component.save.subscribe(saved); submit();
    expect(saved).not.toHaveBeenCalled(); expect(nameInput().disabled).toBe(true);
    fixture.componentRef.setInput('disabled', false); await settle();
    expect(nameInput().value).toBe('Draft'); expect(parentLabel()).toBe('New label');
    submit(); expect(saved).toHaveBeenCalledExactlyOnceWith({ name: 'Draft', parentProjectId: 'Parent' });
    fixture.componentRef.setInput('disabled', true); await settle();
    fixture.componentRef.setInput('projects', [node(project('Edited'))]); await settle();
    fixture.componentRef.setInput('disabled', false); await settle();
    expect(nameInput().value).toBe('Draft'); expect(saveButton().disabled).toBe(true);
    submit(); expect(saved).toHaveBeenCalledTimes(1);
  });

  for (const reason of ['removed', 'descendant'] as const) {
    it(`retains the draft and blocks a parent that becomes ${reason} until it is explicitly resolved`, async () => {
      const editing = project('Edited'); const parent = project('Parent');
      fixture.componentRef.setInput('project', editing);
      fixture.componentRef.setInput('projects', [node(editing), node(parent), node(project('Other'))]); await settle();
      typeName('Draft'); await selectParent('Parent');
      fixture.componentRef.setInput('projects', reason === 'removed' ? [node(editing), node(project('Other'))] : [node(editing, [node(parent)]), node(project('Other'))]);
      // Submission before the options synchronization effect must also be safe.
      const saved = vi.fn(); component.save.subscribe(saved); submit(); await settle();
      expect(saved).not.toHaveBeenCalled(); expect(saveButton().disabled).toBe(true);
      expect(nameInput().value).toBe('Draft'); expect(parentLabel()).toBe('Parent');
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Choose another parent or clear');
      expect(fixture.nativeElement.querySelector('[role="combobox"]').getAttribute('aria-describedby')).toBe('parent-project-error');
      if (reason === 'removed') await clearParent(); else await selectParent('Other');
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
      submit(); expect(saved).toHaveBeenCalledExactlyOnceWith({ name: 'Draft', parentProjectId: reason === 'removed' ? null : 'Other' });
    });
  }

  it('keeps an initially unavailable parent invalid and rebinds it when the choices finish loading', async () => {
    fixture.componentRef.setInput('project', project('Edited', 'Parent')); await settle();
    expect(parentLabel()).toBe('Unavailable project'); expect(saveButton().disabled).toBe(true);
    typeName('Loading draft');
    fixture.componentRef.setInput('projects', [node(project('Edited')), node(project('Parent'))]); await settle();
    expect(nameInput().value).toBe('Loading draft'); expect(parentLabel()).toBe('Parent');
    expect(saveButton().disabled).toBe(false);
    const saved = vi.fn(); component.save.subscribe(saved); submit();
    expect(saved).toHaveBeenCalledExactlyOnceWith({ name: 'Loading draft', parentProjectId: 'Parent' });
  });

  it('excludes the edited branch and preserves required/whitespace validation', async () => {
    const edited = project('Edited');
    fixture.componentRef.setInput('project', edited);
    fixture.componentRef.setInput('projects', [node(edited, [node(project('Child'), [node(project('Grandchild'))])]), node(project('Other'))]); await settle();
    await showParents();
    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).map(item => item.getAttribute('aria-label'));
    expect(labels).toEqual(['Other']);
    const saved = vi.fn(); component.save.subscribe(saved); typeName('   '); submit(); await settle();
    expect(saved).not.toHaveBeenCalled(); expect(saveButton().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Project name is required.');
    fixture.componentRef.setInput('projects', [node(edited), node({ ...project('Other'), name: 'Updated other' })]); await settle();
    expect(nameInput().value).toBe('   ');
    expect(fixture.nativeElement.textContent).toContain('Project name is required.');
  });

});
