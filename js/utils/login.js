// Logins can be a real e-mail or just a username. GoTrue needs an e-mail, so a username is stored as
// <username>@utilizador.agenda.invalid (.invalid is reserved and never delivers; the app sends no
// e-mail anyway). Same rule in server/agenda-accounts/agenda_accounts.py.

export const USERNAME_DOMAIN = 'utilizador.agenda.invalid';
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

// What the person typed at sign-in -> the e-mail GoTrue knows.
export function toLoginEmail(input) {
    const v = String(input || '').trim().toLowerCase();
    return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`;
}

// Stored e-mail -> what to show people: the username for username logins, else the e-mail.
export function displayLogin(email) {
    const v = String(email || '');
    return v.endsWith('@' + USERNAME_DOMAIN) ? v.slice(0, -(USERNAME_DOMAIN.length + 1)) : v;
}

export function isUsernameLogin(email) {
    return String(email || '').endsWith('@' + USERNAME_DOMAIN);
}

// "Ana Paula Jesus" -> "ana.jesus": first and last name, no accents, for the Criar conta form.
export function suggestUsername(name) {
    const parts = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    const u = (parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0]).slice(0, 30);
    return u.length >= 3 ? u : '';
}
