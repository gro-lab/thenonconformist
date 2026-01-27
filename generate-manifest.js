#!/usr/bin/env node

/**
 * MANIFEST GENERATOR
 * 
 * This script scans your images folder and generates a manifest.json file
 * that lists all available images with their extensions.
 * 
 * Usage:
 *   node generate-manifest.js
 * 
 * Run this from your project root where the 'images' folder is located.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const IMAGES_DIR = './images';
const OUTPUT_FILE = './images/manifest.json';
const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'];

// Gallery directories to scan
const GALLERIES = ['LoW', 'SoL', 'R', 'SA'];

/**
 * Extract index number from filename
 * e.g., "LoW-5.JPEG" -> 5
 */
function extractIndex(filename, prefix) {
    const match = filename.match(new RegExp(`^${prefix}-(\\d+)\\.`, 'i'));
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Get file extension from filename
 */
function getExtension(filename) {
    return path.extname(filename).slice(1); // Remove the dot
}

/**
 * Scan a gallery directory and return image metadata
 */
function scanGallery(galleryDir) {
    const fullPath = path.join(IMAGES_DIR, galleryDir);
    
    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️  Directory not found: ${fullPath}`);
        return [];
    }
    
    const files = fs.readdirSync(fullPath);
    const images = [];
    
    files.forEach(file => {
        const ext = getExtension(file);
        
        // Check if it's a valid image file
        if (!VALID_EXTENSIONS.includes(ext)) {
            return;
        }
        
        const index = extractIndex(file, galleryDir);
        
        if (index === null) {
            console.warn(`⚠️  Skipping file with invalid naming: ${file}`);
            return;
        }
        
        images.push({
            index: index,
            ext: ext
        });
    });
    
    // Sort by index
    images.sort((a, b) => a.index - b.index);
    
    return images;
}

/**
 * Generate the complete manifest
 */
function generateManifest() {
    console.log('📦 Generating manifest...\n');
    
    const manifest = {};
    
    GALLERIES.forEach(gallery => {
        console.log(`📂 Scanning ${gallery}...`);
        const images = scanGallery(gallery);
        manifest[gallery] = images;
        console.log(`   ✅ Found ${images.length} images\n`);
    });
    
    return manifest;
}

/**
 * Write manifest to file
 */
function writeManifest(manifest) {
    const json = JSON.stringify(manifest, null, 2);
    
    // Ensure images directory exists
    if (!fs.existsSync(IMAGES_DIR)) {
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, json, 'utf8');
    console.log(`✅ Manifest written to: ${OUTPUT_FILE}`);
    
    // Print summary
    console.log('\n📊 Summary:');
    let totalImages = 0;
    Object.keys(manifest).forEach(gallery => {
        const count = manifest[gallery].length;
        totalImages += count;
        console.log(`   ${gallery}: ${count} images`);
    });
    console.log(`   Total: ${totalImages} images`);
}

/**
 * Main execution
 */
function main() {
    try {
        const manifest = generateManifest();
        writeManifest(manifest);
        console.log('\n🎉 Done!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { generateManifest, scanGallery };