# Vino – Personal Cellar PWA

## Deploy to Vercel in 5 steps

### Prerequisites
- [Node.js](https://nodejs.org) (v18 or higher) — download and install
- [Git](https://git-scm.com) — download and install
- A free [GitHub](https://github.com) account
- A free [Vercel](https://vercel.com) account (sign up with GitHub)

---

### Step 1 — Install dependencies
Open Terminal (Mac) or Command Prompt (Windows), navigate to this folder, then run:
```bash
npm install
```

### Step 2 — Test it locally (optional but recommended)
```bash
npm run dev
```
Open http://localhost:5173 in your browser. If it looks right, move on.

### Step 3 — Push to GitHub
1. Go to https://github.com/new and create a new **private** repository called `vino-pwa`
2. Copy the commands GitHub shows you under "push an existing repository", e.g.:
```bash
git init
git add .
git commit -m "Initial Vino PWA"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vino-pwa.git
git push -u origin main
```

### Step 4 — Deploy on Vercel
1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select your `vino-pwa` repo
4. Leave all settings as default — Vercel auto-detects Vite
5. Click **Deploy**
6. Wait ~60 seconds. You'll get a live URL like `https://vino-pwa.vercel.app`

### Step 5 — Add to iPhone Home Screen
1. Open the Vercel URL in **Safari** on your iPhone (must be Safari)
2. Tap the **Share button** (box with arrow at the bottom)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it **Vino** and tap **Add**
5. It now appears on your home screen and runs fullscreen like a native app

---

## Important Notes

### AI Assistant (Vino AI tab)
The AI tab calls the Anthropic API. This is handled automatically — no API key needed
when running through Claude's artifact environment. When self-hosting, you would need
to add your own Anthropic API key to a backend proxy for production use.

### Data Storage
All wine data is stored in React state (in memory). To add persistent storage across
sessions, you can enable localStorage in the App.jsx (search for `useState` calls and
wrap them with localStorage persistence).

### Updating the app
Any time you push new code to GitHub, Vercel automatically redeploys within 30 seconds.

---

## Project Structure
```
vino-pwa/
├── public/
│   └── icons/          ← App icons (192px, 512px, Apple touch)
├── src/
│   ├── main.jsx        ← React entry point
│   └── App.jsx         ← The full Vino app
├── index.html          ← HTML shell with iOS PWA meta tags
├── vite.config.js      ← Vite + PWA plugin config
├── vercel.json         ← Vercel routing config
└── package.json        ← Dependencies
```
