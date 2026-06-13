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
- supports desktop and mobile Obsidian, including Android touch targets.

## Install

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
.obsidian/plugins/STS-indentation/
```

Then enable **STS-indentation** in Obsidian's Community plugins settings.

### Android manual installation

1. Download the release ZIP or the three release assets:
   `main.js`, `manifest.json`, and `styles.css`.
2. Create this folder inside the vault:

   ```text
   .obsidian/plugins/sts-indentation/
   ```

3. Put the three files directly inside that folder.
4. Restart Obsidian.
5. Open **Settings → Community plugins** and enable **STS-indentation**.

Android file managers may hide folders beginning with a dot. A file manager
that can display hidden files is required for manual installation.

## Releases

Release tags and release names use the exact plugin version without a `v`
prefix, for example `1.2.4`. Each release contains:

- `main.js`
- `manifest.json`
- `styles.css`
- `STS-indentation-android-<version>.zip`

## Build

```bash
npm install
npm run build
```
