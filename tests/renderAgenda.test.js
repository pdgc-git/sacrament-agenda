/**
 * @jest-environment jsdom
 */
import { renderAgendaHtml, agendaSequence } from '../js/render-agenda.js';

const full = {
    date: '2026-09-14', presiding: 'Bispo Ricardo Alves', conducting: 'Cons. Tiago Nunes', organist: 'Sofia Pinto', chorister: 'Rui Martins',
    opening_hymn: '78 - Vinde Vós', sacrament_hymn: '112 - Sim, Eu Te Sigo', intermediate_hymn: '41 - Amai-vos', closing_hymn: '34 - Louvor',
    invocation: 'Beatriz Costa', benediction: 'Tiago Nunes', kind: 'normal',
    recognitions: [{ text: 'Élder Matos' }], announcements: [{ text: 'Serão sábado' }],
    releases: [{ name: 'Ana Ferreira', calling: 'Secretária' }], callings: [{ name: 'Ana Ferreira', calling: 'Professora' }],
    program: [
        { type: 'speaker', id: 's1', name: 'Maria Silva', topic: 'Fé', position: 'before' },
        { type: 'speaker', id: 's2', name: 'João <b>Cardoso</b>', position: 'before' },
        { type: 'speaker', id: 's3', name: 'Beatriz Costa', position: 'after' },
    ],
};

function labelsInOrder(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return [...div.querySelectorAll('h3, .program-label, .sacrament-note, .fast-meeting-note')].map(el => el.textContent.trim());
}

describe('renderAgendaHtml', () => {
    test('renders the shipped order exactly', () => {
        expect(labelsInOrder(renderAgendaHtml(full, { wardName: 'Ala Alvalade' }))).toEqual([
            'Reconhecimentos', 'Anúncios',
            'Hino de Abertura', 'Primeira Oração',
            'Assuntos da Ala',
            'Hino Sacramental', 'Administração do Sacramento',
            'Programa', 'Orador', 'Orador', 'Hino Intermediário', 'Orador',
            'Hino de Encerramento', 'Última Oração',
        ]);
    });

    test('omits empty sections and the intermediate hymn without speakers', () => {
        const m = { ...full, recognitions: [], announcements: [], releases: [], callings: [], program: [], intermediate_hymn: '41 - x' };
        const labels = labelsInOrder(renderAgendaHtml(m));
        expect(labels).not.toContain('Reconhecimentos');
        expect(labels).not.toContain('Assuntos da Ala');
        expect(labels).not.toContain('Hino Intermediário');
    });

    test('fast Sunday replaces speakers with the testimony note', () => {
        const labels = labelsInOrder(renderAgendaHtml({ ...full, kind: 'fast' }));
        expect(labels).toContain('Testemunhos da Congregação');
        expect(labels).not.toContain('Orador');
    });

    test('uses the shipped markup classes, header, date and business sub-sections', () => {
        const html = renderAgendaHtml(full, { wardName: 'Ala Alvalade' });
        expect(html).toContain('<h1>Agenda da Reunião Sacramental</h1>');
        expect(html).toContain('<h2>Ala Alvalade</h2>');
        expect(html).toContain('14 de setembro de 2026');
        expect(html).toContain('class="meta-grid"');
        expect(html).toContain('class="program-item highlight-box"');
        expect(html).toContain('<h4>Desobrigações</h4>');
        expect(html).toContain('<h4>Chamados</h4>');
        expect(html).toContain('Ana Ferreira — Secretária');
    });

    test('escapes user-supplied names', () => {
        const html = renderAgendaHtml(full);
        expect(html).not.toContain('<b>Cardoso</b>');
        expect(html).toContain('João &lt;b&gt;Cardoso&lt;/b&gt;');
    });

    test('resolves prayer member ids through membersById', () => {
        const m = { ...full, invocation: '', invocation_member_id: 'm1' };
        const html = renderAgendaHtml(m, { membersById: new Map([['m1', { name: 'Rui Martins' }]]) });
        expect(html).toContain('Rui Martins');
    });
});

describe('agendaSequence', () => {
    test('flat sequence follows the same order and tags speakers with ids', () => {
        const seq = agendaSequence(full);
        expect(seq.map(e => e.label)).toEqual([
            'Reconhecimentos', 'Anúncios', 'Hino de Abertura', 'Primeira Oração', 'Assuntos da Ala',
            'Hino Sacramental', 'Administração do Sacramento', 'Programa',
            'Orador', 'Orador', 'Hino Intermediário', 'Orador', 'Hino de Encerramento', 'Última Oração',
        ]);
        expect(seq.filter(e => e.role === 'speaker').map(e => e.id)).toEqual(['s1', 's2', 's3']);
    });
});
