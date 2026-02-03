# Sacrament Agenda Builder (Agenda Sacramental SUD)

A web-based tool to easily create, preview, and print agendas for LDS (Church of Jesus Christ of Latter-day Saints) Sacrament Meetings.

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
