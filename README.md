# Sacrament Agenda Builder (Agenda Sacramental SUD)

A web-based tool to easily create, preview, and print agendas for LDS (Church of Jesus Christ of Latter-day Saints) Sacrament Meetings.

**Status (2026-09-06):** v2 rebuild on branch `v2-supabase`, see `PLAN.md`. Phases 1–3 built. **Phase 3 (UI redesign) is deployed to https://agenda.89-58-18-212.nip.io** and smoke-tested end-to-end in a real browser (login → Plano picker → Domingo → Púlpito → Ausências → Membros → Administração; 89 Jest tests green). Screens: Plano · Domingo · Púlpito · Ausências · Membros · Administração. **Next (Phase 4):** Paulo logs in, creates his ward, imports the LCR roster; then Firestore data export (if anything is worth keeping), Netlify shutdown, README refresh.

## Features

- **Live Preview:** See changes instantly as you type.
- **Dynamic Program:** 
  - Add standard speakers or musical items.
  - Reorder speakers and intermediate hymns with ease.
- **Hymn Search:** Integrated Portuguese hymn database (Standard + New Hymns) for quick lookup.
- **Fast & Testimony Mode:** One-click toggle to format the agenda for Fast Sundays, hiding speaker inputs.
- **Business Section:** Dedicated sections for Callings (Desobrigações/Apoios) and Announcements, which automatically hide when empty.
- **PDF Export:** Generates a clean, A4-formatted PDF ready for printing or digital sharing via WhatsApp/Email.
- **Mobile Responsive:** works great on phones and tablets.

## Tech Stack

- **HTML5 / CSS3:** Clean, semantic structure with custom styling (no heavy frameworks).
- **JavaScript (Vanilla):** Light and fast logic for data binding and UI interactivity.
- **Libraries:**
  - [html2pdf.js](https://ekoopmans.github.io/html2pdf.js/) for PDF generation.
  - [Phosphor Icons](https://phosphoricons.com/) for UI icons.

## How to Run Locally

Since this is a static web application, you can run it without any complex build steps.

**Option 1: Direct Open**
Simply double-click `index.html` to open it in your browser.

**Option 2: Local Server (Recommended)**
For best results (especially with some browser security restrictions), run a simple local server.

If you have Python installed:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

## Contributing

Feel free to fork this project and submit pull requests for improvements!

## License

This project is open source.
