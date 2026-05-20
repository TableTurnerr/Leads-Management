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

  // Always parse as semver (major.minor.patch); pad missing components with 0.
  let parts = version.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  const [major, minor, patch] = parts;

  let newVersion: string;
  if (bumpType === 'major') {
    newVersion = `${major + 1}.0.0`;
  } else if (bumpType === 'patch') {
    newVersion = `${major}.${minor}.${patch + 1}`;
  } else {
    newVersion = version;
  }
  data.version = newVersion;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${filePath}: ${version} -> ${newVersion}`);
} catch (error) {
  console.error(`Error processing ${filePath}: ${error.message}`);
  process.exit(1);
}
