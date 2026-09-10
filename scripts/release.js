#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const target = args[0];

if (!target) {
  console.error('Usage: node scripts/release.js <patch | minor | major | prerelease | x.y.z>');
  process.exit(1);
}

const rootPkgPath = path.resolve(__dirname, '../package.json');
const libPkgPath = path.resolve(__dirname, '../projects/mqttx/package.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const libPkg = JSON.parse(fs.readFileSync(libPkgPath, 'utf-8'));

// Use npm version on library package.json to calculate the new semantic version
const newVersion = execSync(`npm version ${target} --prefix projects/mqttx --no-git-tag-version`, {
  encoding: 'utf-8',
}).trim().replace(/^v/, '');

// Sync root package.json version
rootPkg.version = newVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');

console.log(`\n✅ Updated version to ${newVersion} in both package.json and projects/mqttx/package.json`);

// Stage, commit and tag
try {
  execSync('git add package.json projects/mqttx/package.json', { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { stdio: 'inherit' });
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
  console.log(`\n🎉 Release v${newVersion} created successfully!`);
  console.log(`\nTo publish, push commit and tag:\n  git push origin main --follow-tags\n  (or: git push origin v${newVersion})`);
} catch (err) {
  console.error('Failed to commit/tag git release:', err.message);
  process.exit(1);
}
