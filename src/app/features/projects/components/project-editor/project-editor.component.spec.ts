import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectEditorComponent } from './project-editor.component';
import { vi } from 'vitest';

describe('ProjectEditorComponent', () => {
  let component: ProjectEditorComponent;
  let fixture: ComponentFixture<ProjectEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProjectEditorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

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
});
