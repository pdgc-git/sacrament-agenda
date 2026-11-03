import { topicSearchQuery, topicSearchUrl, cleanLink, inviteMessage } from '../../js/components/speaker-extras.js';

describe('topicSearchQuery — pulls the talk title out of the free-text topic', () => {
    test.each([
        ['Elder Holland - "E agora vejo" - Outubro 2025', 'E agora vejo'],
        ['Elder Uchtdorf - “Nisto Todos Conhecerão Que Sois Meus Discípulos” - Abril 2025', 'Nisto Todos Conhecerão Que Sois Meus Discípulos'],
        ['Presidente D. Todd Christofferson - A Divina Dádiva do Arrependimento - Outubro de 2011', 'A Divina Dádiva do Arrependimento'],
        ['Fortalencedo-se com Isaías - Força dos Jovens Outubro 2026', 'Fortalencedo-se com Isaías'],
        ['Um em Cristo - Elder D. Todd Christofferson - Abril 2023', 'Um em Cristo'],
        ['Força dos Jovens - Como posso viver a vida com otimismo? - Fevereiro 2026', 'Como posso viver a vida com otimismo?'],
        ['Eclesiastes 3', 'Eclesiastes 3'],
    ])('%s', (topic, want) => expect(topicSearchQuery(topic)).toBe(want));

    test('placeholders give nothing to search', () => {
        ['Tema Livre', 'Livre', 'TBD', 'Testemunho', '-', ''].forEach(t => expect(topicSearchQuery(t)).toBe(''));
        expect(topicSearchUrl('Tema Livre')).toBe('');
    });

    test('search URL targets the Portuguese Gospel Library search', () => {
        expect(topicSearchUrl('Elder Holland - "E agora vejo" - Outubro 2025'))
            .toBe('https://www.churchofjesuschrist.org/search?lang=por&query=E%20agora%20vejo');
    });
});

describe('cleanLink', () => {
    test('keeps http(s), adds https to bare domains, rejects junk', () => {
        expect(cleanLink('https://www.churchofjesuschrist.org/study/x?lang=por')).toBe('https://www.churchofjesuschrist.org/study/x?lang=por');
        expect(cleanLink('churchofjesuschrist.org/study/x')).toBe('https://churchofjesuschrist.org/study/x');
        expect(cleanLink('javascript:alert(1)')).toBe('');
        expect(cleanLink('not a link')).toBe('');
        expect(cleanLink('  ')).toBe('');
    });
});

describe('inviteMessage', () => {
    test('first name, long date, topic and link', () => {
        const msg = inviteMessage({ name: 'Eloy Tavares', topic: 'Fortalencedo-se com Isaías', topic_url: 'https://x.org/a' }, '2026-11-08');
        expect(msg).toContain('Olá Eloy!');
        expect(msg).toContain('8 de novembro de 2026');
        expect(msg).toContain('Tema: Fortalencedo-se com Isaías');
        expect(msg).toContain('https://x.org/a');
    });
    test('free topic is said plainly; no topic line when empty', () => {
        expect(inviteMessage({ name: 'Lucas Lima', topic: 'Tema Livre' }, '2026-11-08')).toContain('O tema é livre.');
        expect(inviteMessage({ name: 'Lucas Lima', topic: '' }, '2026-11-08')).not.toContain('Tema');
    });
});
