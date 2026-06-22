// 아이콘 변형 미리보기 생성 → /tmp/icon-variants/*.png
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const out = '/tmp/icon-variants';
mkdirSync(out, { recursive: true });

const cx = 256, cy = 256;

// 위를 향한 검 1자루(원점 기준). 반환: path 문자열들
function swordParts(color) {
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

function bg(kind) {
  if (kind === 'indigo') return `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#3730a3"/></linearGradient></defs>
    <rect width="512" height="512" rx="96" fill="url(#g)"/>`;
  if (kind === 'rose') return `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27272a"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs>
    <rect width="512" height="512" rx="96" fill="url(#g)"/>`;
  return `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f3f46"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs>
    <rect width="512" height="512" rx="96" fill="url(#g)"/>`;
}

// A: 다크 zinc + 흰 방패 + 교차 검(다크 음각)
function variantA(s = 0.92) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${bg('zinc')}
    <path d="${shieldPath(s)}" fill="#fafafa"/>
    <g transform="translate(${cx},${cy}) scale(${0.62 * s})">
      <g transform="rotate(33)">${swordParts('#27272a')}</g>
      <g transform="rotate(-33)">${swordParts('#27272a')}</g>
    </g>
  </svg>`);
}

// B: 다크 zinc + 흰 방패 + 단일 검(다크 음각) — 심플
function variantB(s = 0.92) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${bg('zinc')}
    <path d="${shieldPath(s)}" fill="#fafafa"/>
    <g transform="translate(${cx},${cy + 6}) scale(${0.78 * s})">${swordParts('#27272a')}</g>
  </svg>`);
}

// C: 인디고 그라데이션 + 흰 방패 + 교차 검 — 게임 느낌
function variantC(s = 0.92) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${bg('indigo')}
    <path d="${shieldPath(s)}" fill="#ffffff"/>
    <g transform="translate(${cx},${cy}) scale(${0.62 * s})">
      <g transform="rotate(33)">${swordParts('#3730a3')}</g>
      <g transform="rotate(-33)">${swordParts('#3730a3')}</g>
    </g>
  </svg>`);
}

const variants = { A: variantA(), B: variantB(), C: variantC() };
for (const [k, svg] of Object.entries(variants)) {
  await sharp(svg).resize(512, 512).png().toFile(`${out}/variant-${k}.png`);
  console.log('wrote', `${out}/variant-${k}.png`);
}
