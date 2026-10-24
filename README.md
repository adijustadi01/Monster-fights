# MONSTER FIGHTS

A 3D, 1-vs-1 giant monster arena fighting game for the browser (laptop & tablet), built with **Three.js** and **Vite**.
Five titans, five arenas, real combos, counters and a tough Hard / Titan mode. Kid-friendly: no blood, no gore, the cities are already evacuated.

**Play it: https://adijustadi01.github.io/Monster-fights/**

---

## How to play

| | |
|---|---|
| **Goal** | Win 2 rounds out of 3. Empty your opponent's health bar or have more health (in %) when the 99-second timer runs out. |
| **Combos** | `LIGHT > LIGHT > LIGHT` or `LIGHT > LIGHT > HEAVY`. Press the next button right after a hit lands. Ranks: GOOD! (3 hits), GREAT! (5), TITANIC! (8). |
| **Cancels** | After any hit, press `ABILITY` to cancel straight into it. With a full meter, `HEAVY` can cancel into `SIGNATURE`. |
| **Block / Dodge** | Hold `BLOCK` to guard against attacks from the front. `BLOCK` + a direction = a quick dodge with invincibility frames. Blocking too much gets your guard crushed. |
| **Signature move** | Needs a full SIGNATURE meter, which fills when you deal **and** take damage. |
| **Counters** | Hitting a monster with its weakness shows **SUPER EFFECTIVE!**. A resisted hit shows **RESISTED!**. Check the matchup chart (Records screen or Training). |
| **Read the wind-up** | Every big attack glows before it hits. Jump over shockwaves, dodge roots, punish whiffs. |

### The roster

| Monster | Role | Resource | Strong vs | Countered by |
|---|---|---|---|---|
| **KORVAK** - The Six-Limbed Volcanic Colossus | Heavy bruiser, highest armor, uninterruptible charge | Magma Armor (water cracks it -> *Cooled*) | Canopyx | Oruvex |
| **VELUMORA** - Sail of the Storm | Fastest, flies, lightning bolts | Flight Stamina (land to refill) | Oruvex | Prismor |
| **ORUVEX** - The Pearl Tidal Colossus | Ranged water cannons, resists knockback | Water Reserve (empty = refill window, faster in water) | Korvak | Velumora |
| **CANOPYX** - Guardian of the Golden Floodplain | Defender: roots, barriers, regeneration | Regeneration (fire stops it) | Prismor | Korvak |
| **PRISMOR** - Three-Armed Crystal Colossus | Agile trickster: combos, decoy, reflecting shield | Shield Energy (perfect block reflects bolts) | Velumora | Canopyx |

### Modes
- **Story Tower** - pick a monster and beat the other four in order, then your own **Shadow** self (dark colours, red eyes, stronger). Beating it unlocks **Hard**, a new colour **skin** for that monster, and (on Hard) the **Titan** difficulty. Progress is saved in the browser.
- **Versus** - two players on one device, best of 3, arena select. Player 2 can also be set to CPU.
- **Training** - practise against a dummy (stand / block / jump / attack / CPU), with damage numbers, frame data, matchup chart and infinite meter.
- **Records** - win/loss record per monster, Story Tower badges, 20 achievements and the matchup chart.

## Controls

| Action | Player 1 (keyboard) | Player 2 (keyboard) | Gamepad | Touch |
|---|---|---|---|---|
| Move | `W A S D` | Arrow keys | Left stick / D-pad | Left joystick |
| Jump (Velumora: take off / land) | `Space` | `Right Ctrl` | A | JUMP / FLY |
| Light attack | `J` | `Numpad 1` | X | LIGHT |
| Heavy attack | `K` | `Numpad 2` | Y | HEAVY |
| Ability | `L` | `Numpad 3` | B | ABILITY |
| Signature move | `I` | `Numpad 5` | RB / RT | SIGNATURE |
| Block / Dodge (+ direction) | `Left Shift` | `Numpad 0` | LB / LT | BLOCK / DODGE |
| Pause | `Esc` or `P` | `Esc` or `P` | Start | II button |

Menus: arrow keys / WASD + `Enter` / `Space` / `J`, `Esc` / `K` to go back, or mouse/touch. In single-player you can use either keyboard layout.
On tablets the touch controls appear automatically (Settings > Touch Controls to force on/off). In Versus the screen splits: Player 1 on the left half, Player 2 on the right half.

## Development

```bash
npm install
npm run dev        # play locally at http://localhost:5173
npm run build      # production build in dist/
npm run balance    # 200 AI-vs-AI matches per matchup (logic only, no graphics)
node tools/move-test.js   # checks every move and every rule from the character guide
```

Every push to `main` builds the game and publishes it to GitHub Pages (`.github/workflows/deploy.yml`, published from the `gh-pages` branch).

