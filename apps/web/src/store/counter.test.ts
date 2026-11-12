import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { useCounterStore } from './counter';

describe('counter store', () => {
    beforeEach(() => {
        useCounterStore.getState().reset();
    });

    it('increments', () => {
        useCounterStore.getState().increment();
        expect(useCounterStore.getState().count).toBe(1);
    });

    it('decrements', () => {
        useCounterStore.getState().decrement();
        expect(useCounterStore.getState().count).toBe(-1);
    });

    it('resets', () => {
        useCounterStore.getState().increment();
        useCounterStore.getState().reset();
        expect(useCounterStore.getState().count).toBe(0);
    });
});
