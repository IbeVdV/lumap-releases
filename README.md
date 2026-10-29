# Lumap releases

Installers for [Lumap](https://ibevdv.github.io/lumap-releases/) — spatial lighting control — and the site
that tells Lumap which version to update to. **No source code lives here.** Each release is copied here
by Lumap's own release workflow (as a draft); publish it here, then point a channel at it.

The site (`site/`) is published by `.github/workflows/pages.yml` to https://ibevdv.github.io/lumap-releases/.

- `site/index.html` — the landing page: what Lumap is, downloads, release notes.
- `site/channels.json` — **which version each update channel offers**. Lumap only offers a version when
  a channel points to it, so a release can be held back: publish it on GitHub, test it, then point
  `beta` (or `stable`) at it. `null` offers nothing on that channel.

  Change it here (any commit to `site/` republishes), or run the **Pages** workflow by hand
  (*Actions → Pages → Run workflow*) with a channel and a version: it commits the change for you.

The workflow turns each channel's version into `updates/<channel>.json`, the signed update manifest
(`latest.json`) that the release workflow attached to that GitHub release. A release built without
the signing key has no manifest and cannot be offered. The beta channel also gets the stable version
when that one is newer. A channel can only move users forward: pointing it at an older version
holds new installs back but does not take anyone back.
