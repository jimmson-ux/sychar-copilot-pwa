const sharp = require('sharp')
const fs = require('fs')

const svg = fs.readFileSync('public/sychar-icon.svg')

async function generate() {
  await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png')
  await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png')
  await sharp(svg).resize(512, 512).png().toFile('public/icon-maskable-512.png')
  await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png')
  await sharp(svg).resize(32, 32).png().toFile('public/favicon.ico')
  console.log('Icons generated!')
}
generate()
