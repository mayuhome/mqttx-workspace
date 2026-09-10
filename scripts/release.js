#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Pass all CLI arguments to npm version (e.g. prerelease --preid=alpha)
const rawArgs = process.argv.slice(2).join(' ');

if (!rawArgs) {
  console.error('Usage: node scripts/release.js <patch | minor | major | prerelease --preid=alpha | x.y.z>');
  process.exit(1);
}

const rootPkgPath = path.resolve(__dirname, '../package.json');
const libPkgPath = path.resolve(__dirname, '../packages/ngx-mqttx/package.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const libPkg = JSON.parse(fs.readFileSync(libPkgPath, 'utf-8'));

console.log(`Current library (ngx-mqttx) version: ${libPkg.version}`);

// Base the version increment exclusively on packages/ngx-mqttx/package.json
const newVersion = execSync(`npm version ${rawArgs} --prefix packages/ngx-mqttx --no-git-tag-version`, {
  encoding: 'utf-8',
}).trim().replace(/^v/, '');

// Sync root workspace package.json version to keep them in lockstep
rootPkg.version = newVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');

console.log(`✅ Bumped ngx-mqttx version: ${libPkg.version} -> ${newVersion}`);
console.log(`✅ Synced root workspace package.json version to ${newVersion}`);

// Stage, commit and tag
try {
  execSync('git add package.json packages/ngx-mqttx/package.json', { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { stdio: 'inherit' });
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
  console.log(`\n🎉 Release git tag v${newVersion} created successfully!`);
  console.log(`\nTo publish to NPM via GitHub Actions, push commit and tag:`);
  console.log(`  git push origin main --follow-tags`);
} catch (err) {
  console.error('Failed to commit/tag git release:', err.message);
  process.exit(1);
}
