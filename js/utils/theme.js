// Theme preference: light / dark / system (default). Stored per browser.

export function applyStoredTheme() {
    try {
        const t = localStorage.getItem('agenda-theme');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
        else document.documentElement.removeAttribute('data-theme');
    } catch { /* storage unavailable */ }
}

export function setTheme(mode) {
    try {
        if (mode === 'system') localStorage.removeItem('agenda-theme');
        else localStorage.setItem('agenda-theme', mode);
    } catch { /* storage unavailable */ }
    applyStoredTheme();
}

// The theme actually showing: an explicit choice wins, otherwise the system setting.
export function isDark() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

// One-tap switch between light and dark. Returns the new mode.
export function toggleTheme() {
    const next = isDark() ? 'light' : 'dark';
    setTheme(next);
    return next;
}
