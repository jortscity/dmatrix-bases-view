# Decision Matrix Bases View

A custom [Obsidian Bases](https://help.obsidian.md/bases) view that turns your notes into a weighted decision matrix — score options across criteria, apply weights, and get ranked results.

## Features

- **Raw scores table** — inline editable scores written back to note frontmatter
- **Weighted scores table** — per-criterion weights with a weighted average and rank (#1 / #2 / #3 highlights, tie detection)
- **Weight pre-fill** — embed the base in a note with `weight_<criterion>: N` frontmatter and weights load automatically
- **Per-criterion normalization** — scales down only the criteria whose values exceed the target scale
- **Negative weights** — penalize criteria by entering a negative weight
- **Scale toggle** — switch between /5, /10, and /100 scoring in the toolbar
- **Click-to-open** — click a note name to open it

## Requirements

- Obsidian **1.9.10+** (Bases support required)

## Installation

### Manual

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/jortscity/dmatrix-bases-view/releases/latest)
2. Copy them to `.obsidian/plugins/decision-matrix-bases-view/` in your vault
3. Enable the plugin in Settings → Community plugins

## Usage

### 1. Create a base

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

Each property in `order` that has numeric values on the queried notes becomes a scoring criterion.

### 2. Add scores to notes

```yaml
---
title: Option A
cost: 8
performance: 7
quality: 9
---
```

### 3. Set weights (optional)

Embed the base in a note and add `weight_<criterion>` properties to that note's frontmatter:

```yaml
---
weight_cost: 3
weight_performance: 5
weight_quality: 4
---

![[my-decision.base]]
```

Weights load automatically when the base is viewed from that note. Use the reload button (↺) in the toolbar to refresh them. Weights are session-only and never persisted.

### Settings

- **Default scale** — sets the scoring scale for new views (5, 10, or 100)
- **Create examples** — generates sample laptop-comparison notes to explore the view

## Building from source

```bash
npm install
npm run build
```

The built `main.js` is output to the project root.

## License

MIT
