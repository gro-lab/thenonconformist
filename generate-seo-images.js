#!/usr/bin/env node

/**
 * generate-seo-images.js
 * 
 * A Node.js script that scans a local /images directory structure
 * and generates hardcoded <img> tags for SEO purposes.
 * 
 * Directory Structure Expected:
 * ../images
 * ├───LoW          (full-size images for Language of Windows gallery)
 * ├───R            (full-size images for Reflections gallery)
 * ├───SA           (full-size images for Street Art gallery)
 * ├───SoL          (full-size images for Snapshots of Life gallery)
 * └───thumbnails
 *     ├───LoW      (thumbnail images)
 *     ├───R        (thumbnail images)
 *     ├───SA       (thumbnail images)
 *     └───SoL      (thumbnail images)
 * 
 * Usage: node generate-seo-images.js
 * Output: seo-images.html (in the same directory as the script)
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Base directory for images (relative to where script is run)
  imagesBaseDir: './images',
  
  // Output HTML file name
  outputFile: 'seo-images.html',
  
  // Supported image extensions (case insensitive)
  imageExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  
  // Gallery configurations
  galleries: {
    'LoW': {
      name: 'Language of Windows',
      description: 'Language of Windows photography collection',
      thumbnailWidth: 300,
      thumbnailHeight: 200
    },
    'R': {
      name: 'Reflections',
      description: 'Reflections photography collection',
      thumbnailWidth: 300,
      thumbnailHeight: 200
    },
    'SA': {
      name: 'Street Art',
      description: 'Street Art photography collection',
      thumbnailWidth: 300,
      thumbnailHeight: 200
    },
    'SoL': {
      name: 'Snapshots of Life',
      description: 'Snapshots of Life photography collection',
      thumbnailWidth: 300,
      thumbnailHeight: 200
    }
  },
  
  // Thumbnail subdirectory name
  thumbnailsDir: 'thumbnails'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a file is an image based on its extension
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if it's an image file
 */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return CONFIG.imageExtensions.includes(ext);
}

/**
 * Format a filename for use in alt text (remove extension, replace separators)
 * @param {string} filename - The original filename
 * @returns {string} - Formatted name for alt text
 */
function formatAltText(filename) {
  // Remove extension
  const nameWithoutExt = path.basename(filename, path.extname(filename));
  
  // Replace common separators with spaces
  const formatted = nameWithoutExt
    .replace(/[_-]/g, ' ')
    .replace(/\./g, ' ')
    .trim();
  
  // Capitalize first letter of each word
  return formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Get all image files from a directory
 * @param {string} dirPath - Path to the directory
 * @returns {string[]} - Array of image filenames (sorted alphabetically)
 */
function getImagesFromDirectory(dirPath) {
  try {
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      console.warn(`⚠️  Directory not found: ${dirPath}`);
      return [];
    }
    
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      console.warn(`⚠️  Path is not a directory: ${dirPath}`);
      return [];
    }
    
    // Read directory contents
    const files = fs.readdirSync(dirPath);
    
    // Filter for image files only
    const imageFiles = files.filter(file => isImageFile(file));
    
    // Sort alphabetically for consistency
    return imageFiles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    
  } catch (error) {
    console.error(`❌ Error reading directory ${dirPath}: ${error.message}`);
    return [];
  }
}

/**
 * Generate a single img tag HTML
 * @param {string} thumbnailPath - Path to thumbnail image
 * @param {string} fullSizePath - Path to full-size image
 * @param {string} galleryName - Name of the gallery
 * @param {string} filename - Original filename
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {string} - HTML img tag
 */
function generateImgTag(thumbnailPath, fullSizePath, galleryName, filename, width, height) {
  const altText = `${galleryName} - ${formatAltText(filename)}`;
  const escapedAlt = escapeHtml(altText);
  
  // Use forward slashes for web paths
  const webThumbnailPath = thumbnailPath.replace(/\\/g, '/');
  const webFullSizePath = fullSizePath.replace(/\\/g, '/');
  
  return `    <img src="${webThumbnailPath}" 
         data-full="${webFullSizePath}"
         alt="${escapedAlt}"
         loading="lazy"
         width="${width}" height="${height}">`;
}

/**
 * Generate HTML section for a gallery
 * @param {string} galleryKey - Short key for the gallery (e.g., 'LoW')
 * @param {Object} galleryConfig - Configuration for this gallery
 * @param {string[]} images - Array of image filenames
 * @returns {string} - HTML section for the gallery
 */
