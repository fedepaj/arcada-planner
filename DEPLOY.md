# Deploy to GitHub Pages

Step-by-step guide to build and serve Arcada Planner on GitHub Pages.

---

## Prerequisites

- Node.js 18+
- A GitHub repository for this project

## 1. Set the base path

Edit `vite.config.ts` and add the `base` field matching your repo name:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/arcada-planner/',  // ← replace with your repo name
});
```

## 2. Install the deploy helper

```bash
npm install -D gh-pages
```

## 3. Add a deploy script

In `package.json`, add the `deploy` script:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "deploy": "npm run build && gh-pages -d dist"
  }
}
```

## 4. Deploy

```bash
npm run deploy
```

This builds the project and pushes the `dist/` folder to the `gh-pages` branch.

## 5. Enable GitHub Pages

1. Go to your repo on GitHub
2. **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: **gh-pages** / **(root)**
5. Click **Save**

Your app will be live at `https://YOUR_USERNAME.github.io/arcada-planner/` within a couple of minutes.

---

## Troubleshooting

- **Blank page after deploy:** Make sure `base` in `vite.config.ts` matches your repo name exactly (e.g., `/arcada-planner/`).
- **Assets not loading:** Verify that SVG paths in `catalog.json` don't use absolute paths — they should be relative (e.g., `sofa`, not `/assets/2d/sofa`).
- **404 on refresh:** GitHub Pages doesn't support client-side routing out of the box. This app is a single-page app without a router, so this shouldn't be an issue.

## Local development

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

## Production build (without deploy)

```bash
npm run build
npm run preview
```

The `preview` command serves the built `dist/` folder locally to verify everything works before deploying.
