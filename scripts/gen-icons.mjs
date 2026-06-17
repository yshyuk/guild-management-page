// 앱 아이콘 생성: zinc 배경 + 흰 방패 + 검 심볼 → PNG 3종
// 실행: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = '#18181b';
const FG = '#fafafa';

// 방패 + 검 심볼. scale=심볼 크기 비율(maskable은 작게 잡아 안전영역 확보)
function svg(scale) {
  // 512 기준, 중심 256. 방패 외곽을 scale로 축소
  const cx = 256;
  const s = scale; // 0~1
  const halfW = 150 * s;
  const top = 256 - 170 * s;
  const shoulder = 256 - 90 * s;
  const bottom = 256 + 180 * s;
  const waist = 256 + 40 * s;
  const shield = `M${cx} ${top} L${cx + halfW} ${shoulder} V${waist} C${cx + halfW} ${256 + 110 * s} ${cx + 80 * s} ${256 + 150 * s} ${cx} ${bottom} C${cx - 80 * s} ${256 + 150 * s} ${cx - halfW} ${256 + 110 * s} ${cx - halfW} ${waist} V${shoulder} Z`;
  // 검(방패 안, 배경색으로 음각): 칼날 + 크로스가드 + 손잡이
  const bw = 20 * s;            // blade half-width
  const bladeTop = top + 55 * s;
  const bladeBot = bottom - 70 * s;
  const guardY = shoulder + 70 * s;
  const guardHalf = 70 * s;
  const gh = 13 * s;
  const sword = `
    <rect x="${cx - bw}" y="${bladeTop}" width="${bw * 2}" height="${bladeBot - bladeTop}" rx="${bw}" fill="${BG}"/>
    <rect x="${cx - guardHalf}" y="${guardY - gh}" width="${guardHalf * 2}" height="${gh * 2}" rx="${gh}" fill="${BG}"/>
    <circle cx="${cx}" cy="${bladeBot + 6 * s}" r="${18 * s}" fill="${BG}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="96" fill="${BG}"/>
    <path d="${shield}" fill="${FG}"/>
    ${sword}
  </svg>`);
}

const targets = [
  { name: 'icon-192.png', size: 192, scale: 0.92 },
  { name: 'icon-512.png', size: 512, scale: 0.92 },
  { name: 'maskable-512.png', size: 512, scale: 0.66 }, // 안전영역(내부 80%) 안에 배치
];

for (const t of targets) {
  await sharp(svg(t.scale)).resize(t.size, t.size).png().toFile(join(outDir, t.name));
  console.log('wrote', t.name);
}
