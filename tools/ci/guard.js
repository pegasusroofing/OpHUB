#!/usr/bin/env node
// Run by the GitHub check on every push (.github/workflows/check.yml), and by hand: node tools/ci/guard.js
// Fails if a secret has been committed, or if Finance has come off trial without Andy saying so.
// Prints only where a problem is (file and line), never the secret itself.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const problems = [];

// 1. Finance stays on trial for RTB until Andy says otherwise (CLAUDE.md, hard rule 3).
//    When he does, change these two lines and this check together.
const trial = [
  ['src/js/9219e-finance-trial.js', /^const FIN_TRIAL = true;/m],
  ['app-native/src/lib/rules/finance.ts', /^export const FIN_TRIAL = true;/m],
];
for (const [file, re] of trial) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (!re.test(text)) problems.push(`${file}: Finance trial is no longer on (FIN_TRIAL = true is missing)`);
}

// 2. No secrets in any committed file. The public anon key is allowed (its role is "anon").
const skip = /\.(png|jpe?g|gif|webp|ico|pdf|zip|apk|aab|ipa|keystore|jks|ttf|otf|woff2?|mp4|mov|xlsx|docx|pptx)$/i;
const files = execSync('git ls-files -z', { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().split('\0').filter((f) => f && !skip.test(f));
const plain = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'a Supabase secret key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/, 'a private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, 'a GitHub token'],
  [/\bsk_live_[A-Za-z0-9]{16,}/, 'a live Stripe key'],
  [/\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/, 'a Resend key'],
];
const jwt = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
for (const f of files) {
  let text;
  try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
  if (text.includes('\0')) continue; // binary
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [re, what] of plain) if (re.test(line)) problems.push(`${f}:${i + 1}: looks like ${what}`);
    for (const m of line.matchAll(jwt)) {
      let role = '';
      try { role = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role || ''; } catch { /* not a real token */ }
      if (role && role !== 'anon') problems.push(`${f}:${i + 1}: a Supabase key with role "${role}" (only the public anon key may be committed)`);
    }
  });
}

if (problems.length) {
  console.error('Problems found:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`OK: Finance trial on in both apps; no secrets in ${files.length} files.`);
