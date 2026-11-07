import { Component, signal, HostListener } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import MyPreset from '../src/assets/primeng-style-preset';
import { TaskRowComponent } from '../src/app/features/tasks/components/task-row/task-row.component';
import { CdkDropList, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import type { Task } from '../src/app/features/tasks/models/tasks.model';
@Component({selector:'acceptance-root',standalone:true,imports:[TaskRowComponent,CdkDropList],template:`
<h1>Isolated task-card acceptance</h1><p>Synthetic tasks only. No backend or persistence.</p>
<label>Card width <select aria-label="Card width" [value]="width()" (change)="width.set(+$any($event.target).value)">@for(w of [280,380,569,571,800];track w){<option [value]="w">{{w}}</option>}</select></label>
<output id="result">{{result()}}</output>
<div class="board" [style.width.px]="width()"><div cdkDropList (cdkDropListDropped)="drop($event)" class="list">
@for(task of tasks();track task.id){<app-task-row [task]="task" [draggable]="true" [projects]="projects" (projectChange)="assign($event)" (contentSaved)="save($event)" (toggleDone)="result.set('completion click')" (scheduleRequested)="result.set('schedule '+$event.field)" />}
</div></div><output id="drag-metrics">{{metrics()}}</output><output id="touch-metrics">{{touch()}}</output><div style="height:1200px">Scroll test area</div>`,styles:[`:host{display:block;padding:24px;font-family:Arial,sans-serif}h1{font-size:20px}.board{background:var(--color-surface-panel);padding:16px;margin-top:16px;max-width:calc(100vw - 80px)}.list.cdk-drop-list-dragging{--task-drag-cursor:grabbing;cursor:grabbing}.list{display:flex;flex-direction:column;gap:12px}output{display:block;white-space:pre-wrap;font-size:12px;margin-top:12px}`]})
class Acceptance {
width=signal(800); result=signal('Ready'); metrics=signal(''); touch=signal('No touch events');
@HostListener('document:touchstart') touchStart(){this.touch.set('touchstart received')}
@HostListener('window:scroll') scrolled(){this.touch.set('scrollY '+window.scrollY)}
@HostListener('document:mousemove',['$event']) sample(event:MouseEvent){const preview=document.querySelector('.cdk-drag-preview') as HTMLElement; const placeholder=document.querySelector('.cdk-drag-placeholder') as HTMLElement;if(preview && placeholder){const p=preview.getBoundingClientRect(),g=placeholder.getBoundingClientRect();this.metrics.set(JSON.stringify({previewWidth:preview.offsetWidth,previewHeight:preview.offsetHeight,rotate:getComputedStyle(preview).rotate,placeholderWidth:g.width,placeholderHeight:g.height,visibility:getComputedStyle(placeholder.querySelector('.task-card-content')!).visibility,fill:getComputedStyle(placeholder).backgroundColor,border:getComputedStyle(placeholder).borderColor,cursor:getComputedStyle(document.elementFromPoint(event.clientX,event.clientY)!).cursor,title:getComputedStyle(preview.querySelector('.title-btn')!).whiteSpace}));}}

projects=[{project:{id:'home',name:'Household: A long project name',user_id:'test',parent_project_id:null,created_at:'',updated_at:''},children:[{project:{id:'nested',name:'Nested project',user_id:'test',parent_project_id:'home',created_at:'',updated_at:''},children:[]}]}];
tasks=signal<Task[]>(['Return Amazon packages before the return deadline','Second task'].map((title,i)=>({id:'test'+i,title,description:i?'Short description':'Print labels, pack items, and stop by UPS after work. **Selectable text** with [a link](https://example.com).',user_id:'test',project_id:'home',planned_date:'2026-11-06',due_date:'2026-11-05',is_done:false,status:'todo',due_at:null,project_position:1000,planned_position:1000,created_at:'',updated_at:''} as Task)));
drop(e:CdkDragDrop<any>){this.tasks.update(items=>{const next=[...items];moveItemInArray(next,e.previousIndex,e.currentIndex);return next});this.result.set('drop '+e.previousIndex+' -> '+e.currentIndex)}
assign(e:any){this.tasks.update(items=>items.map(t=>t.id===e.task.id?{...t,project_id:e.projectId}:t));this.result.set('project '+e.projectId)}
save(e:any){this.result.set('content output (no persistence)')}
}
bootstrapApplication(Acceptance,{providers:[provideRouter([]),providePrimeNG({theme:{preset:MyPreset,options:{darkModeSelector:'.app-dark'}}})]});
