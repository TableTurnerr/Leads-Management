const fs = require('fs');

const components = [
  { name: 'Root', path: 'package.json' },
];

console.log('--- Component Version Status ---');
components.forEach(comp => {
  try {
    if (fs.existsSync(comp.path)) {
      const content = JSON.parse(fs.readFileSync(comp.path, 'utf8'));
      console.log(`${comp.name.padEnd(20)}: ${content.version || 'No version'}`);
    } else {
      console.log(`${comp.name.padEnd(20)}: Not found`);
    }
  } catch (e) {
    console.log(`${comp.name.padEnd(20)}: Error reading (${e.message})`);
  }
});
console.log('--------------------------------');
