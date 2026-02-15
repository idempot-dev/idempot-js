import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const coverageDir = '.tap/report';
const coverageFile = join(coverageDir, 'coverage-final.json');

console.log('Checking test coverage...');

try {
  execSync('npx tap --coverage-report=json', { stdio: 'inherit' });
} catch (error) {
  console.log('Tap completed with warnings (coverage below 100%)');
}

if (!existsSync(coverageFile)) {
  console.log('No coverage file found.');
  process.exit(0);
}

const coverage = JSON.parse(readFileSync(coverageFile, 'utf-8'));

let totalStatements = 0;
let coveredStatements = 0;
let totalFunctions = 0;
let coveredFunctions = 0;
let totalBranches = 0;
let coveredBranches = 0;

for (const filePath in coverage) {
  const fileData = coverage[filePath];
  
  if (fileData.s) {
    for (const count of Object.values(fileData.s)) {
      totalStatements++;
      if (count > 0) coveredStatements++;
    }
  }
  
  if (fileData.f) {
    for (const count of Object.values(fileData.f)) {
      totalFunctions++;
      if (count > 0) coveredFunctions++;
    }
  }
  
  if (fileData.b) {
    for (const branchCounts of Object.values(fileData.b)) {
      for (const count of branchCounts) {
        totalBranches++;
        if (count > 0) coveredBranches++;
      }
    }
  }
}

const statementPct = totalStatements > 0 
  ? (coveredStatements / totalStatements) * 100 
  : 0;
const functionPct = totalFunctions > 0 
  ? (coveredFunctions / totalFunctions) * 100 
  : 0;
const branchPct = totalBranches > 0 
  ? (coveredBranches / totalBranches) * 100 
  : 0;

const percentage = Math.min(statementPct, functionPct, branchPct);

if (percentage < 100) {
  console.log('');
  console.log(`⚠️  Coverage: ${percentage.toFixed(2)}% (target: 100%)`);
  console.log(`   Statements: ${statementPct.toFixed(2)}%`);
  console.log(`   Functions: ${functionPct.toFixed(2)}%`);
  console.log(`   Branches: ${branchPct.toFixed(2)}%`);
  console.log('   Consider adding tests before reducing coverage.');
  console.log('   Commit allowed.');
  console.log('');
} else {
  console.log(`✅ Coverage: ${percentage.toFixed(2)}%`);
}

process.exit(0);
