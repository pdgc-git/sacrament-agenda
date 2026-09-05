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
