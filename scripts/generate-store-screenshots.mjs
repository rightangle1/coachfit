/**
 * Builds the App Store artwork from real CoachFit Release screenshots.
 *
 * The cream canvas, green curved callout panel, editorial headline, and crop
 * treatment are separate from the product capture. No product UI is invented.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'docs/release/screenshots/source');
const svgDir = resolve(root, 'docs/release/screenshots/svg');
const sourceSize = { width: 1125, height: 2436 };

const files = {
  explore: 'rev2-explore-landing.png',
  movements: 'rev2-movement-list.png',
  bodyMap: 'rev2-body-map.png',
  equipment: 'rev2-equipment.png',
  modes: 'rev2-workout-modes.png',
  flow: 'rev2-workout-flow.png',
  logging: 'rev2-set-logging.png',
  formGuide: 'rev2-form-guide.png',
  progress: 'rev2-progress-dashboard.png',
  calendar: 'rev2-progress-calendar.png',
};

const assets = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) => {
  const png = await readFile(resolve(sourceDir, file));
  return [name, `data:image/png;base64,${png.toString('base64')}`];
})));

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const headline = (value, y, size, lineHeight) => value.split('\n')
  .map((line, index) => `<text x="660" y="${y + index * lineHeight}" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="${size}" font-weight="900" letter-spacing="-2.6">${escape(line.toUpperCase())}</text>`)
  .join('');

function artwork({ title, accent, body, headlineSize = 112, headlineLineHeight = 104, titleY = 208 }) {
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
  <rect width="1320" height="2868" fill="#101116"/>
  <path d="M0 0H1320V354C1070 322 874 350 655 398C398 454 181 438 0 348Z" fill="url(#header)"/>
  ${headline(title, titleY, headlineSize, headlineLineHeight)}
  ${body}
</svg>`;
}

function buildFrame(name, make) {
  let clips = '';
  let count = 0;
  const crop = (asset, { x = 38, y = 372, width = 1244, height = 2496, sx = 0, sy = 0, sw = sourceSize.width, sh = 2259, radius = 52 } = {}) => {
    const id = `${name}-crop-${count++}`;
    const scaleX = width / sw;
    const scaleY = height / sh;
    clips += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath>`;
    return `<g filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#171925"/>
      <image href="${assets[asset]}" x="${x - sx * scaleX}" y="${y - sy * scaleY}" width="${sourceSize.width * scaleX}" height="${sourceSize.height * scaleY}" preserveAspectRatio="none" clip-path="url(#${id})"/>
      <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${height - 2}" rx="${radius - 1}" fill="none" stroke="#45475D" stroke-width="2"/>
    </g>`;
  };
  const svg = make({ crop });
  return svg.replace('<defs>', `<defs>${clips}`);
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
      body: crop('explore'),
    }),
  },
  {
    file: '02-plan-around-today',
    make: ({ crop }) => artwork({
      title: 'Find the move\nthat fits',
      headlineSize: 110,
      headlineLineHeight: 104,
      titleY: 148,
      accent: '#596E4D',
      body: crop('movements'),
    }),
  },
  {
    file: '03-exercises-your-rules',
    make: ({ crop }) => artwork({
      title: 'Start with\nyour body',
      headlineSize: 120,
      headlineLineHeight: 110,
      titleY: 148,
      accent: '#557D71',
      body: crop('bodyMap'),
    }),
  },
  {
    file: '04-keep-moving',
    make: ({ crop }) => artwork({
      title: 'Your gear.\nYour plan.',
      headlineSize: 118,
      headlineLineHeight: 108,
      titleY: 148,
      accent: '#4D8065',
      body: crop('equipment'),
    }),
  },
  {
    file: '05-progress-made-visible',
    make: ({ crop }) => artwork({
      title: 'One coach.\nEvery mode.',
      headlineSize: 124,
      headlineLineHeight: 112,
      titleY: 148,
      accent: '#5A745B',
      body: crop('modes'),
    }),
  },
  {
    file: '06-own-your-training',
    make: ({ crop }) => artwork({
      title: 'Stay in the flow',
      headlineSize: 118,
      titleY: 218,
      accent: '#2E634A',
      body: crop('flow'),
    }),
  },
  {
    file: '07-stay-focused-set-by-set',
    make: ({ crop }) => artwork({
      title: 'Stay focused,\nset by set',
      headlineSize: 116,
      headlineLineHeight: 108,
      titleY: 148,
      accent: '#527461',
      body: crop('logging'),
    }),
  },
  {
    file: '08-move-with-confidence',
    make: ({ crop }) => artwork({
      title: 'Move with\nconfidence',
      headlineSize: 124,
      headlineLineHeight: 112,
      titleY: 148,
      accent: '#5A745B',
      body: crop('formGuide'),
    }),
  },
  {
    file: '09-progress-made-visible',
    make: ({ crop }) => artwork({
      title: 'Progress made\nvisible',
      headlineSize: 124,
      headlineLineHeight: 112,
      titleY: 148,
      accent: '#2E634A',
      body: crop('progress'),
    }),
  },
  {
    file: '10-the-work-adds-up',
    make: ({ crop }) => artwork({
      title: 'The work\nadds up',
      headlineSize: 124,
      headlineLineHeight: 112,
      titleY: 148,
      accent: '#617568',
      body: crop('calendar'),
    }),
  },
];

await mkdir(svgDir, { recursive: true });
for (const frame of frames) {
  await writeFile(resolve(svgDir, `${frame.file}.svg`), buildFrame(frame.file, frame.make));
}

console.log(`Generated ${frames.length} App Store SVG masters in ${svgDir}`);
