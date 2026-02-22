# Habitat Restore — Static Site

This is a minimal static website scaffold for a habitat restoration organization.

Files:
- `index.html` — Home page
- `about.html` — About / mission
- `css/styles.css` — Styles
- `assets/logo.svg` — Logo image

Quick preview (requires Python 3):

```bash
# from repository root
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

You can also open `index.html` directly in your browser for a basic preview.

Deployment options
 - GitHub Pages: push this repo to GitHub, then enable Pages from the repository Settings -> Pages, selecting the `main` branch (or `gh-pages`) and the root folder. The site will be published at `https://<username>.github.io/<repo>/`.
 - Netlify: drag-and-drop the project folder to Netlify Drop or connect the GitHub repo and set the publish directory to the repo root.
 - Vercel: import the GitHub repo into Vercel and deploy; static site works without build step.

Admin & security notes
 - A simple client-side admin page is available at `admin.html` for demo verification only. It uses a hard-coded passphrase and localStorage; it's not secure and should not be used in production.
 - For production you should add a backend to receive and store uploads, implement authentication for admin users, and verify reports server-side before awarding any real rewards.

Local testing reminders
 - Camera access requires a secure context (https) or `http://localhost`. Use the Python server above to preview camera capture locally.

If you want, I can scaffold a minimal Node/Express backend to receive reports and a secure admin UI for verification.
I have added a minimal backend draft in this repo. To run it locally:

1. Copy `.env.example` to `.env` and set a secure `JWT_SECRET` and `ADMIN_PASS`.

2. Install dependencies and start the server:

```bash
npm install
npm start
```

3. The server runs on the port from `.env` (default `3000`). Open `http://localhost:3000` to view the site.

Notes:
- The server stores uploaded images in `data/uploads` and reports in `data/reports.json`.
- Admin login uses the `ADMIN_USER` / `ADMIN_PASS` from `.env`. The admin UI is at `/admin.html`.
- This backend is minimal and intended for development/testing only. For production, add HTTPS, rate-limiting, input validation, authentication hardening, and proper storage (S3, a DB, etc.).

Single-file option
 - A bundled single-file server is available as `bundle-server.js`. It inlines the front-end HTML, CSS and JS (reading existing files if present) and exposes the same API endpoints.
 - To run the single-file server:

```bash
node bundle-server.js
```

 - The single-file server uses the same `.env` values and storage locations as the main server.
