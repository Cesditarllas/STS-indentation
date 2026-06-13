# STS-indentation

An Obsidian plugin that:

- indents headings and body blocks by their actual heading ancestry;
- treats the first heading as depth zero, regardless of whether it is H1-H6;
- supports lists, tasks, code blocks, images, quotes, tables, math, callouts, and embeds;
- draws one guide per parent heading;
- can color each guide from its corresponding parent heading;
- can keep native fold arrows visible on their corresponding guide lines;
- provides a master indentation toggle plus guide, arrow, color, and width settings;
- supports Live Preview, Source mode, and Reading view.

## Install

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
.obsidian/plugins/STS-indentation/
```

Then enable **STS-indentation** in Obsidian's Community plugins settings.

## Build

```bash
npm install
npm run build
```
