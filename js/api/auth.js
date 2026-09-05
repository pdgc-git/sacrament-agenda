// Thin wrapper over GoTrue via supabase-js. No public signup on this stack (DISABLE_SIGNUP=true):
// accounts are created by the bishopric out-of-band, users only sign in and join a ward by code.
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
    return 'Não foi possível entrar: ' + message;
}
