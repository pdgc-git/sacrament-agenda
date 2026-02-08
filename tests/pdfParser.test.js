/**
 * @jest-environment node
 */
import { parseMemberLines, normalizeName } from '../js/utils/pdfParser.js';

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
});
