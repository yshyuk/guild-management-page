// 앱 아이콘 생성 (변형 B: zinc 그라데이션 + 흰 방패 + 단일 검) → public/icons/*.png
// 실행: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const cx = 256, cy = 256;

// 위를 향한 검 1자루(원점 기준)
function sword(color) {
  return `
    <rect x="-9" y="-150" width="18" height="232" rx="9" fill="${color}"/>
    <rect x="-46" y="64" width="92" height="16" rx="8" fill="${color}"/>
    <rect x="-7" y="80" width="14" height="52" rx="7" fill="${color}"/>
    <circle cx="0" cy="140" r="13" fill="${color}"/>`;
}

function shieldPath(s) {
  const halfW = 150 * s, top = cy - 172 * s, shoulder = cy - 92 * s;
  const bottom = cy + 182 * s, waist = cy + 42 * s;
  return `M${cx} ${top} L${cx + halfW} ${shoulder} V${waist} C${cx + halfW} ${cy + 112 * s} ${cx + 80 * s} ${cy + 152 * s} ${cx} ${bottom} C${cx - 80 * s} ${cy + 152 * s} ${cx - halfW} ${cy + 112 * s} ${cx - halfW} ${waist} V${shoulder} Z`;
}

// rounded: 모서리 둥근 정도(maskable은 0=풀블리드), s: 심볼 크기 비율
function svg(rounded, s) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f3f46"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs>
    <rect width="512" height="512" rx="${rounded}" fill="url(#g)"/>
    <path d="${shieldPath(s)}" fill="#fafafa"/>
    <g transform="translate(${cx},${cy + 6}) scale(${0.78 * s})">${sword('#27272a')}</g>
  </svg>`);
}

const targets = [
  { name: 'icon-192.png', size: 192, rounded: 36, scale: 0.92 },
  { name: 'icon-512.png', size: 512, rounded: 96, scale: 0.92 },
  { name: 'maskable-512.png', size: 512, rounded: 0, scale: 0.66 }, // 안전영역(내부 80%) 안에 배치 + 풀블리드
];

for (const t of targets) {
  await sharp(svg(t.rounded, t.scale)).resize(t.size, t.size).png().toFile(join(outDir, t.name));
  console.log('wrote', t.name);
}
