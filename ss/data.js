// Fictitious test data for the Relief Society test page. Every name and number is invented.
// Phone numbers use the 900 000 xxx range so no real person can be reached.
import { addDays, lastSunday } from './logic.js';

export const ZONES = ['Leiria centro', 'Marrazes', 'Pousos', 'Parceiros', 'Cortes'];
export const CATEGORIES = { active: 'ativa', less: 'menos ativa', new: 'recém-batizada' };
export const VISITS = { yes: 'sim', no: 'não', ask: 'por perguntar' };
export const ORGS = ['Primária', 'Moças', 'Rapazes'];

export const DEFAULT_TEMPLATES = {
    absence: {
        one: 'Olá, {ministradoras}! {vossa} {irma} hoje não {esteve} connosco na igreja. Durante a semana, podem dar-{lhe} uma palavra? Vejam se está tudo bem e partilhem com {ela} um pensamento, uma escritura ou algo que sentiram hoje. Obrigada pelo vosso amor!',
        two: 'Olá, {ministradoras}! {vossa} {irma} já não {esteve} connosco há {semanas} domingos. Esta semana, conseguem fazer-{lhe} uma visita ou um telefonema? Perguntem se precisa de alguma coisa e digam-{lhe} que sentimos a falta dela. Obrigada!',
        four: 'Olá, {ministradoras}! {vossa} {irma} não vem à igreja há {semanas} domingos. A presidência também já sabe. Podem combinar uma visita com calma e contar-nos como correu? O vosso cuidado faz toda a diferença. Obrigada!',
    },
    birthday: [
        'Muitos parabéns, {nome}! Que este dia seja cheio de alegria e do amor do Pai Celestial. Um abraço grande da Sociedade de Socorro!',
        'Parabéns, querida {nome}! Agradecemos a Deus pela tua vida e pela tua amizade. Que tenhas um dia muito feliz!',
        'Feliz aniversário, {nome}! Que o Senhor te abençoe com saúde, paz e muitas razões para sorrir. Beijinhos da SS.',
        '{nome}, muitos parabéns! És muito importante para nós. Que hoje sintas o carinho de toda a ala.',
        'Parabéns, {nome}! Que este novo ano seja cheio de bênçãos e momentos bonitos com quem gostas.',
        'Muitas felicidades, {nome}! Obrigada por tudo o que és e dás. Um dia muito feliz para ti!',
        'Querida {nome}, feliz aniversário! Estamos a pensar em ti hoje com muito carinho.',
        'Parabéns, {nome}! «Eis que vos dou paz» — que ela te acompanhe neste dia e em todo o ano. Um abraço!',
    ],
    eve: 'Olá, {ministradoras}! Amanhã a {irma} faz anos. Se puderem, enviem-lhe uma mensagem ou passem para lhe dar um abraço. Obrigada!',
};

const SISTERS = [
    ['s01', 'Augusta Ramalho', '1941-11-03', 'Marrazes', 'active', true, 'yes'],
    ['s02', 'Manuela Faria', '1968-02-14', 'Leiria centro', 'active', true, 'yes'],
    ['s03', 'Carolina Matos', '1990-07-22', 'Leiria centro', 'active', true, 'ask'],
    ['s04', 'Beatriz Lemos', '1985-11-19', 'Pousos', 'less', true, 'ask'],
    ['s05', 'Rosa Cardoso', '1950-12-08', 'Parceiros', 'active', true, 'yes'],
    ['s06', 'Joana Teixeira', '1995-03-30', 'Cortes', 'new', true, 'ask'],
    ['s07', 'Fernanda Pires', '1958-11-27', 'Marrazes', 'active', true, 'yes'],
    ['s08', 'Lurdes Henriques', '1947-12-15', 'Pousos', 'less', true, 'no'],
    ['s09', 'Inês Barata', '2001-09-05', 'Leiria centro', 'active', true, 'ask'],
    ['s10', 'Odete Sequeira', '1939-12-02', 'Cortes', 'active', true, 'yes'],
    ['s11', 'Sónia Galvão', '1977-06-11', 'Parceiros', 'less', false, 'no'],
    ['s12', 'Patrícia Lobo', '1982-11-08', 'Marrazes', 'active', true, 'ask'],
    ['s13', 'Daniela Couto', '1999-01-21', 'Pousos', 'new', true, 'ask'],
    ['s14', 'Helena Brito', '1963-04-17', 'Leiria centro', 'active', true, 'yes'],
    ['s15', 'Cecília Monteiro', '1953-12-24', 'Marrazes', 'less', true, 'yes'],
    ['s16', 'Vera Antunes', '1988-10-09', 'Cortes', 'active', true, 'ask'],
    ['s17', 'Graça Quintela', '1944-11-30', 'Parceiros', 'active', true, 'yes'],
    ['s18', 'Tânia Rebelo', '1992-05-02', 'Pousos', 'less', true, 'ask'],
    ['s19', 'Alzira Macedo', '1936-12-19', 'Leiria centro', 'active', true, 'yes'],
    ['s20', 'Luísa Vidal', '1974-08-28', 'Cortes', 'active', true, 'ask'],
    ['s21', 'Natália Serra', '1960-11-12', 'Pousos', 'active', true, 'yes'],
    ['s22', 'Mafalda Rocha', '2003-12-04', 'Marrazes', 'new', true, 'ask'],
];

