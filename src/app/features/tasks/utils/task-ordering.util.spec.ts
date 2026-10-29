import { describe, expect, it } from 'vitest';

import { calculateTaskPosition } from './task-ordering.util';

describe('calculateTaskPosition', () => {
    it('assigns an initial position', () => {
        expect(calculateTaskPosition(null, null)).toBe(1000);
    });

    it('places a task before the first task', () => {
        expect(calculateTaskPosition(null, 1000)).toBe(0);
    });

    it('places a task after the last task', () => {
        expect(calculateTaskPosition(3000, null)).toBe(4000);
    });

    it('places a task between two tasks', () => {
        expect(calculateTaskPosition(1000, 2000)).toBe(1500);
    });

    it('rejects reversed ordering boundaries', () => {
        expect(() => calculateTaskPosition(2000, 1000)).toThrow();
    });

    it('rejects identical ordering boundaries', () => {
        expect(() => calculateTaskPosition(1000, 1000)).toThrow();
    });
});
