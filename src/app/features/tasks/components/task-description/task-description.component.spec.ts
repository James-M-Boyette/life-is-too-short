import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TaskDescriptionComponent } from './task-description.component';
import { Component, signal } from '@angular/core';

@Component({
    standalone: true,
    imports: [TaskDescriptionComponent],
    template: '<app-task-description [source]="source()" taskId="test" />',
})
class DescriptionHost {
    readonly source = signal('');
}

function render(source: string) {
    const fixture = TestBed.createComponent(DescriptionHost);
    fixture.componentInstance.source.set(source);
    fixture.detectChanges();
    return fixture;
}

describe('Markdown task descriptions', () => {
    it('renders paragraphs, line breaks, both list types, emphasis and links', () => {
        const fixture = render('**Bold** and *italic*\nsecond line\n\n- First\n- Second\n\n1. Ordered\n2. Also ordered\n\n[Example](https://example.com)');
        const el = fixture.nativeElement;
        el.querySelector('button')?.click();
        fixture.detectChanges();
        expect(el.querySelector('strong').textContent).toBe('Bold');
        expect(el.querySelector('em').textContent).toBe('italic');
        expect(el.querySelector('br')).toBeTruthy();
        expect(el.querySelectorAll('ul li')).toHaveLength(2);
        expect(el.querySelectorAll('ol li')).toHaveLength(2);
        expect(el.querySelector('a').getAttribute('href')).toBe('https://example.com');
        expect(el.querySelector('a').getAttribute('rel')).toContain('noopener');
        expect(el.querySelector('a').getAttribute('target')).toBe('_blank');
    });

    it.each([
        '<script>alert(1)</script><img src=x onerror=alert(1)>',
        '<svg onload=alert(1)><a href="javascript:alert(1)">test</a></svg>',
        '[unsafe](javascript:alert%281%29)',
        '[unsafe](jav&#x61;script:alert%281%29)',
        '[unsafe](data:text/html,test)',
        '[unsafe](file:///etc/passwd)',
        '![tracking](https://example.com/tracker.png)',
        '<iframe src="https://example.com"></iframe>',
    ])('keeps untrusted input inert: %s', source => {
        const fixture = render(source);
        const el = fixture.nativeElement;
        expect(el.querySelector('script, img, svg, iframe, object, embed, [onerror], [onload]')).toBeNull();
        expect(el.querySelector('a[href^="javascript:"], a[href^="data:"], a[href^="file:"], a[href^="unsafe:"]')).toBeNull();
        expect(fixture.componentInstance.source()).toBe(source);
    });

    it('uses an accessible excerpt for long content without hidden focusable links, then reveals full formatting', () => {
        const source = '**Full description**\n\n' + 'Long text '.repeat(80) + '\n\n[End](https://example.com)';
        const fixture = render(source);
        const el = fixture.nativeElement;
        const toggle = el.querySelector('button');
        expect(toggle.textContent).toContain('View full description');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(el.querySelector('a')).toBeNull();
        expect(el.querySelector('.description-excerpt').textContent.length).toBeLessThanOrEqual(241);
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(el.querySelector('strong').textContent).toBe('Full description');
        expect(el.querySelector('a').textContent).toBe('End');
        toggle.click();
        fixture.detectChanges();
        expect(el.querySelector('a')).toBeNull();
    });

    it('wraps long strings and code while retaining all source text', () => {
        const source = 'x'.repeat(800) + '\n\n```\n' + 'y'.repeat(800) + '\n```';
        const fixture = render(source);
        fixture.nativeElement.querySelector('button').click();
        fixture.detectChanges();
        expect(getComputedStyle(fixture.nativeElement.querySelector('app-task-description')).overflowWrap).toBe('anywhere');
        expect(getComputedStyle(fixture.nativeElement.querySelector('pre')).whiteSpace).toBe('pre-wrap');
        expect(fixture.nativeElement.querySelector('code').textContent).toContain('y'.repeat(800));
        expect(fixture.componentInstance.source()).toBe(source);
    });
});
