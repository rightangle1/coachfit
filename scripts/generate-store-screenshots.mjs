/**
 * Builds App Store artwork from real CoachFit Release-build screenshots.
 *
 * The headline panels, crops, and layout are editorial treatment only. Every
 * product control, value, chart, and image shown in a panel is captured from
 * the native iOS app — nothing is re-created or invented for the artwork.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'docs/release/screenshots/source');
const svgDir = resolve(root, 'docs/release/screenshots/svg');
const sourceSize = { width: 1206, height: 2622 };

const files = {
  builder: '01-builder-modes.png',
  checkin: '02-daily-checkin.png',
  recovery: '03-recovery-details.png',
  catalog: '04-exercise-catalog.png',
  formGuide: '05-form-guide.png',
  workout: '06-live-workout.png',
  progress: '07-progress-trends.png',
  home: '06-ownership-home.png',
  equipmentClip: '08-equipment-available.png',
  catalogClip: '09-catalog-preferences.png',
};

const assetSizes = {
  equipmentClip: { width: 726, height: 742 },
  catalogClip: { width: 710, height: 960 },
};

const assets = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) => {
  const png = await readFile(resolve(sourceDir, file));
  return [name, `data:image/png;base64,${png.toString('base64')}`];
})));

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const lineText = (value, x, y, className, lineHeight) => value.split('\n')
  .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="middle" class="${className}">${escape(line.toUpperCase())}</text>`)
  .join('');

function artwork({ title, accent, background = '#141A18', body, footer = '', headlineSize = 102, headlineLineHeight = 102, titleY = 180 }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1320 2868" preserveAspectRatio="none">
  <defs>
    <filter id="shadow" x="-20%" y="-16%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#06100B" flood-opacity="0.26"/>
    </filter>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${accent}"/>
      <stop offset="1" stop-color="#21352C"/>
    </linearGradient>
  </defs>
  <rect width="1320" height="2868" fill="${background}"/>
  <path d="M0 0H1320V354C1070 322 874 350 655 398C398 454 181 438 0 348Z" fill="url(#header)"/>
  ${lineText(title, 660, titleY, 'headline', headlineLineHeight)}
  ${body}
  ${footer}
  <style>
    .headline { fill: #FFFFFF; font: 900 ${headlineSize}px -apple-system, BlinkMacSystemFont, Arial Black, sans-serif; letter-spacing: -2.6px; }
  </style>
</svg>`;
}

function buildFrame(name, make) {
  let clips = '';
  let count = 0;
  const crop = (asset, { x, y, width, height, sx = 0, sy = 0, sw, sh, radius = 40, shadow = true }) => {
    const naturalSize = assetSizes[asset] ?? sourceSize;
    const sourceWidth = sw ?? naturalSize.width;
    const sourceHeight = sh ?? naturalSize.height;
    const id = `${name}-crop-${count++}`;
    const scaleX = width / sourceWidth;
    const scaleY = height / sourceHeight;
    clips += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath>`;
    return `<g${shadow ? ' filter="url(#shadow)"' : ''}>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#F7F4ED"/>
      <image href="${assets[asset]}" x="${x - sx * scaleX}" y="${y - sy * scaleY}" width="${naturalSize.width * scaleX}" height="${naturalSize.height * scaleY}" preserveAspectRatio="none" clip-path="url(#${id})"/>
      <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${height - 2}" rx="${radius - 1}" fill="none" stroke="#E7E0D5" stroke-width="2"/>
    </g>`;
  };
  const result = make({ crop });
  return result.replace('<defs>', `<defs>${clips}`);
}

const frames = [
  {
    file: '01-training-that-fits',
    make: ({ crop }) => artwork({
      title: 'Training that\nfits your day',
      headlineSize: 126,
      headlineLineHeight: 112,
      titleY: 148,
      accent: '#4D8065',
      background: '#F5F1E9',
      body: `
        ${crop('builder', { x: 38, y: 372, width: 1244, height: 2496, sx: 0, sy: 0, sw: 1206, sh: 2420, radius: 52 })}`,
    }),
  },
  {
    file: '02-plan-around-today',
    make: ({ crop }) => artwork({
      title: 'Plan around today',
      headlineSize: 114,
      titleY: 218,
      accent: '#596E4D',
      background: '#F5F1E9',
      body: `
        ${crop('recovery', { x: 38, y: 372, width: 1244, height: 1100, sx: 0, sy: 280, sw: 1206, sh: 1118, radius: 52 })}
        ${crop('checkin', { x: 38, y: 1512, width: 1244, height: 1356, sx: 0, sy: 1050, sw: 1206, sh: 1344, radius: 52 })}`,
    }),
  },
  {
    file: '03-exercises-your-rules',
    make: ({ crop }) => artwork({
      title: 'Specify your\nequipment and\nexercise preferences',
      headlineSize: 74,
      headlineLineHeight: 78,
      titleY: 114,
      accent: '#557D71',
      background: '#F5F1E9',
      body: `
        ${crop('catalogClip', { x: 150, y: 366, width: 1020, height: 1380, radius: 52 })}
        ${crop('equipmentClip', { x: 130, y: 1752, width: 1060, height: 1084, radius: 52 })}`,
    }),
  },
  {
    file: '04-keep-moving',
    make: ({ crop }) => artwork({
      title: 'Stay in the flow',
      headlineSize: 122,
      titleY: 218,
      accent: '#4D8065',
      background: '#F5F1E9',
      body: `
        ${crop('workout', { x: 38, y: 372, width: 1244, height: 2496, sx: 0, sy: 60, sw: 1206, sh: 2420, radius: 52 })}`,
    }),
  },
  {
    file: '05-progress-made-visible',
    make: ({ crop }) => artwork({
      title: 'Track your\nprogress',
      headlineSize: 126,
      headlineLineHeight: 112,
      titleY: 148,
      accent: '#5A745B',
      background: '#F5F1E9',
      body: `
        ${crop('progress', { x: 38, y: 372, width: 1244, height: 2496, sx: 0, sy: 130, sw: 1206, sh: 2420, radius: 52 })}`,
    }),
  },
  {
    file: '06-own-your-training',
    make: ({ crop }) => artwork({
      title: 'Own your training',
      headlineSize: 116,
      titleY: 218,
      accent: '#2E634A',
      background: '#F5F1E9',
      body: `
        ${crop('home', { x: 38, y: 372, width: 1244, height: 1810, sx: 0, sy: 110, sw: 1206, sh: 1828, radius: 52 })}
        <rect x="38" y="2228" width="1244" height="640" rx="52" fill="#244936" filter="url(#shadow)"/>
        <text x="124" y="2411" fill="#D7EFDC" style="font: 800 25px -apple-system, BlinkMacSystemFont, Arial, sans-serif; letter-spacing: 2.3px;">PAY ONCE</text>
        <text x="124" y="2555" fill="#FFFFFF" style="font: 900 112px -apple-system, BlinkMacSystemFont, Arial Black, sans-serif; letter-spacing: -4px;">$3.99</text>
        <text x="124" y="2665" fill="#D7EFDC" style="font: 750 38px -apple-system, BlinkMacSystemFont, Arial, sans-serif;">NO ADS · NO SUBSCRIPTIONS · NO IAP</text>` ,
    }),
  },
];

await mkdir(svgDir, { recursive: true });
for (const frame of frames) {
  const svg = buildFrame(frame.file, frame.make);
  await writeFile(resolve(svgDir, `${frame.file}.svg`), svg);
}

console.log(`Generated ${frames.length} App Store SVG masters in ${svgDir}`);
