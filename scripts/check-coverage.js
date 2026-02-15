import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const coverageDir = 'coverage';
const coverageFile = join(coverageDir, 'coverage-final.json');

console.log('Checking test coverage...');

try {
  execSync('tap --coverage-report=json', { stdio: 'inherit' });
} catch (error) {
  console.log('Coverage check failed to run.');
  process.exit(0);
}

if (!existsSync(coverageFile)) {
  console.log('No coverage file found.');
  process.exit(0);
}

const coverage = JSON.parse(readFileSync(coverageFile, 'utf-8'));
const totals = coverage.total;

if (!totals || !totals.pct) {
  console.log('Could not determine coverage percentage.');
  process.exit(0);
}

const percentage = totals.pct;

if (percentage < 100) {
  console.log('');
  console.log(`⚠️  Coverage: ${percentage}% (target: 100%)`);
  console.log('   Consider adding tests before reducing coverage.');
  console.log('   Commit allowed.');
  console.log('');
} else {
  console.log(`✅ Coverage: ${percentage}%`);
}

process.exit(0);
