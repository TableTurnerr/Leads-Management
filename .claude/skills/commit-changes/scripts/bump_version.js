const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const bumpType = process.argv[3]; // 'patch' or 'major'
const normalize = process.argv[4] === 'true';

if (!filePath || !bumpType) {
  console.error('Usage: node bump_version.js <filePath> <patch|major> [normalize]');
  process.exit(1);
}

try {
  const content = fs.readFileSync(filePath, 'utf8');

  // Handle JSON files (package.json, manifest.json, version.json)
  let data = JSON.parse(content);
  let version = data.version;

  if (!version) {
    console.error(`Error: No version field found in ${filePath}`);
    process.exit(1);
  }

  // Handle normalization to X.Y
  let parts = version.split('.').map(Number);
  if (normalize) {
    parts = [parts[0] || 1, parts[1] || 0];
  }

  const isSemver = !normalize && parts.length === 3;

  if (bumpType === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    if (isSemver) parts[2] = 0;
  } else if (bumpType === 'patch') {
    if (isSemver) {
      parts[2] += 1;
    } else {
      parts[1] += 1;
    }
  }

  const newVersion = parts.join('.');
  data.version = newVersion;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${filePath}: ${version} -> ${newVersion}`);
} catch (error) {
  console.error(`Error processing ${filePath}: ${error.message}`);
  process.exit(1);
}
