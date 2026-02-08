
/**
 * Extracts text from PDF but PRESERVES table layout by 
 * grouping items by Y-coordinate (Rows) and separating columns with gaps.
 * @param {File} file - The PDF file object
 * @returns {Promise<string[]>} - Array of strings, each representing a visual line
 */
export async function extractVisualLines(file) {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js library not found (window.pdfjsLib is undefined).");
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let allLines = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // 1. Group items by Y position (Row Detection)
        // We use a tolerance of 4 pixels to account for minor misalignments
        const rowMap = new Map();
        const Y_TOLERANCE = 4;

        content.items.forEach(item => {
            // PDF Y-coordinates start from bottom, so higher value = higher on page
            const y = item.transform[5];
            if (!item.str.trim()) return; // Skip empty whitespace items

            let matchY = null;
            for (const existingY of rowMap.keys()) {
                if (Math.abs(existingY - y) < Y_TOLERANCE) {
                    matchY = existingY;
                    break;
                }
            }
            if (matchY !== null) {
                rowMap.get(matchY).push(item);
            } else {
                rowMap.set(y, [item]);
            }
        });

        // 2. Sort Rows (Top to Bottom)
        const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);

        // 3. Construct Lines
        sortedYs.forEach(y => {
            const items = rowMap.get(y);
            // Sort items Left to Right (X position)
            items.sort((a, b) => a.transform[4] - b.transform[4]);

            let lineStr = '';
            for (let k = 0; k < items.length; k++) {
                const curr = items[k];
                lineStr += curr.str;

                // Add visual gap if next item is far away
                if (k < items.length - 1) {
                    const next = items[k + 1];
                    const currEnd = curr.transform[4] + curr.width;
                    const gap = next.transform[4] - currEnd;

                    if (gap > 10) {
                        lineStr += '   '; // 3 spaces = Column Break
                    } else {
                        lineStr += ' ';   // 1 space = Word Break
                    }
                }
            }
            allLines.push(lineStr.trim());
        });
    }
    return allLines;
}

export function parseMemberLines(lines) {
    const results = [];

    // Pattern: Name (letters/comma) ... Gap ... Sex (M/F) ... Gap ... Age (Digits)
    // We look for M/F and Age specifically as anchors
    const rowRegex = /^(.+?)\s{2,}([MF])\s{2,}(\d{1,3})/;

    lines.forEach(line => {
        const match = rowRegex.exec(line);

        if (match) {
            const rawName = match[1].trim();
            const sex = match[2];
            const age = parseInt(match[3]);

            // Determine Group based on Age
            let group = 'Adult';
            if (age <= 11) group = 'Primary';
            else if (age >= 12 && age <= 17) group = 'Youth';
            else if (age >= 18 && age <= 35) group = 'Young Adult';

            // Clean Name (remove trailing comma if exists)
            const name = rawName.replace(/,$/, '');

            results.push({
                name: name,
                gender: sex,
                age: age,
                group: group,
                calling: '' // Filled later
            });
        }
    });

    return results;
}

export function normalizeName(str) {
    return str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
