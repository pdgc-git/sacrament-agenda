/**
 * @jest-environment node
 */
import { escapeHtml } from '../js/utils/security.js';

describe('XSS Protection', () => {
    test('escapeHtml should sanitize strings containing malicious HTML', () => {
        const malicious = "<img src=x onerror=alert(1)>";
        const safe = escapeHtml(malicious);
        expect(safe).toBe("&lt;img src=x onerror=alert(1)&gt;");
    });

    test('escapeHtml should sanitize all member-controlled fields', () => {
        const maliciousName = "<script>alert('name')</script>";
        const maliciousCalling = "<script>alert('calling')</script>";
        const maliciousGroup = "<script>alert('group')</script>";

        expect(escapeHtml(maliciousName)).toBe("&lt;script&gt;alert(&#039;name&#039;)&lt;/script&gt;");
        expect(escapeHtml(maliciousCalling)).toBe("&lt;script&gt;alert(&#039;calling&#039;)&lt;/script&gt;");
        expect(escapeHtml(maliciousGroup)).toBe("&lt;script&gt;alert(&#039;group&#039;)&lt;/script&gt;");
    });
});
