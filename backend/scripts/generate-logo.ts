/**
 * Generate vibrant 3D compass logo as transparent PNG
 * Run: npx ts-node scripts/generate-logo.ts
 */
import sharp from "sharp";
import * as path from "path";
import * as fs from "fs";

const SVG = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <!-- Metallic navy gradient for compass ring -->
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a2940"/>
      <stop offset="30%" stop-color="#0F1A22"/>
      <stop offset="50%" stop-color="#1e3350"/>
      <stop offset="70%" stop-color="#0F1A22"/>
      <stop offset="100%" stop-color="#162a3d"/>
    </linearGradient>

    <!-- Gold shimmer gradient for silk route path -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#D4A843"/>
      <stop offset="25%" stop-color="#F5D280"/>
      <stop offset="50%" stop-color="#C9A24D"/>
      <stop offset="75%" stop-color="#E8C95A"/>
      <stop offset="100%" stop-color="#B8912E"/>
    </linearGradient>

    <!-- Dark side gradient for 3D depth -->
    <linearGradient id="darkGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F1A22"/>
      <stop offset="30%" stop-color="#162a3d"/>
      <stop offset="60%" stop-color="#0F1A22"/>
      <stop offset="100%" stop-color="#1a2940"/>
    </linearGradient>

    <!-- Highlight gradient for 3D white stroke -->
    <linearGradient id="highlightGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="1"/>
      <stop offset="50%" stop-color="#F0E8D0" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.85"/>
    </linearGradient>

    <!-- Outer glow for depth -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>

    <!-- Drop shadow for 3D lift -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.3"/>
    </filter>

    <!-- Compass cardinal point gradient -->
    <linearGradient id="cardinalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e3350"/>
      <stop offset="100%" stop-color="#0F1A22"/>
    </linearGradient>

    <!-- Ring 3D bevel effect -->
    <linearGradient id="ringBevel" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2a4060" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#0F1A22" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.3"/>
    </linearGradient>

    <clipPath id="clipLeft"><rect x="0" y="0" width="256" height="512"/></clipPath>
    <clipPath id="clipRight"><rect x="256" y="0" width="256" height="512"/></clipPath>
  </defs>

  <!-- Main group with shadow -->
  <g filter="url(#shadow)">
    <!-- Compass ring - outer (bevel effect) -->
    <circle cx="256" cy="240" r="150" fill="none" stroke="url(#ringBevel)" stroke-width="32" stroke-linecap="round"/>
    <!-- Compass ring - main -->
    <circle cx="256" cy="240" r="150" fill="none" stroke="url(#ringGrad)" stroke-width="26" stroke-linecap="round"/>
    <!-- Thin highlight on ring inner edge -->
    <circle cx="256" cy="240" r="136" fill="none" stroke="#2a4060" stroke-width="1" stroke-opacity="0.4"/>

    <!-- Cardinal points with 3D gradient -->
    <!-- North -->
    <polygon points="256,52 238,92 274,92" fill="url(#cardinalGrad)"/>
    <polygon points="256,52 248,82 264,82" fill="#1e3350" opacity="0.5"/>
    <!-- South -->
    <polygon points="256,428 238,388 274,388" fill="url(#cardinalGrad)"/>
    <!-- West -->
    <polygon points="68,240 108,222 108,258" fill="url(#cardinalGrad)"/>
    <!-- East -->
    <polygon points="444,240 404,222 404,258" fill="url(#cardinalGrad)"/>

    <!-- Silk Route path - GOLD side (left half) -->
    <path d="M 238 345 C 188 285, 210 240, 264 218 C 332 190, 355 220, 378 242 C 414 285, 355 322, 296 345 C 246 363, 242 398, 268 425"
      fill="none" stroke="url(#goldGrad)" stroke-width="72" stroke-linecap="round" stroke-linejoin="round"
      clip-path="url(#clipLeft)" filter="url(#glow)"/>

    <!-- Silk Route path - NAVY side (right half) -->
    <path d="M 238 345 C 188 285, 210 240, 264 218 C 332 190, 355 220, 378 242 C 414 285, 355 322, 296 345 C 246 363, 242 398, 268 425"
      fill="none" stroke="url(#darkGold)" stroke-width="72" stroke-linecap="round" stroke-linejoin="round"
      clip-path="url(#clipRight)"/>

    <!-- White highlight stroke (3D edge) -->
    <path d="M 238 345 C 188 285, 210 240, 264 218 C 332 190, 355 220, 378 242 C 414 285, 355 322, 296 345 C 246 363, 242 398, 268 425"
      fill="none" stroke="url(#highlightGrad)" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

async function generate() {
  const outputPath = path.resolve(__dirname, "../assets/logo.png");

  await sharp(Buffer.from(SVG))
    .resize(512, 512)
    .png({ quality: 100 })
    .toFile(outputPath);

  console.log(`Logo generated: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);

  // Also generate a smaller version for PDFs
  const pdfLogoPath = path.resolve(__dirname, "../assets/logo-pdf.png");
  await sharp(Buffer.from(SVG))
    .resize(200, 200)
    .png({ quality: 100 })
    .toFile(pdfLogoPath);

  console.log(`PDF logo generated: ${pdfLogoPath} (${fs.statSync(pdfLogoPath).size} bytes)`);

  // Also copy to frontend public for consistency
  const frontendPath = path.resolve(__dirname, "../../frontend/public/logo-compass.png");
  await sharp(Buffer.from(SVG))
    .resize(512, 512)
    .png({ quality: 100 })
    .toFile(frontendPath);

  console.log(`Frontend logo generated: ${frontendPath}`);
}

generate().catch(console.error);