function generateGallerySection(galleryKey, galleryConfig, images) {
  const lines = [];
  
  // Section comment
  lines.push(`<!-- Gallery: ${galleryConfig.name} -->`);
  lines.push(`<section class="seo-gallery" data-gallery="${galleryKey.toLowerCase()}">`);
  lines.push(`  <h2>${escapeHtml(galleryConfig.name)}</h2>`);
  lines.push(`  <div class="seo-images">`);
  
  if (images.length === 0) {
    lines.push(`    <!-- No images found in this gallery -->`);
    lines.push(`    <p class="no-images">No images available for ${escapeHtml(galleryConfig.name)}.</p>`);
  } else {
    // Generate img tag for each image
    images.forEach(filename => {
      const thumbnailPath = path.join(CONFIG.imagesBaseDir, CONFIG.thumbnailsDir, galleryKey, filename);
      const fullSizePath = path.join(CONFIG.imagesBaseDir, galleryKey, filename);
      
      const imgTag = generateImgTag(
        thumbnailPath,
        fullSizePath,
        galleryConfig.name,
        filename,
        galleryConfig.thumbnailWidth,
        galleryConfig.thumbnailHeight
      );
      
      lines.push(imgTag);
    });
  }
  
  lines.push(`  </div>`);
  lines.push(`</section>`);
  lines.push(''); // Empty line between sections
  
  return lines.join('\n');
}

/**
 * Generate the complete HTML document
 * @param {Object} galleryData - Object containing images for each gallery
 * @returns {string} - Complete HTML document
 */
function generateHtmlDocument(galleryData) {
  const sections = [];
  
  // Generate section for each gallery
  for (const [key, config] of Object.entries(CONFIG.galleries)) {
    const images = galleryData[key] || [];
    sections.push(generateGallerySection(key, config, images));
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Photo gallery collection featuring Language of Windows, Reflections, Street Art, and Snapshots of Life photography series.">
  <title>Photo Gallery Collection - SEO Image Index</title>
  <style>
    /* Basic styling for SEO gallery */
    .seo-gallery {
      margin: 2rem 0;
      padding: 1rem;
      border-bottom: 1px solid #ddd;
    }
    
    .seo-gallery h2 {
      color: #333;
      font-family: Arial, sans-serif;
      margin-bottom: 1rem;
    }
    
    .seo-images {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }
    
    .seo-images img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .no-images {
      color: #666;
      font-style: italic;
      grid-column: 1 / -1;
    }
    
    /* Hide visually but keep accessible for screen readers */
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  </style>
</head>
<body>
  <header>
    <h1>Photo Gallery Collection</h1>
    <p>Browse our photography collections: Language of Windows, Reflections, Street Art, and Snapshots of Life.</p>
  </header>
  
  <main>
${sections.join('\n')}
  </main>
  
  <footer>
    <p>&copy; ${new Date().getFullYear()} Photo Gallery. All images are property of their respective owners.</p>
  </footer>
</body>
</html>`;

  return html;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  console.log('='.repeat(60));
  console.log('  SEO Image Generator');
  console.log('  Scanning directories and generating HTML...');
  console.log('='.repeat(60));
  console.log();
  
  const galleryData = {};
  let totalImages = 0;
  
  // Process each gallery
  for (const [galleryKey, galleryConfig] of Object.entries(CONFIG.galleries)) {
    console.log(`📁 Processing gallery: ${galleryConfig.name} (${galleryKey})`);
    
    // Paths for this gallery
    const thumbnailDir = path.join(CONFIG.imagesBaseDir, CONFIG.thumbnailsDir, galleryKey);
    const fullSizeDir = path.join(CONFIG.imagesBaseDir, galleryKey);
    
    // Check if directories exist
    const thumbnailExists = fs.existsSync(thumbnailDir);
    const fullSizeExists = fs.existsSync(fullSizeDir);
    
    if (!thumbnailExists) {
      console.warn(`   ⚠️  Thumbnail directory not found: ${thumbnailDir}`);
    }
    if (!fullSizeExists) {
      console.warn(`   ⚠️  Full-size directory not found: ${fullSizeDir}`);
    }
    
    // Get images from thumbnail directory (we use thumbnails for the img src)
    const images = getImagesFromDirectory(thumbnailDir);
    galleryData[galleryKey] = images;
    totalImages += images.length;
    
    console.log(`   ✅ Found ${images.length} image(s)`);
    
    // List the images found
    if (images.length > 0) {
      images.forEach(img => {
        console.log(`      • ${img}`);
      });
    }
    
    console.log();
  }
  
  // Generate the HTML
  console.log('📝 Generating HTML file...');
  const htmlContent = generateHtmlDocument(galleryData);
  
  // Write to file
  const outputPath = path.join(process.cwd(), CONFIG.outputFile);
  
  try {
    fs.writeFileSync(outputPath, htmlContent, 'utf8');
    console.log(`✅ HTML file created successfully: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error writing HTML file: ${error.message}`);
    process.exit(1);
  }
  
  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total galleries processed: ${Object.keys(CONFIG.galleries).length}`);
  console.log(`  Total images found: ${totalImages}`);
  console.log(`  Output file: ${outputPath}`);
  console.log();
  console.log('  Next steps:');
  console.log('  1. Open the generated HTML file in a browser');
  console.log('  2. Upload the HTML file to your web server');
  console.log('  3. Submit the URL to Google Search Console for indexing');
  console.log('='.repeat(60));
}

// Run the script
main();
