// generate-thumbnails.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const GALLERIES = ['LoW', 'SoL', 'R', 'SA'];
const INPUT_DIR = './images';
const OUTPUT_DIR = './images/thumbnails';
const THUMB_SIZE = 300;           // target dimension for the longer side
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

            try {
                // Get image dimensions
                const metadata = await sharp(input).metadata();
                const { width, height } = metadata;

                let resizeOptions;
                if (width > height) {
                    // Landscape: fix height, auto width
                    resizeOptions = { height: THUMB_SIZE, withoutEnlargement: true };
                } else {
                    // Portrait or square: fix width, auto height
                    resizeOptions = { width: THUMB_SIZE, withoutEnlargement: true };
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