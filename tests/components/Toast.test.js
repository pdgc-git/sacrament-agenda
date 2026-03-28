import { showToast } from '../../js/components/Toast.js';

describe('Toast Notification System', () => {
    beforeEach(() => {
        // Clear DOM
        document.body.innerHTML = '';
        jest.useFakeTimers();

        // Mock requestAnimationFrame
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => cb());
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('should create a toast container if it does not exist', () => {
        expect(document.getElementById('toast-container')).toBeNull();

        showToast('Test message');

        const container = document.getElementById('toast-container');
        expect(container).not.toBeNull();
        expect(container.classList.contains('toast-container')).toBe(true);
    });

    it('should append a toast notification to the container', () => {
        showToast('Test message');

        const container = document.getElementById('toast-container');
        expect(container.children.length).toBe(1);

        const toast = container.firstChild;
        expect(toast.classList.contains('toast-notification')).toBe(true);
    });

    it('should set the correct type class and icon for success', () => {
        showToast('Success!', 'success');

        const toast = document.querySelector('.toast-notification');
        expect(toast.classList.contains('toast-success')).toBe(true);
        expect(toast.innerHTML).toContain('ph-check-circle');
    });

    it('should set the correct type class and icon for error', () => {
        showToast('Error!', 'error');

        const toast = document.querySelector('.toast-notification');
        expect(toast.classList.contains('toast-error')).toBe(true);
        expect(toast.innerHTML).toContain('ph-warning-circle');
    });

    it('should display the correct message', () => {
        const message = 'Hello, World!';
        showToast(message);

        const toast = document.querySelector('.toast-notification');
        expect(toast.innerHTML).toContain(`<span>${message}</span>`);
    });

    it('should add the "show" class in the next animation frame', () => {
        showToast('Test message');

        const toast = document.querySelector('.toast-notification');
        // Since we mocked requestAnimationFrame to execute synchronously in beforeEach
        expect(toast.classList.contains('show')).toBe(true);
    });

    it('should remove the "show" class after the specified duration', () => {
        const duration = 2000;
        showToast('Test message', 'info', duration);

        const toast = document.querySelector('.toast-notification');
        expect(toast.classList.contains('show')).toBe(true);

        // Advance time by slightly less than the duration
        jest.advanceTimersByTime(duration - 1);
        expect(toast.classList.contains('show')).toBe(true);

        // Advance time exactly to the duration
        jest.advanceTimersByTime(1);
        expect(toast.classList.contains('show')).toBe(false);
    });

    it('should completely remove the toast element after transition ends', () => {
        showToast('Test message', 'info', 3000);

        const container = document.getElementById('toast-container');
        const toast = document.querySelector('.toast-notification');

        jest.advanceTimersByTime(3000);
        expect(toast.classList.contains('show')).toBe(false);

        // Trigger the transitionend event manually to simulate CSS transition completion
        const transitionEvent = new Event('transitionend');
        toast.dispatchEvent(transitionEvent);

        // The toast element should be removed from the container
        expect(container.contains(toast)).toBe(false);
    });

    it('should clean up the container if it is empty after removing a toast', () => {
        showToast('Test message', 'info', 3000);

        const toast = document.querySelector('.toast-notification');
        jest.advanceTimersByTime(3000);

        const transitionEvent = new Event('transitionend');
        toast.dispatchEvent(transitionEvent);

        // The container should be removed from the body because it's empty
        expect(document.getElementById('toast-container')).toBeNull();
    });

    it('should not clean up the container if there are other toasts remaining', () => {
        showToast('Message 1', 'info', 3000);
        showToast('Message 2', 'info', 5000);

        const container = document.getElementById('toast-container');
        expect(container.children.length).toBe(2);

        const firstToast = container.children[0];
        jest.advanceTimersByTime(3000);

        const transitionEvent = new Event('transitionend');
        firstToast.dispatchEvent(transitionEvent);

        // The container should still exist because there is another toast
        expect(document.getElementById('toast-container')).not.toBeNull();
        expect(container.children.length).toBe(1);
    });
});
