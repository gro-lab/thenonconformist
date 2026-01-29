#!/usr/bin/env node

/**
 * MANIFEST GENERATOR
 * 
 * Scans images folder and generates images.json in the ROOT folder
 * Detects ALL images regardless of naming convention
 * 
 * Usage:
 *   node generate-manifest.js
 */

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = './images';
const OUTPUT_FILE = './images.json';  // Output to ROOT folder
const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'];
const GALLERIES = ['LoW', 'SoL', 'R', 'SA'];

function getExtension(filename) {
    return path.extname(filename).slice(1);
}

function isValidImage(filename) {
    const ext = getExtension(filename);
    return VALID_EXTENSIONS.includes(ext);
}

function scanGallery(galleryDir) {
    const fullPath = path.join(IMAGES_DIR, galleryDir);
    
    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️  Directory not found: ${fullPath}`);
        return [];
    }
    
    const files = fs.readdirSync(fullPath);
    const validImages = [];
    
    // First pass: collect all valid image files
    files.forEach(file => {
        if (!isValidImage(file)) return;
        
        const filePath = path.join(fullPath, file);
        const stats = fs.statSync(filePath);
        
        validImages.push({
            filename: file,
            ext: getExtension(file)
        });
    });
    
    // Sort alphabetically by filename
    validImages.sort((a, b) => a.filename.localeCompare(b.filename));
    
    // Assign sequential indices starting from 1
    const images = validImages.map((img, idx) => ({
        index: idx + 1,
        ext: img.ext,
        originalName: img.filename
    }));
    
    return images;
}

function generateManifest() {
    console.log('📦 Generating manifest...\n');
    const manifest = {};
    
    GALLERIES.forEach(gallery => {
        console.log(`📂 Scanning ${gallery}...`);
        const images = scanGallery(gallery);
        manifest[gallery] = images;
        console.log(`   ✅ Found ${images.length} images`);
        
        // Show first few filenames for verification
        if (images.length > 0) {
            console.log(`   📄 Sample: ${images[0].originalName}`);
            if (images.length > 1) {
                console.log(`   📄        ${images[Math.min(1, images.length - 1)].originalName}`);
            }
        }
        console.log('');
    });
    
    return manifest;
}

function writeManifest(manifest) {
    const json = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(OUTPUT_FILE, json, 'utf8');
    console.log(`✅ Manifest written to: ${OUTPUT_FILE}`);
    
    console.log('\n📊 Summary:');
    let totalImages = 0;
    Object.keys(manifest).forEach(gallery => {
        const count = manifest[gallery].length;
        totalImages += count;
        console.log(`   ${gallery}: ${count} images`);
    });
    console.log(`   Total: ${totalImages} images`);
}

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

if (require.main === module) {
    main();
}

module.exports = { generateManifest, scanGallery };