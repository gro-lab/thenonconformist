// generate-thumbnails.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const GALLERIES = ['LoW', 'SoL', 'R', 'SA'];
const INPUT_DIR = './images';
const OUTPUT_DIR = './images/thumbnails';
const THUMB_WIDTH = 400;
const QUALITY = 70;

async function generateThumbnails() {
    for (const gallery of GALLERIES) {
        const inputPath = path.join(INPUT_DIR, gallery);
        const outputPath = path.join(OUTPUT_DIR, gallery);
        
        // Create output directory
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
        
        const files = fs.readdirSync(inputPath);
        
        for (const file of files) {
            if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue;
            
            const input = path.join(inputPath, file);
            const output = path.join(outputPath, file);
            
            await sharp(input)
                .resize(THUMB_WIDTH, null, { 
                    withoutEnlargement: true,
                    fit: 'inside'
                })
                .jpeg({ quality: QUALITY, progressive: true })
                .toFile(output);
            
            console.log(`✅ ${gallery}/${file}`);
        }
    }
}

generateThumbnails().catch(console.error);