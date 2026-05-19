# Decision Matrix Bases View

This plugin lets you build decision matrices inside [Obsidian Bases](https://help.obsidian.md/bases). A decision matrix combines your raw scores for different options across various criteria with how much each criterion matters to you — giving you an objective framework for making a choice.

## Features

- Two views: a scoring table with weighted totals and rankings, and a visual rankings view with a podium and card list
- Click any score to edit it; changes save to the note's frontmatter straight away
- Rows are ranked by weighted average
- An empty cell means you haven't scored it yet; a 0 means you deliberately gave it zero — both count as 0 in the calculation
- Negative weights let you penalize criteria where a higher value is worse (e.g. cost, risk)
- Rank Raws: when criteria are on incompatible scales (e.g. price in dollars vs. quality out of 10), you can convert a column's values to competition ranks before scoring. The ranked position is shown alongside the original value.
- Collapsible row groups
- Score out of 5, 10, or 100 — switchable per view

## Installation

Requires Obsidian **1.9.10+** with Bases enabled.

Search for **Decision Matrix Bases View** in Settings → Community Plugins.

## Setup

**The fastest way to get started:** go to Settings → Decision Matrix and hit **Create examples**. It drops a ready-to-use folder into your vault — four notes, a base file, and a decision note with weights already configured. Open it and you'll see both views in action.

![Decision Matrix example](assets/screenshot.png)

### How it works

The view pulls scores from any notes in your vault. The only requirement is that those notes have **numeric properties** — those automatically become your scoring criteria.

**Naming your properties**

Use whatever property names make sense (`cost`, `quality`, `ease_of_use`). If you want to keep them grouped with a shared prefix in your vault (e.g. `score_cost`, `score_quality`), set that prefix in Settings and the view strips it from column headers automatically.

**Keeping weights between sessions**

Weights you set in the view are session-only by default. To make them stick, add `weight_<propertyname>` properties to the note that contains `![[yourfile.base]]` — for example, `weight_cost: 3`. The view loads those every time it opens, and you can reset to them at any time with the ↺ button.

## License

MIT
