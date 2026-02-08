/**
 * @jest-environment node
 */
import { escapeHtml } from '../js/utils/security.js';

describe('Security Utilities', () => {
    test('escapeHtml should sanitize XSS vectors', () => {
        const malicious = "<script>alert('XSS')</script>";
        const safe = escapeHtml(malicious);
        expect(safe).toBe("&lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;");
    });

    test('escapeHtml should handle quotes', () => {
        const input = 'He said "Hello"';
        const safe = escapeHtml(input);
        expect(safe).toBe("He said &quot;Hello&quot;");
    });

    test('escapeHtml should return empty string for null/undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});
