import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageMetadata from '../package.json' with { type: 'json' };
import { PATCH_HISTORY } from '../src/data/patchHistory.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = packageMetadata.version;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

function renderPatchNotes() {
  const lines = [
    '# StarPlus Energy Asset Management System — Patch Notes & Changelog',
    '',
    'All notable changes, architectural updates, and state engine revisions for the **StarPlus Energy Asset Management System (SPE-AMS)** are documented in this file.',
    '',
    'This file is generated from [`src/data/patchHistory.js`](src/data/patchHistory.js). Update that release history and `package.json`, then run `npm run docs:sync`.',
    '',
    'The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
    '',
  ];

  for (const release of PATCH_HISTORY) {
    lines.push(`## [${release.version}] — ${release.date}`, '');
    lines.push(`### ${release.title}`, '');
    if (release.summary) lines.push(release.summary, '');
    if (release.highlights?.length) {
      lines.push('#### Highlights');
      for (const highlight of release.highlights) lines.push(`- ${highlight}`);
      lines.push('');
    }
    for (const section of release.sections || []) {
      lines.push(`#### ${section.heading}`, '');
      for (const item of section.items || []) lines.push(`- ${item}`);
      lines.push('');
    }
    lines.push('---', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const readme = read('README.md');
write('README.md', readme.replace(/^(# StarPlus Energy Asset Management System \()v?[^)]+\)/m, `$1v${version})`));

const designDocument = read('Software Design Document.md');
const withDesignVersion = designDocument.replace(/(\*\*Document Version\*\* \| \*\*)v?[^*]+(\*\*)/, `$1v${version}$2`);
write(
  'Software Design Document.md',
  withDesignVersion.replace(
    /## 9\. Version Control & History[\s\S]*$/,
    `## 9. Version Control & History\n\nRelease notes are maintained in the structured history at [src/data/patchHistory.js](src/data/patchHistory.js). Run \`npm run docs:sync\` to regenerate the in-app history, patch notes, and document version metadata. The current release is **v${version}**.\n`,
  ),
);

const technicalSpec = read('Technical Specification.md')
  .replace(/(\*\*Specification Version\*\* \| \*\*)v?[^*]+(\*\*)/, `$1v${version}$2`)
  .replace(/Project manifest \(v[^)]+\)/, 'Project manifest (version sourced from package.json)')
  .replace(/APP_VERSION \('[^']+'\)/, `APP_VERSION (derived from package.json)`);
write('Technical Specification.md', technicalSpec);

const lockText = read('package-lock.json');
let lockVersionCount = 0;
write(
  'package-lock.json',
  lockText.replace(/("version"\s*:\s*")[^"]+(")/g, (match, before, after) => {
    if (lockVersionCount >= 2) return match;
    lockVersionCount += 1;
    return `${before}${version}${after}`;
  }),
);

write('PATCH_NOTES.md', renderPatchNotes());
console.log(`Synchronized release documents to v${version}.`);
