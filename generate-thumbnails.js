// generate-thumbnails.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const GALLERIES = ['LoW', 'SoL', 'R', 'SA'];
const INPUT_DIR = './images';
const OUTPUT_DIR = './images/thumbnails';
const THUMB_SIZE = 200; // target size for the longer side
const QUALITY = 70;

async function generateThumbnails() {
    for (const gallery of GALLERIES) {
        const inputPath = path.join(INPUT_DIR, gallery);
        const outputPath = path.join(OUTPUT_DIR, gallery);
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
        
        const files = fs.readdirSync(inputPath);
        
        for (const file of files) {
            if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue;
            
            const input = path.join(inputPath, file);
            const output = path.join(outputPath, file);
            
            try {
                // Read image metadata to determine orientation
                const metadata = await sharp(input).metadata();
                
                // Prepare resize options based on aspect ratio
                let resizeOptions = { withoutEnlargement: true };
                if (metadata.width > metadata.height) {
                    // Landscape: set height to THUMB_SIZE, width scales
                    resizeOptions.height = THUMB_SIZE;
                } else {
                    // Portrait or square: set width to THUMB_SIZE, height scales
                    resizeOptions.width = THUMB_SIZE;
                }
                
                await sharp(input)
                    .resize(resizeOptions)
                    .jpeg({ quality: QUALITY, progressive: true })
                    .toFile(output);
                
                console.log(`✅ ${gallery}/${file}`);
            } catch (err) {
                console.error(`❌ Error processing ${gallery}/${file}:`, err.message);
            }
        }
    }
}

generateThumbnails().catch(console.error);