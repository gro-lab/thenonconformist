#!/usr/bin/env node

/**
 * Generate Sitemaps Script
 * Generates sitemap.xml, sitemap-images.xml, and updates sitemap-index.xml
 * for The Nonconformist photography website.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  siteUrl: 'https://thenonconformist.xyz',
  githubBase: 'https://raw.githubusercontent.com/gro-lab/thenonconformist/main/images',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  outputDir: '.'
};

// Gallery information
const GALLERY_INFO = {
  LoW: {
    name: 'Language of Windows',
    description: 'Window photography by The Nonconformist',
    folder: 'LoW',
    prefix: 'LoW'
  },
  SoL: {
    name: 'Snapshots of Life',
    description: 'Street photography by The Nonconformist',
    folder: 'SoL',
    prefix: 'SoL'
  },
  R: {
    name: 'Reflections',
    description: 'Reflection photography by The Nonconformist',
    folder: 'R',
    prefix: 'R'
  },
  SA: {
    name: 'Street Art',
    description: 'Street art photography by The Nonconformist',
    folder: 'SA',
    prefix: 'SA'
  }
};

/**
 * Escape special XML characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get current date in ISO format (YYYY-MM-DD)
 * @returns {string} Formatted date
 */
function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current date in W3C datetime format
 * @returns {string} Formatted datetime
 */
function getCurrentDateTime() {
  return new Date().toISOString();
}

/**
 * Load images manifest from images.json
 * @returns {Object} Manifest data
 */
function loadManifest() {
  const manifestPath = path.join(CONFIG.outputDir, 'images.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('Error: images.json not found in current directory');
    console.error('Expected path:', manifestPath);
    process.exit(1);
  }
  
  try {
    const data = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error parsing images.json:', error.message);
    process.exit(1);
  }
}

/**
 * Generate sitemap.xml with main page
 */
function generateSitemap() {
  const lastmod = getCurrentDate();
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${CONFIG.siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

  const outputPath = path.join(CONFIG.outputDir, 'sitemap.xml');
  fs.writeFileSync(outputPath, sitemap, 'utf8');
  console.log('✓ Generated sitemap.xml');
}

/**
 * Generate sitemap-images.xml with all images from all galleries
 * @param {Object} manifest - Images manifest data
 */
function generateImageSitemap(manifest) {
  const lastmod = getCurrentDate();
  let imageEntries = '';
  let totalImages = 0;
  
  // Process each gallery
  for (const [galleryKey, galleryImages] of Object.entries(manifest)) {
    const info = GALLERY_INFO[galleryKey];

    if (!info) {
      console.warn(`Warning: Unknown gallery "${galleryKey}" in manifest`);
      continue;
    }

    // galleryImages is an array of image objects from generate-manifest.js
    if (!Array.isArray(galleryImages) || galleryImages.length === 0) continue;

    for (const imageData of galleryImages) {
      const filename = imageData.originalName || `${info.prefix}-${imageData.index}.${imageData.ext}`;
      const imageUrl = `${CONFIG.githubBase}/${info.folder}/${filename}`;
      const caption = info.description;
      const title = `${info.name} - Photo ${imageData.index}`;

      imageEntries += `
    <image:image>
      <image:loc>${escapeXml(imageUrl)}</image:loc>
      <image:caption>${escapeXml(caption)}</image:caption>
      <image:title>${escapeXml(title)}</image:title>
      <image:license>${CONFIG.licenseUrl}</image:license>
    </image:image>`;

      totalImages++;
    }
  }
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${CONFIG.siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>${imageEntries}
  </url>
</urlset>`;

  const outputPath = path.join(CONFIG.outputDir, 'sitemap-images.xml');
  fs.writeFileSync(outputPath, sitemap, 'utf8');
  console.log(`✓ Generated sitemap-images.xml (${totalImages} images)`);
}

/**
 * Generate or update sitemap-index.xml
 */
function generateSitemapIndex() {
  const lastmod = getCurrentDate();
  
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${CONFIG.siteUrl}/sitemap.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${CONFIG.siteUrl}/sitemap-images.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
</sitemapindex>`;

  const outputPath = path.join(CONFIG.outputDir, 'sitemap-index.xml');
  fs.writeFileSync(outputPath, sitemapIndex, 'utf8');
  console.log('✓ Generated sitemap-index.xml');
}

/**
 * Main function
 */
function main() {
  console.log('=================================');
  console.log('Generating Sitemaps');
  console.log('=================================\n');
  
  // Load manifest
  console.log('Loading images.json...');
  const manifest = loadManifest();
  
  // Validate manifest structure
  const galleries = Object.keys(manifest);
  console.log(`Found galleries: ${galleries.join(', ')}\n`);
  
  // Generate sitemaps
  console.log('Generating sitemap files...');
  generateSitemap();
  generateImageSitemap(manifest);
  generateSitemapIndex();
  
  console.log('\n=================================');
  console.log('Sitemap generation complete!');
  console.log('=================================');
  console.log('\nGenerated files:');
  console.log('  - sitemap.xml');
  console.log('  - sitemap-images.xml');
  console.log('  - sitemap-index.xml');
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  escapeXml,
  getCurrentDate,
  getCurrentDateTime,
  generateSitemap,
  generateImageSitemap,
  generateSitemapIndex,
  CONFIG,
  GALLERY_INFO
};
