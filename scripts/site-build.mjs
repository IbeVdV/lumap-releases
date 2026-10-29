#!/usr/bin/env node
// Builds the Lumap site for GitHub Pages, and moves update channels (see README.md).
//
//   node scripts/site-build.mjs build <out dir>     the site, with updates/<channel>.json
//   node scripts/site-build.mjs set <channel> [v]   point a channel at version v (none: offer nothing)
//
// A channel's manifest is the `latest.json` that the release workflow attached to that version's
// GitHub release (signed update files per platform). The beta channel offers the stable version
// instead when that one is newer. Needs the GitHub CLI (`gh`) with access to the repository.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Below 0 when `a` is older than `b` (as Lumap's app/src/updates/version.ts); NaN when not a version. */
function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v).trim());
    return m ? { core: [+m[1], +m[2], +m[3]], pre: m[4]?.split(".") ?? [] } : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn && +p !== +q) return +p - +q;
    if (pn !== qn) return pn ? -1 : 1;
    if (!pn && p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

const root = new URL("..", import.meta.url).pathname;
const channelsFile = join(root, "site", "channels.json");
const CHANNELS = ["stable", "beta"];
const [command, ...args] = process.argv.slice(2);

const readChannels = () => JSON.parse(readFileSync(channelsFile, "utf8"));

/** The manifest of a published release, or null (not published, or built without the signing key). */
function manifest(version) {
  const dir = mkdtempSync(join(tmpdir(), "lumap-manifest-"));
  try {
    execFileSync("gh", ["release", "download", `v${version}`, "--pattern", "latest.json", "--dir", dir], { stdio: ["ignore", "ignore", "pipe"] });
    const m = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
    const draft = execFileSync("gh", ["release", "view", `v${version}`, "--json", "isDraft", "--jq", ".isDraft"], { encoding: "utf8" }).trim();
    if (draft === "true") {
      console.warn(`v${version} is still a draft: publish it on GitHub first`);
      return null;
    }
    return m;
  } catch (e) {
    console.warn(`v${version} has no update manifest (not released, or built without the signing key): ${String(e.stderr ?? e.message).trim()}`);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (command === "set") {
  const [channel, version] = args;
  if (!CHANNELS.includes(channel)) throw new Error(`channel must be one of ${CHANNELS.join(", ")}`);
  const v = version?.trim().replace(/^v/, "") || null;
  if (v && Number.isNaN(compareVersions(v, "0.0.0"))) throw new Error(`not a version: ${version}`);
  if (v && !manifest(v)) throw new Error(`v${v} cannot be offered: publish it (built with the signing key) first`);
  const channels = readChannels();
  channels[channel] = v;
  writeFileSync(channelsFile, `${JSON.stringify(channels, null, 2)}\n`);
  console.log(`${channel} now offers ${v ?? "nothing"}`);
} else if (command === "build") {
  const out = args[0] ?? "_site";
  rmSync(out, { recursive: true, force: true });
  cpSync(join(root, "site"), out, { recursive: true });
  rmSync(join(out, "README.md"), { force: true });
  mkdirSync(join(out, "updates"), { recursive: true });
  const channels = readChannels();
  const found = {};
  for (const c of CHANNELS) found[c] = channels[c] ? manifest(channels[c]) : null;
  // Beta testers also get a stable version that is newer than the beta.
  if (found.stable && (!found.beta || compareVersions(found.stable.version.replace(/^v/, ""), found.beta.version.replace(/^v/, "")) > 0)) found.beta = found.stable;
  for (const c of CHANNELS) {
    if (!found[c]) continue;
    writeFileSync(join(out, "updates", `${c}.json`), `${JSON.stringify(found[c], null, 2)}\n`);
    console.log(`updates/${c}.json → ${found[c].version}`);
  }
  if (!existsSync(join(out, ".nojekyll"))) writeFileSync(join(out, ".nojekyll"), "");
} else {
  console.error("usage: site-build.mjs build <out dir> | set <channel> [version]");
  process.exit(2);
}
