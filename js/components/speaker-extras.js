// Per-speaker extras shared by Plano and Domingo: a topic field that grows to show the whole
// topic, the talk's link (search on the Church site, open, or paste one), and a ready-made
// invitation message sent through the phone's share sheet (WhatsApp, SMS, …) or the clipboard.
import { escapeHtml } from '../utils/security.js';
import { formatDateLong } from '../utils/meeting.js';
import { showToast } from './Toast.js';

const SEARCH_BASE = 'https://www.churchofjesuschrist.org/search?lang=por&query=';
const MONTHS = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';
const DATE_PART = new RegExp(`^(?:(?:${MONTHS})\\.?\\s*(?:de\\s*)?\\d{4}|\\d{4})$`, 'i');
const AUTHOR_PART = /^(?:elder|élder|irmã|irma|presidente|pres\.|bispo|sister)\b/i;
const SOURCE_PART = new RegExp(`^(?:força dos jovens|forca dos jovens|liahona|guia força dos jovens)(?:[\\s,]+(?:de\\s*)?(?:${MONTHS})\\.?\\s*(?:de\\s*)?\\d{4})?$`, 'i');
const PLACEHOLDER = /^(?:tema livre|livre|tbd|testemunho|-+)$/i;

// The talk title out of a free-text topic like
// `Elder Holland - "E agora vejo" - Outubro 2025` → `E agora vejo`.
// Returns '' when there's nothing worth searching (e.g. "Tema Livre").
export function topicSearchQuery(topic) {
    const t = String(topic || '').trim();
    if (!t || PLACEHOLDER.test(t)) return '';
    const quoted = t.match(/["“«]([^"”»]{3,})["”»]/);
    if (quoted) return quoted[1].trim();
    const parts = t.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
    const kept = parts.filter(p => !DATE_PART.test(p) && !SOURCE_PART.test(p) && !AUTHOR_PART.test(p));
    const pool = kept.length ? kept : parts;
    // Strip a trailing "- Força dos Jovens Outubro 2026"-style source glued to the title.
    const best = pool.reduce((a, b) => (b.length > a.length ? b : a), '');
    return best.replace(new RegExp(`\\s+(?:força dos jovens|liahona).*$`, 'i'), '').trim() || best;
}

export function topicSearchUrl(topic) {
    const q = topicSearchQuery(topic);
    return q ? SEARCH_BASE + encodeURIComponent(q) : '';
}

// Only http(s) links are kept; anything else is dropped.
export function cleanLink(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    const withScheme = /^https?:\/\//i.test(v) ? v : (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? 'https://' + v : '');
    try { return withScheme ? new URL(withScheme).href : ''; } catch { return ''; }
}

export function inviteMessage(speaker, date) {
    const first = String(speaker.name || '').trim().split(/\s+/)[0] || '';
    const lines = [
        `Olá${first ? ' ' + first : ''}! Gostaríamos de te convidar a discursar na reunião sacramental de domingo, ${formatDateLong(date)}.`,
    ];
    const topic = String(speaker.topic || '').trim();
    if (topic && !PLACEHOLDER.test(topic)) lines.push(`Tema: ${topic}`);
    else if (topic && /livre/i.test(topic)) lines.push('O tema é livre.');
    if (speaker.topic_url) lines.push(speaker.topic_url);
    lines.push('Podes confirmar se estás disponível? Obrigado!');
    return lines.join('\n');
}

// Topic textarea + action row. `attrs` carries the caller's data-* attributes (e.g. data-d).
export function speakerExtrasHtml(s, i, attrs = '') {
    const link = s.topic_url || '';
    const search = topicSearchUrl(s.topic);
    return `<textarea class="topic-input" rows="1" ${attrs} data-f="topic" data-i="${i}" placeholder="tema" aria-label="Tema">${escapeHtml(s.topic || '')}</textarea>
        <div class="spk-actions">
            ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" title="${escapeHtml(link)}">Abrir discurso ↗</a>`
                : `<a data-search href="${escapeHtml(search || '#')}" ${search ? '' : 'hidden'} target="_blank" rel="noopener" title="Procurar o tema na Biblioteca do Evangelho">Procurar ↗</a>`}
            <button type="button" class="link-btn" ${attrs} data-act="set-link" data-i="${i}">${link ? 'Mudar link' : 'Colar link'}</button>
            <button type="button" class="link-btn" ${attrs} data-act="invite" data-i="${i}">Convite</button>
        </div>`;
}

// Read-only topic: text plus the link when there is one.
export function topicReadHtml(s) {
    if (!s.topic && !s.topic_url) return '';
    const link = s.topic_url ? ` <a href="${escapeHtml(s.topic_url)}" target="_blank" rel="noopener">↗</a>` : '';
    return `<span class="topic">${escapeHtml(s.topic || 'discurso')}${link}</span>`;
}

// Grow every topic textarea under `root` to fit its text.
export function autosizeTopics(root) {
    root.querySelectorAll('textarea.topic-input').forEach(autosize);
}

export function autosize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// After the topic text changes: grow the field and point "Procurar" at the new title.
export function topicEdited(el) {
    autosize(el);
    const a = el.nextElementSibling?.querySelector('a[data-search]');
    if (!a) return;
    const url = topicSearchUrl(el.value);
    a.hidden = !url;
    a.href = url || '#';
}

// Prompts for the talk link; returns true when it changed.
export function askLink(s) {
    const raw = window.prompt('Link do discurso (deixa vazio para remover):', s.topic_url || '');
    if (raw === null) return false;
    const link = cleanLink(raw);
    if (raw.trim() && !link) { showToast('Esse link não parece válido.', 'error'); return false; }
    if (link === (s.topic_url || '')) return false;
    s.topic_url = link;
    return true;
}

// Shares (or copies) the invitation. Resolves true once it was actually sent/copied, so the
// caller can move the speaker from "por convidar" to "convidado".
export async function sendInvite(s, date) {
    const text = inviteMessage(s, date);
    if (navigator.share) {
        try { await navigator.share({ text }); return true; } catch (e) { if (e?.name === 'AbortError') return false; }
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('Convite copiado — cola no WhatsApp.', 'success');
        return true;
    } catch {
        window.prompt('Copia o convite:', text);
        return false;
    }
}
