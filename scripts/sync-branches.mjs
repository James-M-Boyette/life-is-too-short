
import { execFileSync } from 'node:child_process';

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  }).trim();

// Fetch remote branch information.
console.log('Fetching remote branches...');
execFileSync('git', ['fetch', '--all', '--prune'], {
  stdio: 'inherit',
});

// Get existing local branches.
const localBranches = new Set(
  git('for-each-ref', '--format=%(refname:short)', 'refs/heads')
    .split('\n')
    .filter(Boolean)
);

// Get branches from origin.
const remoteBranches = git(
  'for-each-ref',
  '--format=%(refname:short)',
  'refs/remotes/origin'
)
  .split('\n')
  .filter(branch => branch && branch !== 'origin/HEAD');

for (const remote of remoteBranches) {
  const local = remote.replace(/^origin\//, '');

  if (localBranches.has(local)) {
    console.log(`Already exists: ${local}`);
    continue;
  }

  console.log(`Creating tracking branch: ${local}`);
  execFileSync('git', ['branch', '--track', local, remote], {
    stdio: 'inherit',
  });
}

console.log('\nLocal branches are ready:');
execFileSync('git', ['branch'], { stdio: 'inherit' });
