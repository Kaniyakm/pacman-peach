# 🍑 BABS' PAC-MAN — Georgia Peach Edition

> A tribute to **Barbara "Bab" Jackson** — Georgia's greatest Pac-Man player.
> Built with pure Vanilla JavaScript ES6+. No frameworks. No dependencies. Just love.

---

## 🎮 Play Live

**[👉 Click here to play](https://YOUR-USERNAME.github.io/babs-pacman)**

> Replace `YOUR-USERNAME` with your GitHub username after deploying.

---

## 🍑 About

Custom Pac-Man tribute for Barbara "Babs" Jackson from Georgia.
Her legendary high score of **3,333,330** (set in 1987) is permanently displayed — and can never be beaten.

### Special Features
- 🍑 **Georgia Peach** gives **TRIPLE points** — Babs' favourite fruit
- All 10 classic Pac-Man fruits: Cherry · Strawberry · Orange · Apple · Melon · Grapes · Watermelon · Bell · Key · Peach
- **BABS' unbeatable high score: 3,333,330** — hardcoded, read-only, permanent
- Dedication splash screen on every load
- Retro CRT scanline aesthetic with Georgia night sky
- Fully responsive — keyboard + mobile swipe + D-pad

---

## 📁 File Structure

```
babs-pacman/
├── index.html              ← HTML structure + links to CSS & JS
├── style.css               ← all CSS (peach theme, layout, animations)
├── game.js                 ← all JavaScript (ES6+ game engine)
├── README.md               ← this file
├── .gitignore
└── .github/
    └── workflows/
        └── deploy.yml      ← auto-deploy to GitHub Pages on push
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Presentation | CSS3 · Custom Properties · Keyframe Animations |
| Game Logic | JavaScript ES6+ (Classes · Generators · Symbols · Private Fields) |
| Rendering | Canvas 2D API |
| Deploy | GitHub Pages |

### ES6+ Patterns
- **Private class fields** `#field` — all state truly encapsulated
- **Custom generators** `*function` — `Maze.walls()` and `Maze.pickups()`
- **Symbol enums** — game `STATE` values, no string collisions
- **Strategy pattern** — each ghost AI is a swappable function
- **Observer / EventBus** — decoupled state change notifications
- **`Object.freeze()`** — CONFIG, STATE, FRUITS immutable at runtime
- **`Map` for keybindings** — O(1) input lookup

---

## 🕹️ Controls

| Input | Action |
|-------|--------|
| `W` / `↑` | Up |
| `S` / `↓` | Down |
| `A` / `←` | Left |
| `D` / `→` | Right |
| `Enter` / `Space` | Start / Restart |
| Swipe | Mobile movement |

---

## 🚀 Run Locally

```bash
# live-server (hot reload)
npm install -g live-server
cd babs-pacman
live-server

# Python (no install)
python3 -m http.server 8080

# npx (no install)
npx serve .
```

> ⚠️ Do NOT open index.html directly — ES6 modules require an HTTP server.

---

## 🍑 Personalisation

Edit the `TRIBUTE` constant at the top of `game.js`:

```javascript
const TRIBUTE = Object.freeze({
  name:    "Barbara Jackson",
  nickname:"BABS",
  hiScore: 3_333_330,      // permanent — never overwritten by game
  hiYear:  "1987",
  gameoverMessages: [
    "Babs would've kept going! 🍑",
    // add your own...
  ],
});
```

---

## 💛 Dedication

*"Sweet as a Georgia peach — she played every game with all her heart."*

**Barbara "Babs" Jackson · Georgia 🍑 · Forever the high score holder**