### Project layout

```
src/
  data/monsters.js   <- ALL balance numbers: health, speed, damage, frame data, cooldowns,
                        resources, weaknesses, AI styles, difficulty levels
  data/models.js     <- which 3D model each monster uses (procedural or .glb) + colour skins
  data/arenas.js     <- arena layouts, props, hazards and moods
  logic/             <- the fight simulation (no graphics): battle.js, fighter.js, ai.js, arenaLogic.js
  render/            <- Three.js: monsters/ (procedural models with IK), arenas, effects, camera
  ui/                <- menus, HUD, touch controls
  audio/audio.js     <- synthesized sound effects and music (Web Audio API)
  save.js            <- progress saved in the browser (localStorage)
tools/               <- balance test, auto-tuner, move tests, headless smoke test
reference/           <- the character guide and original artwork
```

### Rebalancing
Open `src/data/monsters.js` and change numbers. Every value is commented. Time is in frames (60 = 1 second).
Then run `npm run balance` to see the new win rates. `node tools/tune.js 10 60 --write` can auto-tune damage and counter multipliers.

## Balance results

Measured with `npm run balance`: **200 AI-vs-AI best-of-3 matches for every matchup** (2,000 matches), both AIs on Normal, sides alternated, logic-only simulation, arena hazards off. ★ = favorable matchup from the character guide.

| Win rate (row vs column) | KORVAK | VELUMORA | ORUVEX | CANOPYX | PRISMOR | Overall |
|---|---|---|---|---|---|---|
| **KORVAK** | - | 56% | 41% | 58% ★ | 48% | 50% |
| **VELUMORA** | 44% | - | 62% ★ | 42% | 39% | 47% |
| **ORUVEX** | 60% ★ | 38% | - | 47% | 56% | 50% |
| **CANOPYX** | 42% | 58% | 53% | - | 61% ★ | 53% |
| **PRISMOR** | 53% | 62% ★ | 44% | 40% | - | 49% |

Targets: favorable matchups 55-65% ✅, all other matchups 40-60% ✅, no monster above 60% overall ✅.
A second run with completely different random seeds also met every target. (The two "countered" sides, e.g. Velumora vs Prismor at 39%, are simply the other side of a favorable matchup.)

How it was tuned: `tools/tune.js` adjusted each monster's overall damage and the counter multipliers by simulation, then the last few numbers were set by hand. Design changes made during balancing: heavy-move cooldowns (Root Grab, Armored Charge, Dive Strike), roots slip between Korvak's armor plates, Root Grab/Forest Lock can entangle an armored charge, Canopyx raises barriers against charges and projectiles, a slower Magma Armor drain, and Prismor's damage moved from the Haymaker into its combos.

AI difficulty check (`node tools/difficulty-test.js`, mirror matches): Hard beats Normal ~90%, Titan beats Normal ~100% and beats Hard ~85%, Easy loses to Normal.

## Replacing a monster with a .glb 3D model

You do **not** need to know how to program. You only change one line.

1. **Get a model.** Export or download your monster as a `.glb` file (for example from Blender: *File > Export > glTF 2.0*, format *glTF Binary (.glb)*). Name it simply, e.g. `korvak.glb`.
2. **Put it in the game.** Copy the file into the folder `public/models/` (create the `models` folder inside `public` if it isn't there).
3. **Switch the monster to it.** Open `src/data/models.js` in any text editor (Notepad, TextEdit, or on GitHub click the file and the pencil icon). Find the line
   ```js
   korvak: { type: 'procedural' },
   ```
   and change it to
   ```js
   korvak: { type: 'glb', url: 'models/korvak.glb' },
   ```
4. **Save** (on GitHub: *Commit changes* to `main`). The website rebuilds itself in about a minute.
5. **Adjust if needed** (all optional, same line):
   - Model too big/small? It is automatically resized to the monster's height. To override: `scale: 2`.
   - Floating or sunk into the ground? `yOffset: 0.5` (up) or `yOffset: -0.5` (down).
   - Facing backwards? `rotationY: Math.PI` (turns it 180°).
   - Has animations? Tell the game their names: `animations: { idle: 'Idle', walk: 'Walk', attack: 'Attack', hit: 'Hit', block: 'Block', ko: 'Death', victory: 'Roar', fly: 'Fly' }`. Missing animations are fine - the game adds simple bobbing, leaning and recoil motion.

   Full example: `korvak: { type: 'glb', url: 'models/korvak.glb', rotationY: Math.PI, animations: { idle: 'Idle', walk: 'Walk' } },`

The fighting itself never changes: hitboxes and damage still come from `src/data/monsters.js`.

## Credits
See [CREDITS.md](CREDITS.md). All sounds and music are generated in code; no external audio files are used.
