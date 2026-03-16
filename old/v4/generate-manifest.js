#!/usr/bin/env node

/**
 * MANIFEST GENERATOR WITH ASPECT RATIO DETECTION
 * 
 * Scans images folder and generates images.json in the ROOT folder
 * Detects ALL images regardless of naming convention
 * Adds aspect ratio information to prevent layout jumping
 * 
 * Usage:
 *   node generate-manifest.js
 */

const fs = require('fs');
const path = require('path');

// Install with: npm install image-size
// This is a lightweight package that reads image dimensions without loading the entire image
let sizeOf;
try {
    sizeOf = require('image-size');
} catch (e) {
    console.error('❌ Please install image-size: npm install image-size');
    process.exit(1);
}

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

function getAspectRatio(width, height) {
    const ratio = width / height;
    
    // Determine if horizontal (16:9) or vertical (9:16)
    // Allow for some tolerance in aspect ratios
    if (Math.abs(ratio - (16/9)) < 0.1) {
        return { ratio: '16:9', orientation: 'horizontal', decimal: ratio };
    } else if (Math.abs(ratio - (9/16)) < 0.1) {
        return { ratio: '9:16', orientation: 'vertical', decimal: ratio };
    } else if (ratio > 1) {
        return { ratio: 'custom', orientation: 'horizontal', decimal: ratio };
    } else {
        return { ratio: 'custom', orientation: 'vertical', decimal: ratio };
    }
}

function scanGallery(galleryDir) {
    const fullPath = path.join(IMAGES_DIR, galleryDir);
    
    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️  Directory not found: ${fullPath}`);
        return [];
    }
    
    const files = fs.readdirSync(fullPath);
    const validImages = [];
    
    // First pass: collect all valid image files with dimensions
    files.forEach(file => {
        if (!isValidImage(file)) return;
        
        const filePath = path.join(fullPath, file);
        
        try {
            const dimensions = sizeOf(filePath);
            const aspectInfo = getAspectRatio(dimensions.width, dimensions.height);
            
            validImages.push({
                filename: file,
                ext: getExtension(file),
                width: dimensions.width,
                height: dimensions.height,
                aspectRatio: aspectInfo.ratio,
                orientation: aspectInfo.orientation,
                aspectDecimal: aspectInfo.decimal
            });
        } catch (error) {
            console.warn(`   ⚠️  Could not read dimensions for ${file}: ${error.message}`);
            // Still add the image but without dimension info
            validImages.push({
                filename: file,
                ext: getExtension(file),
                width: null,
                height: null,
                aspectRatio: 'unknown',
                orientation: 'unknown',
                aspectDecimal: null
            });
        }
    });
    
    // Sort alphabetically by filename
    validImages.sort((a, b) => a.filename.localeCompare(b.filename));
    
    // Assign sequential indices starting from 1
    const images = validImages.map((img, idx) => ({
        index: idx + 1,
        ext: img.ext,
        originalName: img.filename,
        width: img.width,
        height: img.height,
        aspectRatio: img.aspectRatio,
        orientation: img.orientation,
        aspectDecimal: img.aspectDecimal
    }));
    
    return images;
}

function generateManifest() {
    console.log('📦 Generating manifest with aspect ratios...\n');
    const manifest = {};
    
    GALLERIES.forEach(gallery => {
        console.log(`📂 Scanning ${gallery}...`);
        const images = scanGallery(gallery);
        manifest[gallery] = images;
        
        // Count orientations
        const horizontal = images.filter(img => img.orientation === 'horizontal').length;
        const vertical = images.filter(img => img.orientation === 'vertical').length;
        const unknown = images.filter(img => img.orientation === 'unknown').length;
        
        console.log(`   ✅ Found ${images.length} images`);
        console.log(`      🖼️  Horizontal (16:9): ${horizontal}`);
        console.log(`      📱 Vertical (9:16): ${vertical}`);
        if (unknown > 0) {
            console.log(`      ❓ Unknown orientation: ${unknown}`);
        }
        
        // Show first few filenames for verification
        if (images.length > 0) {
            console.log(`   📄 Sample: ${images[0].originalName} (${images[0].width}x${images[0].height}, ${images[0].aspectRatio})`);
            if (images.length > 1) {
                const secondImg = images[Math.min(1, images.length - 1)];
                console.log(`   📄        ${secondImg.originalName} (${secondImg.width}x${secondImg.height}, ${secondImg.aspectRatio})`);
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
    let totalHorizontal = 0;
    let totalVertical = 0;
    
    Object.keys(manifest).forEach(gallery => {
        const images = manifest[gallery];
        const count = images.length;
        const horizontal = images.filter(img => img.orientation === 'horizontal').length;
        const vertical = images.filter(img => img.orientation === 'vertical').length;
        
        totalImages += count;
        totalHorizontal += horizontal;
        totalVertical += vertical;
        
        console.log(`   ${gallery}: ${count} images (${horizontal} horizontal, ${vertical} vertical)`);
    });
    
    console.log(`   ────────────────────────────────────────`);
    console.log(`   Total: ${totalImages} images`);
    console.log(`   🖼️  ${totalHorizontal} horizontal (16:9)`);
    console.log(`   📱 ${totalVertical} vertical (9:16)`);
}

function main() {
    try {
        const manifest = generateManifest();
        writeManifest(manifest);
        console.log('\n🎉 Done! Manifest includes aspect ratio data to prevent layout jumping.');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateManifest, scanGallery };