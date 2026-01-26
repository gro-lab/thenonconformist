// ============================================
// IMAGE MANIFEST GENERATOR
// Run: node generate-manifest.js
// ============================================

const fs = require('fs');
const path = require('path');

const galleries = ['LoW', 'SoL', 'R', 'SA'];
const manifest = {};

galleries.forEach(dir => {
    const dirPath = path.join(__dirname, 'images', dir);
    
    if (!fs.existsSync(dirPath)) {
        console.warn(`⚠️  Directory not found: ${dirPath}`);
        manifest[dir] = [];
        return;
    }
    
    const files = fs.readdirSync(dirPath);
    
    manifest[dir] = files
        .filter(file => /\.(jpe?g|png)$/i.test(file))
        .map(file => {
            // Match pattern: LoW-1.JPEG, SoL-2.jpg, etc.
            const match = file.match(/^(\w+)-(\d+)\.(\w+)$/i);
            if (match) {
                return {
                    index: parseInt(match[2]),
                    ext: match[3]
                };
            }
            return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.index - b.index);
    
    console.log(`📸 ${dir}: Found ${manifest[dir].length} images`);
});

// Write manifest
const output = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(__dirname, 'images.json'), output);

console.log('\n✅ Generated images.json:');
console.log(output);