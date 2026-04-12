# YouTube Roulette 🎰

A multiplayer party game where players take turns searching YouTube with random search terms, select the weirdest videos, and vote on their favorites. Built as a static single-page app — works on phones via room codes, Jackbox-style.

## Quick Start

### 1. Supabase Setup

This app uses [Supabase](https://supabase.com) for real-time multiplayer. You can use an existing project (tables are prefixed with `yt_` to avoid conflicts).

1. Go to your Supabase project's **SQL Editor**
2. Paste and run the contents of [`schema.sql`](schema.sql)
3. Copy your project **URL** and **anon/public key** from **Settings → API**
4. Paste them into [`js/config.js`](js/config.js)

### 2. Run Locally

Any static file server works. The simplest:

```bash
npx -y serve .
```

Then open `http://localhost:3000` on your phone and desktop!

### 3. Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source: Deploy from branch (main)**
3. Your game will be live at `https://yourusername.github.io/ytroulette/`

> **Important:** Make sure your `js/config.js` has your real Supabase credentials before deploying.

## How to Play

### Setup
- One player **Creates a Game** and gets a 4-character room code
- Other players **Join** using the code on their phones
- Everyone hits **Ready**, then the host starts the game

### Gameplay
- Players take turns — each turn generates a **random 4-character search term**
- The active player picks from **3 standard** + **3 wildcard** mock video options
- Each player has **3 superpowers** (once per game each):
  - 🎲 **Reroll** — generate a completely new search term
  - 🔄 **Replace** — tap a character to replace it with a new random one
  - ↔️ **Swap** — trade your term for one from a previous turn

### Voting & Scoring
- After all players have chosen, everyone **votes** on their favorite video
- **Most votes** = **1 point** • **Unanimous vote** = **2 points** • **Tie** = no points
- **First to 3 points wins!**

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step)
- **Backend:** Supabase (Postgres + Realtime subscriptions)
- **Fonts:** Outfit + Inter (Google Fonts)
- **Hosting:** GitHub Pages (or any static host)

## Project Structure

```
├── index.html      # Single-page HTML shell
├── css/
│   └── styles.css  # Mobile-first dark theme
├── js/
│   ├── config.js   # Supabase credentials (edit this!)
│   ├── app.js      # State, DB, game logic, events
│   └── ui.js       # View rendering
├── schema.sql      # Database setup (run in Supabase)
└── README.md
```
