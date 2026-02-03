document.addEventListener('DOMContentLoaded', () => {
    // === Data Binding ===
    const form = document.getElementById('agendaForm');
    const inputs = form.querySelectorAll('input, textarea');

    // Initial sync
    inputs.forEach(input => {
        updatepreview(input);
        input.addEventListener('input', (e) => updatepreview(e.target));
    });

    function updatepreview(input) {
        const key = input.name;
        const value = input.value;
        const bindElements = document.querySelectorAll(`[data-bind="${key}"]`);

        bindElements.forEach(el => {
            if (key === 'speakers') {
                renderSpeakers(value);
            } else if (key === 'business') {
                el.innerHTML = value.replace(/\n/g, '<br>');
                // Hide container if empty
                const container = document.getElementById('business-container');
                if (container) {
                    container.style.display = value.trim() ? 'block' : 'none';
                }
            } else if (key === 'date') {
                // Format date nicely (PT-PT)
                if (value) {
                    const dateObj = new Date(value);
                    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                    el.textContent = dateObj.toLocaleDateString('pt-PT', options);
                } else {
                    el.textContent = '--/--/----';
                }
            } else {
                el.textContent = value || '...';
            }
        });
    }

    function renderSpeakers(text) {
        const container = document.getElementById('speakers-list');
        container.innerHTML = ''; // Clear

        if (!text.trim()) return;

        const lines = text.split('\n');

        lines.forEach((line, index) => {
            if (!line.trim()) return;

            const div = document.createElement('div');

            // Check if it's a hymn or special item (heuristic: contains digits or "Hino")
            const isSpecial = line.toLowerCase().includes('hino') || /^\d/.test(line);

            div.className = isSpecial ? 'program-item highlight-box' : 'program-item'; // simple variant
            div.className = 'program-item'; // Reset to standard for now, add logic if needed

            // Naive split for "Role - Name"
            let label = `Orador ${index + 1}`;
            let value = line;

            // If user typed "Hino - ...", make it look like a label
            if (line.includes('-')) {
                const parts = line.split('-');
                label = parts[0].trim();
                value = parts.slice(1).join('-').trim();
            }

            div.innerHTML = `
                <span class="program-label">${label}</span>
                <span class="program-value">${value}</span>
            `;
            container.appendChild(div);
        });
    }
});

// === Export PDF ===
async function exportPDF() {
    const element = document.getElementById('agenda-paper');

    // Get date for filename
    const dateValue = document.querySelector('input[name="date"]').value;
    const filename = dateValue ? `agenda_sacramental_${dateValue}.pdf` : 'agenda_sacramental.pdf';

    // Config for html2pdf
    const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    // If on mobile/share-capable device, try to share the blob directly
    if (navigator.canShare && navigator.share) {
        try {
            const worker = html2pdf().set(opt).from(element);
            const blob = await worker.output('blob');
            const file = new File([blob], filename, { type: 'application/pdf' });

            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Agenda Sacramental',
                    text: `Agenda para ${dateValue}`,
                });
                return; // Shared!
            }
        } catch (err) {
            console.log('Share failed or cancelled, falling back to download', err);
        }
    }

    // Fallback or Desktop: Direct Download
    html2pdf(element, opt);
}

// === Share Links ===
function generateShareLink(platform) {
    const formData = new FormData(document.getElementById('agendaForm'));
    const data = Object.fromEntries(formData);

    // Construct a nice text summary
    const text = `
*Agenda Sacramental - ${data.ward || 'Ala ...'}*
📅 ${data.date || 'Data'}

*Preside:* ${data.presiding}
*Dirige:* ${data.conducting}

🎵 *Hino Abertura:* ${data.openingHymn}
🙏 *Oração:* ${data.invocation}

📣 *Anúncios:*
${data.business}

🍞 *Hino Sacramental:* ${data.sacramentHymn}

🗣️ *Programa:*
${data.speakers}

🎵 *Hino Encerramento:* ${data.closingHymn}
🙏 *Oração:* ${data.benediction}
    `.trim();

    if (platform === 'whatsapp') {
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    }
}
