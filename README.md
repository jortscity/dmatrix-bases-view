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
- **Rank Raws** — normalizes each criterion's raw values into competition ranks before weighted scoring; useful when criteria are on incompatible scales (e.g. price in dollars vs. quality 1–10). Shown as an "N" column alongside each raw score.
- **Per-criterion normalization** — scales only criteria whose max exceeds the target scale
- **Row grouping** — uses Bases native grouping; groups are collapsible
- **Scale toggle** — /5, /10, /100

## Requirements

Obsidian **1.9.10+** (Bases required)

## Installation

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `jortscity/dmatrix-bases-view` as a beta plugin.

## Setup

### Base file

```yaml
views:
  - type: decision-matrix
    name: My Decision
    filters:
      and:
        - file.folder == "Options"
        - 'file.ext == "md"'
        - file.name != this.file.name
    order:
      - title
      - cost
      - performance
      - quality
```

Any property in `order` with numeric values becomes a scoring criterion.

### Scores

```yaml
---
title: Option A
cost: 8
performance: 7
quality: 9
---
```

### Weights

Embed the base in a note and add `weight_<criterion>` properties:

```yaml
---
weight_cost: 3
weight_performance: 5
weight_quality: 4
---

![[my-decision.base]]
```

Weights are session-only. Edit them live in the view, or hit ↺ to reload from frontmatter.

### Rankings view

Same setup, different view type:

```yaml
views:
  - type: decision-matrix-rankings
```

Add a `cover` URL property to notes for thumbnail images in the podium cards.

## Building

```bash
npm install
npm run build
```

## License

MIT
