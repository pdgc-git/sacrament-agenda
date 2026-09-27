import { toLoginEmail, displayLogin, suggestUsername, isUsernameLogin, USERNAME_RE } from '../js/utils/login.js';

describe('username logins', () => {
    test('a username maps to the reserved domain; an e-mail stays an e-mail', () => {
        expect(toLoginEmail(' Ana.Jesus ')).toBe('ana.jesus@utilizador.agenda.invalid');
        expect(toLoginEmail('Paulo@Mail.pt')).toBe('paulo@mail.pt');
    });
    test('display shows the username back, e-mails unchanged', () => {
        expect(displayLogin('ana.jesus@utilizador.agenda.invalid')).toBe('ana.jesus');
        expect(displayLogin('paulo@mail.pt')).toBe('paulo@mail.pt');
        expect(isUsernameLogin('ana.jesus@utilizador.agenda.invalid')).toBe(true);
    });
    test('suggests first.last without accents', () => {
        expect(suggestUsername('Ana Paula Jesus')).toBe('ana.jesus');
        expect(suggestUsername('Fátima Tavares')).toBe('fatima.tavares');
        expect(suggestUsername('Lu')).toBe('');
        expect(USERNAME_RE.test(suggestUsername('Gabriel Júnior'))).toBe(true);
    });
});
