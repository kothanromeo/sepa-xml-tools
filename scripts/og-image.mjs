// Génère public/og.png (1200×630), l'image affichée quand on partage le site
// sur LinkedIn, Slack, X… Usage : node scripts/og-image.mjs
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b3a57"/>
      <stop offset="1" stop-color="#0b5c8c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(850 120)">
    <rect x="0" y="0" width="250" height="330" rx="18" fill="#ffffff"/>
    <rect x="28" y="36" width="130" height="14" rx="7" fill="#0b5c8c"/>
    <g fill="#000">
      <rect x="40" y="80" width="170" height="170" fill="#fff" stroke="#0f1720" stroke-width="2"/>
      <rect x="52" y="92" width="44" height="44"/><rect x="62" y="102" width="24" height="24" fill="#fff"/><rect x="68" y="108" width="12" height="12"/>
      <rect x="154" y="92" width="44" height="44"/><rect x="164" y="102" width="24" height="24" fill="#fff"/><rect x="170" y="108" width="12" height="12"/>
      <rect x="52" y="194" width="44" height="44"/><rect x="62" y="204" width="24" height="24" fill="#fff"/><rect x="68" y="210" width="12" height="12"/>
      <rect x="108" y="96" width="10" height="10"/><rect x="124" y="112" width="10" height="10"/><rect x="108" y="140" width="10" height="10"/>
      <rect x="140" y="150" width="10" height="10"/><rect x="164" y="170" width="10" height="10"/><rect x="120" y="180" width="10" height="10"/>
      <rect x="150" y="204" width="10" height="10"/><rect x="180" y="220" width="10" height="10"/><rect x="112" y="222" width="10" height="10"/>
    </g>
    <rect x="-40" y="262" width="200" height="56" rx="12" fill="#0f1720"/>
    <text x="-20" y="298" font-family="Consolas, monospace" font-size="22" fill="#7fd1ff">&lt;pain.001&gt;</text>
    <circle cx="226" cy="300" r="46" fill="#1a7f4b" stroke="#ffffff" stroke-width="6"/>
    <text x="226" y="318" text-anchor="middle" font-family="Arial, sans-serif" font-size="50" font-weight="700" fill="#fff">€</text>
  </g>
  <text x="80" y="200" font-family="Segoe UI, Arial, sans-serif" font-size="84" font-weight="700" fill="#ffffff">SEPA XML Tools</text>
  <text x="80" y="275" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#d5e7f3">Virements et prélèvements</text>
  <text x="80" y="325" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#d5e7f3">SEPA depuis Excel, en XML</text>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="600">
    <rect x="80" y="400" width="300" height="52" rx="26" fill="#ffffff" fill-opacity="0.14"/>
    <text x="104" y="435" fill="#ffffff">100 % navigateur</text>
    <rect x="400" y="400" width="200" height="52" rx="26" fill="#ffffff" fill-opacity="0.14"/>
    <text x="424" y="435" fill="#ffffff">Gratuit</text>
    <rect x="620" y="400" width="200" height="52" rx="26" fill="#ffffff" fill-opacity="0.14"/>
    <text x="644" y="435" fill="#ffffff">Open source</text>
  </g>
  <text x="80" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#9fc3da">pain.001 · pain.008 · virement instantané · QR code EPC</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/og.png');
console.log('public/og.png généré');
