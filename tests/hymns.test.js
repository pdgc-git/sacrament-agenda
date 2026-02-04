const hymnal = require('../hymns.js');

describe('Hymns Database', () => {
    test('should have a list of hymns', () => {
        expect(Array.isArray(hymnal)).toBe(true);
        expect(hymnal.length).toBeGreaterThan(0);
    });

    test('hymns should have number and title', () => {
        const firstHymn = hymnal[0];
        expect(firstHymn).toHaveProperty('number');
        expect(firstHymn).toHaveProperty('title');
    });

    test('should find hymn by number', () => {
        const hymn1 = hymnal.find(h => h.number === "1");
        expect(hymn1).toBeDefined();
        expect(hymn1.title).toBe("A Alva Rompe");
    });
});