// Ministering pairs (both ministers are sisters too) and who each pair ministers to.
const PAIRS = [
    ['p1', ['s02', 's03'], ['s01', 's04', 's15']],
    ['p2', ['s14', 's09'], ['s05', 's06', 's11']],
    ['p3', ['s07', 's12'], ['s08', 's10', 's13']],
    ['p4', ['s16', 's20'], ['s17', 's18', 's19']],
    ['p5', ['s21', 's22'], ['s02', 's03', 's07', 's12']],
    ['p6', ['s05', 's17'], ['s14', 's09', 's16', 's20', 's21', 's22']],
];

// Brothers aged 60+ from the elders quorum — only for the "ninguém faz anos sozinho" project.
const BROTHERS = [
    ['b1', 'Armando Ramalho', '1940-12-11', 'Marrazes', 'yes'],
    ['b2', 'Joaquim Seabra', '1952-11-22', 'Pousos', 'ask'],
    ['b3', 'Vítor Mendonça', '1949-01-07', 'Cortes', 'yes'],
    ['b4', 'Álvaro Pinheiro', '1945-12-27', 'Leiria centro', 'no'],
];

// Attendance pattern per sister for the last 12 Sundays (oldest → newest): 1 = present.
// Chosen so the test shows each case: 1 absence, 2–3 in a row, 4+, someone who came back.
const PATTERN = {
    s01: '111111111110', // missed today → 1
    s04: '110100110000', // 4 in a row
    s05: '111111111111',
    s06: '111111110011', // came back after 2
    s08: '000100000000', // long streak, visits "não"
    s10: '111111111100', // 2 in a row
    s11: '010000100000', // can't be ministered → skipped
    s13: '111111111000', // 3 in a row
    s15: '101101111110', // 1
    s17: '111111111111',
    s18: '011001000111', // came back after 2? no: last three present
    s19: '111111111110', // 1, same pair as s17/s18
};

export function seed(today = new Date()) {
    const pairOf = new Map();
    PAIRS.forEach(([pid, , ids]) => ids.forEach(id => pairOf.set(id, pid)));
    const sisters = SISTERS.map(([id, name, birth, zone, category, canMinister, visits], i) => ({
        id, name, birth, zone, category, canMinister, visits,
        phone: `900 000 ${String(100 + i * 7).padStart(3, '0')}`,
        pairId: pairOf.get(id) || '', pausedUntil: '', status: 'active',
    }));
    const pairs = PAIRS.map(([id, ministers]) => ({ id, ministers }));
    const brothers = BROTHERS.map(([id, name, birth, zone, visits], i) => ({
        id, name, birth, zone, visits, phone: `900 001 ${String(100 + i * 11).padStart(3, '0')}`, status: 'active',
    }));

    const last = lastSunday(today);
    const attendance = {};
    for (let w = 0; w < 12; w++) {
        const d = addDays(last, -7 * (11 - w));
        attendance[d] = sisters
            .filter(s => {
                const p = PATTERN[s.id];
                if (p) return p[w] === '1';
                return (s.id.charCodeAt(2) + w) % 9 !== 0; // everyone else: present most weeks
            })
            .map(s => s.id);
    }
    // The newest Sunday is left unsaved so the test starts with "mark today's attendance".
    const pending = attendance[last];
    delete attendance[last];

    return {
        version: 1,
        sisters, pairs, brothers, attendance,
        draft: { [last]: pending },
        sent: {}, // `${date}:${pairId}` → true; birthday `${year}:${id}` → true
        projectDone: {}, // `${date}:${id}` → true
        settings: { minAge: 70, orgs: [...ORGS], projectStart: last.slice(0, 7) },
        templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
    };
}
