// Thin wrapper over GoTrue via supabase-js. No public signup on this stack (DISABLE_SIGNUP=true):
// the bishopric creates accounts from Administração (accounts service); people sign in, choose their
// own password on first sign-in, or join another ward by code.
import { supabase } from './supabase-client.js';

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
    return data.user;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(translateAuthError(error.message));
}

// First sign-in with a temporary password: the person picks their own.
export async function setOwnPassword(password) {
    const { data, error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    if (error) throw new Error(translateAuthError(error.message));
    return data.user;
}

export async function getCurrentUser() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user ?? null;
}

// Calls back with the user (or null) now and on every change.
export function onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
}

export function translateAuthError(message = '') {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials')) return 'E-mail ou palavra-passe incorretos.';
    if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado.';
    if (m.includes('rate limit')) return 'Demasiadas tentativas. Aguarde um minuto.';
    if (m.includes('signups not allowed')) return 'Não há registo público. Peça ao bispado para criar a sua conta.';
    if (m.includes('should be different')) return 'A nova palavra-passe tem de ser diferente da temporária.';
    if (m.includes('at least') || m.includes('weak')) return 'Palavra-passe demasiado curta ou fraca.';
    return 'Não foi possível entrar: ' + message;
}
