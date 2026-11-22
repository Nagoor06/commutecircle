const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

// Specify the SDK template explicitly so a registry dist-tag move cannot
// silently change the Kotlin, Gradle or React Native version in a release.
const template = 'expo-template-bare-minimum@56.0.38';
const integrity =
  '+lLqjJE17Fus3699Dv+BELfrud6kfb4Xwx29vBr8wAUcLyllsoJ+F0oR8z2JWwD2UN7MQtZQxAPjsfdniKer8w==';
const temp = mkdtempSync(join(tmpdir(), 'commutecircle-template-'));
try {
  const npm = process.env.npm_execpath;
  const [archive] = JSON.parse(
    execFileSync(process.execPath, [npm, 'pack', template, '--json', '--pack-destination', temp], {
      encoding: 'utf8',
    }),
  );
  const file = join(temp, archive.filename);
  if (createHash('sha512').update(readFileSync(file)).digest('base64') !== integrity)
    throw Error('Unexpected Android template checksum');
  execFileSync(
    process.execPath,
    [
      require.resolve('expo/bin/cli'),
      'prebuild',
      '--clean',
      '--no-install',
      '--platform',
      'android',
      '--template',
      file,
    ],
    { stdio: 'inherit' },
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
