#!/usr/bin/env node

/**
 * STRUCTURED DATA GENERATOR
 *
 * Reads images.json and injects ImageObject JSON-LD for every image
 * into the <!-- STRUCTURED-DATA:START/END --> markers in index.html.
 *
 * Includes the three optional fields GSC flags as missing:
 *   - creditText
 *   - creator
 *   - copyrightNotice
 *
 * Usage (run after generate-manifest.js):
 *   node generate-structured-data.js
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_BASE  = 'https://raw.githubusercontent.com/gro-lab/thenonconformist/main/images';
const SITE_URL     = 'https://thenonconformist.xyz';
const AUTHOR_NAME  = 'The Nonconformist';
const COPYRIGHT    = '© The Nonconformist. All rights reserved.';

const GALLERIES = {
  LoW: {
    title:       'Language of Windows',
    description: 'Window photography by The Nonconformist — Language of Windows series',
  },
  SoL: {
    title:       'Snapshots of Life',
    description: 'Street photography by The Nonconformist — Snapshots of Life series',
  },
  R: {
    title:       'Reflections',
    description: 'Reflection photography by The Nonconformist — Reflections series',
  },
  SA: {
    title:       'Street Art',
    description: 'Street art photography by The Nonconformist — Street Art series',
  },
};

const MANIFEST_PATH = path.join(__dirname, 'images.json');
const HTML_PATH     = path.join(__dirname, 'index.html');
const MARKER_START  = '<!-- STRUCTURED-DATA:START -->';
const MARKER_END    = '<!-- STRUCTURED-DATA:END -->';
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthor() {
  return { '@type': 'Person', name: AUTHOR_NAME };
}

function buildImageObject(dir, img) {
  const filename   = img.originalName;
  const contentUrl = `${GITHUB_BASE}/${dir}/${filename}`;

  const obj = {
    '@type':            'ImageObject',
    contentUrl,
    url:                SITE_URL,
    name:               `${GALLERIES[dir].title} - Photo ${img.index}`,
    description:        GALLERIES[dir].description,
    // ── Three fields GSC flags as optional but missing ──
    creditText:         AUTHOR_NAME,
    creator:            buildAuthor(),
    copyrightNotice:    COPYRIGHT,
    // ── Already present in the original blocks ──
    author:             buildAuthor(),
    copyrightHolder:    buildAuthor(),
    license:            SITE_URL,
    acquireLicensePage: SITE_URL,
  };

  // width/height help Google understand image dimensions
  if (img.width)  obj.width  = img.width;
  if (img.height) obj.height = img.height;

  return obj;
}

function buildItemList(dir, images) {
  const info = GALLERIES[dir];
  return {
    '@context':       'https://schema.org',
    '@type':          'ItemList',
    name:             `${info.title} — Photography Gallery`,
    url:              SITE_URL,
    description:      info.description,
    numberOfItems:    images.length,
    itemListElement:  images.map((img, i) => ({
      '@type':    'ListItem',
      position:   i + 1,
      item:       buildImageObject(dir, img),
    })),
  };
}

function indentJson(obj) {
  // Indent the whole JSON block by 4 spaces so it sits neatly inside <head>
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '    ' + line))
    .join('\n');
}

function main() {
  // ── Validate inputs ─────────────────────────────────────────────────────────
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ images.json not found. Run generate-manifest.js first.');
    process.exit(1);
  }

  const html = fs.readFileSync(HTML_PATH, 'utf8');

  if (!html.includes(MARKER_START) || !html.includes(MARKER_END)) {
    console.error(
      `❌ Markers not found in index.html.\n` +
      `   Add these two comments around the ImageObject JSON-LD section:\n\n` +
      `   ${MARKER_START}\n` +
      `   ${MARKER_END}`
    );
    process.exit(1);
  }

  // ── Build structured data ───────────────────────────────────────────────────
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const scriptBlocks = [];
  let totalImages = 0;

  for (const [dir, images] of Object.entries(manifest)) {
    if (!GALLERIES[dir]) {
      console.warn(`⚠️  Unknown gallery "${dir}" in manifest — skipping`);
      continue;
    }
    if (!Array.isArray(images) || images.length === 0) continue;

    const itemList = buildItemList(dir, images);
    scriptBlocks.push(
      `    <script type="application/ld+json">\n    ${indentJson(itemList)}\n    </script>`
    );
    totalImages += images.length;
    console.log(`   ✅ ${dir}: ${images.length} images`);
  }

  // ── Inject into index.html ──────────────────────────────────────────────────
  const injection = scriptBlocks.join('\n\n');
  const markerRegex = new RegExp(
    `${MARKER_START.replace(/</g, '<').replace(/>/g, '>')}[\\s\\S]*?${MARKER_END.replace(/</g, '<').replace(/>/g, '>')}`,
    // Use literal strings — the markers contain no regex special chars
  );

  const updated = html.replace(
    new RegExp(
      escapeRegex(MARKER_START) + '[\\s\\S]*?' + escapeRegex(MARKER_END)
    ),
    `${MARKER_START}\n${injection}\n    ${MARKER_END}`
  );

  if (updated === html) {
    console.error('❌ Replacement failed — markers may be malformed in index.html');
    process.exit(1);
  }

  fs.writeFileSync(HTML_PATH, updated, 'utf8');

  console.log(`\n✅ index.html updated`);
  console.log(`   ${totalImages} ImageObject entries across ${scriptBlocks.length} galleries`);
  console.log(`   All entries include creditText, creator, and copyrightNotice`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();