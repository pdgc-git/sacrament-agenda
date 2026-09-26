/**
 * @jest-environment jsdom
 */
import { isDark, toggleTheme, setTheme } from '../js/utils/theme.js';

describe('theme toggle', () => {
    beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

    test('follows the system when nothing is chosen', () => {
        window.matchMedia = () => ({ matches: true });
        expect(isDark()).toBe(true);
        window.matchMedia = () => ({ matches: false });
        expect(isDark()).toBe(false);
    });

    test('toggles from the theme that is showing and remembers it', () => {
        window.matchMedia = () => ({ matches: true });
        expect(toggleTheme()).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(localStorage.getItem('agenda-theme')).toBe('light');
        expect(toggleTheme()).toBe('dark');
        expect(isDark()).toBe(true);
    });

    test('system mode clears the stored choice', () => {
        setTheme('dark');
        setTheme('system');
        expect(localStorage.getItem('agenda-theme')).toBeNull();
        expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });
});
