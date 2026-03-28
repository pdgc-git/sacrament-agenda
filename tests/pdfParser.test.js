/**
 * @jest-environment node
 */
import { parseMemberLines, normalizeName, parseCallingUpdates, escapeRegExp } from '../js/utils/pdfParser.js';

describe('PDF Parser Utilities', () => {

    describe('normalizeName', () => {
        test('should lowercase and trim whitespace', () => {
            expect(normalizeName('  John Doe  ')).toBe('john doe');
        });

        test('should remove punctuation', () => {
            expect(normalizeName("O'Connor")).toBe('oconnor');
            expect(normalizeName('Smith-Jones')).toBe('smithjones');
        });

        test('should normalize multiple spaces to single space', () => {
            expect(normalizeName('John    Doe')).toBe('john doe');
        });

        test('should normalize accented characters (NFD)', () => {
            expect(normalizeName('João Silva')).toBe('joao silva');
            expect(normalizeName('Joao Silva')).toBe('joao silva');
            expect(normalizeName('Conceição')).toBe('conceicao');
            expect(normalizeName('José María')).toBe('jose maria');
            expect(normalizeName('São Paulo')).toBe('sao paulo');
        });
    });

    describe('escapeRegExp', () => {
        test('should escape special regex characters', () => {
            expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
        });

        test('should not change strings without special characters', () => {
            expect(escapeRegExp('HelloWorld123')).toBe('HelloWorld123');
            expect(escapeRegExp('Hello World')).toBe('Hello World');
        });

        test('should handle empty string', () => {
            expect(escapeRegExp('')).toBe('');
        });

        test('should escape a mix of normal and special characters', () => {
            expect(escapeRegExp('abc.def+ghi?')).toBe('abc\\.def\\+ghi\\?');
        });
    });

    describe('parseMemberLines', () => {
        test('should parse a standard adult member line', () => {
            // "Name  Gender  Age"
            const input = ['Doe, John  M  45'];
            const result = parseMemberLines(input);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                name: 'Doe, John',
                gender: 'M',
                age: 45,
                group: 'Adult',
                calling: ''
            });
        });

        test('should remove trailing commas from names', () => {
            const input = ['Smith, Jane,  F  30'];
            const result = parseMemberLines(input);

            expect(result[0].name).toBe('Smith, Jane');
        });

        test('should categorize Primary children (age <= 11)', () => {
            const input = ['Kid, Little  M  8'];
            const result = parseMemberLines(input);
            expect(result[0].group).toBe('Primary');
        });

        test('should categorize Youth (age 12-17)', () => {
            const input = ['Teen, Emo  F  14'];
            const result = parseMemberLines(input);
            expect(result[0].group).toBe('Youth');
        });

        test('should categorize Young Adults (age 18-35)', () => {
            const input = ['Student, College  M  22'];
            const result = parseMemberLines(input);
            expect(result[0].group).toBe('Young Adult');
        });

        test('should ignore invalid lines (headers or noise)', () => {
            const input = [
                'Member List Report',           // Header
                'Name       Sex   Age',        // Column Title
                'Doe, Valid  M  50',           // Valid
                'Just a random string'         // Noise
            ];
            const result = parseMemberLines(input);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Doe, Valid');
        });
    });

    describe('parseCallingUpdates', () => {
        test('should parse prefix format (Organization | Calling | Name)', () => {
            const members = [{ name: 'John Doe', calling: '' }];
            const lines = ['Bishopric   Bishop   John Doe'];
            parseCallingUpdates(lines, members);
            expect(members[0].calling).toBe('Bishopric - Bishop');
        });

        test('should parse suffix format (Name | Organization | Calling)', () => {
            const members = [{ name: 'Jane Doe', calling: '' }];
            const lines = ['Jane Doe   Primary   Teacher'];
            parseCallingUpdates(lines, members);
            expect(members[0].calling).toBe('Primary - Teacher');
        });

        test('should not treat dates as callings', () => {
            const members = [{ name: 'John Doe', calling: '' }];
            const lines = ['John Doe   01 Jan 2023'];
            parseCallingUpdates(lines, members);
            expect(members[0].calling).toBe('');
        });

        test('should handle suffix with single part (org only)', () => {
            const members = [{ name: 'Jane Doe', calling: '' }];
            const lines = ['Jane Doe   Bishop'];
            parseCallingUpdates(lines, members);
            expect(members[0].calling).toBe('Bishop');
        });

        test('should skip sex and age columns in suffix', () => {
            const members = [{ name: 'John Doe', calling: '' }];
            const lines = ['John Doe   M   45   Elder'];
            parseCallingUpdates(lines, members);
            expect(members[0].calling).toBe('Elder');
        });

        test('should discard fragments from wrapped PDF lines', () => {
            const members = [{ name: 'Burti Marcondes Barbosa, Marielle', calling: '' }];
            const lines = [
                'Burti Marcondes   F   37   25 ago 1988   Escola Dominical   Professor(a) da Escola',
                'Barbosa, Marielle                                           Dominical'
            ];
            parseCallingUpdates(lines, members);
            // "Dominical" is a substring of the full calling, so it should be discarded
            expect(members[0].calling).toBe('Escola Dominical - Professor(a) da Escola');
        });

        test('should join multiple distinct callings with /', () => {
            const members = [{ name: 'Jason Francois', calling: '' }];
            const lines = [
                'Jason Francois   Outros Chamados   Professor do Seminário',
                'Jason Francois   Bispado   Secretário Adjunto Financeiro'
            ];
            parseCallingUpdates(lines, members);
            expect(members[0].calling).toBe(
                'Outros Chamados - Professor do Seminário / Bispado - Secretário Adjunto Financeiro'
            );
        });
    });
});
