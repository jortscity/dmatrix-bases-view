# Decision Matrix Bases View

A custom [Obsidian Bases](https://help.obsidian.md/bases) view for weighted decision-making. Score options across criteria, set weights, get ranked results.

## Features

- **Two view types** — `decision-matrix` (full scoring table) and `decision-matrix-rankings` (podium + ranked card list)
- **Inline score editing** — click any cell to edit; written back to frontmatter immediately
- **Weighted scoring** — per-criterion weights, weighted average, ranked rows with tie detection
- **Blank vs. zero** — unset scores display blank; explicit 0 is a deliberate judgment. Both treat as 0 in calculations.
- **Weight pre-fill** — add `weight_<criterion>: N` to the embedding note's frontmatter; weights load on open and reset via the ↺ button
- **Negative weights** — penalize criteria; denominator uses `Σ|weight|` so scale stays consistent
- **Score prefix stripping** — set a prefix (e.g. `score_`) in settings to strip it from display names
- **Rank Raws** — per-column checkboxes in the Raw Scores table header row; enable per-criterion to convert that column's raw values into competition ranks before weighted scoring. Useful when criteria are on incompatible scales (e.g. price in dollars vs. quality 1–10). Ranked value is shown prominently with the raw score below for reference.
- **Per-criterion normalization** — scales only criteria whose max exceeds the target scale
- **Row grouping** — uses Bases native grouping; groups are collapsible
- **Scale toggle** — /5, /10, /100

## Installation

Requires Obsidian **1.9.10+** with Bases enabled.

Search for **Decision Matrix Bases View** in Settings → Community Plugins.

Alternatively, install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) using `jortscity/dmatrix-bases-view`.

## Setup

**The fastest way to get started:** go to Settings → Decision Matrix and hit **Create examples**. It drops a ready-to-use folder into your vault — four notes, a base file, and a decision note with weights already configured. Open it and you'll see both views in action.

### How it works

The view pulls scores from any notes in your vault. The only requirement is that those notes have **numeric properties** — those automatically become your scoring criteria.

**Naming your properties**

Use whatever property names make sense (`cost`, `quality`, `ease_of_use`). If you want to keep them grouped with a shared prefix in your vault (e.g. `score_cost`, `score_quality`), set that prefix in Settings and the view strips it from column headers automatically.

**Keeping weights between sessions**

Weights you set in the view are session-only by default. To make them stick, add `weight_<propertyname>` properties to the note that contains `![[yourfile.base]]` — for example, `weight_cost: 3`. The view loads those every time it opens, and you can reset to them at any time with the ↺ button.

## Building

```bash
npm install
npm run build
```

## License

MIT
