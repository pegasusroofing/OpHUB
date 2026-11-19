/// <reference types="node" />
// Server function checks from the review of 15 Nov 2026 (docs/claude-code/REVIEW-2026-11-15.md, section 3), read from
// the repo copies in supabase/functions (which are what is deployed). They guard against a fix being lost when a
// function is next edited.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const FN = new URL('../../../../supabase/functions/', import.meta.url);
const src = (fn: string) => readFileSync(new URL(`${fn}/index.ts`, FN), 'utf8');
const all = readdirSync(FN).filter((d) => existsSync(new URL(`${d}/index.ts`, FN)));

test('#1 no function copies one fixed address into every company’s emails', () => {
  for (const fn of all) {
    assert.doesNotMatch(src(fn), /REPORT_CC_EMAIL/, fn);
    assert.doesNotMatch(src(fn), /cc[^\n]{0,80}rtbroofinglimited\.com/i, fn);
  }
  for (const fn of ['send-report-email', 'send-coshh-email', 'send-havs-email', 'send-puwer-email', 'send-incident-email']) {
    assert.match(src(fn), /org\?\.report_cc_email/, `${fn} copies in the caller's own company's address`);
  }
});

test('#2 a OneDrive sign-in state is single use and expires', () => {
  const start = src('onedrive-oauth-start'), cb = src('onedrive-oauth-callback');
  assert.match(start, /onedrive_oauth_states'\)\.insert/);
  assert.match(cb, /onedrive_oauth_states'\)\.delete\(\)\.eq\('state', stateRaw\)/);
  assert.match(cb, /STATE_MAX_AGE_MS = 15 \* 60 \* 1000/);
  assert.doesNotMatch(cb, /hmacSign|atob\(stateRaw\)/, 'the old signed states are no longer accepted');
});

test('#3 the subcontractor form: fixed thank-you wording, real caps, no caller-set IP', () => {
  const s = src('subcontractor-apply');
  assert.match(s, /greeting: 'Hi,', intro: thanks/);
  assert.doesNotMatch(s, /greeting: `Hi \$\{contact\}/);
  assert.doesNotMatch(s, /x-forwarded-for'\) \|\| ''\)\.split\(','\)\[0\]/, 'not the first X-Forwarded-For entry');
  assert.match(s, /orgDay \|\| 0\) >= 30/);
  assert.match(s, /emailDay \|\| 0\) >= 3/);
  // Counted again once saved, so forms sent all at once can't get past the email limits.
  assert.match(s, /const emailsOk = \(orgNow \|\| 0\) <= 30 && \(emailNow \|\| 0\) <= 3;/);
  assert.match(s, /if \(RESEND_API_KEY && emailsOk\)/);
});

// The storage path check block, exactly as written in a function (16 Nov 2026).
function storagePathBlockOf(fn: string): string {
  const m = /const UNSAFE_STORAGE_PATH = [^\r\n]*\r?\nfunction storagePathSafe[\s\S]*?\r?\n}\r?\n/.exec(src(fn));
  assert.ok(m, `${fn} has the storage path check`);
  return m[0];
}
const runTs = <T>(code: string, name: string): T =>
  new Function(ts.transpileModule(`${code}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)() as T;
// pathInFolder exactly as written in each file-access function (with the storage path check it calls).
function pathInFolderOf(fn: string): (p: unknown, folder: string) => boolean {
  const m = /function pathInFolder[\s\S]*?\r?\n}\r?\n/.exec(src(fn));
  assert.ok(m, `${fn} has pathInFolder`);
  return runTs(`${storagePathBlockOf(fn)}\n${m[0]}`, 'pathInFolder');
}
test('#4 a file is only signed when it sits in the checked site’s / to-do’s / company’s folder', () => {
  const S = '11111111-1111-1111-1111-111111111111', O = '22222222-2222-2222-2222-222222222222';
  const cases: [unknown, string, boolean][] = [
    [`${S}/price/abc-x.pdf`, S, true], [`${O}/price/abc.pdf`, S, false], [`${S}/../${O}/x.pdf`, S, false],
    [`${S}//x.pdf`, S, false], [`${S}x/y.pdf`, S, false], [S, S, false], ['', S, false], [`${S}/a\\b.pdf`, S, false],
    [`${S}/./x`, S, false], [`${O}/${S}/c.pdf`, `${O}/${S}`, true], [`${O}/m-${S}/c.pdf`, `${O}/${S}`, false],
    [`${S}/x.pdf`, '', false], [null, S, false],
    // fetch would read these as "..", "/" or drop them, climbing out of the folder (16 Nov 2026).
    [`${S}/%2e%2e/%2e%2e/rest/v1/profiles`, S, false], [`${S}/%2E%2E/x.pdf`, S, false], [`${S}/.%2e/x.pdf`, S, false],
    [`${S}/..\\${O}\\x.pdf`, S, false], [`${S}/..\t/x.pdf`, S, false], [`${S}/a?x`, S, false], [`${S}/a#x`, S, false],
  ];
  for (const fn of ['price-file-access', 'labour-invoice-access', 'material-order-file-access', 'todo-attachment-access', 'operative-certification-file-access', 'certification-file-access']) {
    const f = pathInFolderOf(fn);
    for (const [p, folder, want] of cases) assert.equal(f(p, folder), want, `${fn}: ${String(p)} in ${folder}`);
    assert.match(src(fn), /if \(!(pathInFolder\(fileRow\.storage_path, |folders\.some\(\(f\) => pathInFolder\(fileRow\.storage_path, f\)\)\))/, `${fn} uses it before signing`);
  }
  // Signing up moves a hand-added operative's certificates to them but leaves the files in <org>/m-<id>/.
  assert.match(src('operative-certification-file-access'), /manual_operatives'\)\.select\('id'\)\.eq\('org_id', fileRow\.org_id\)\.eq\('linked_profile_id', userData\.user\.id\)/);
});

// 16 Nov 2026: supabase-js puts a storage path into the request address unencoded, and fetch then reads %2e%2e as
// "..", a backslash as "/" and drops tabs / new lines, so a path that passed a plain ".." check could climb out of
// the bucket with the service key. Every function that hands a request / row / link path to storage refuses these.
const PATH_CHECKED = [
  'send-price-builder-email', 'send-expenses-email', 'send-document-email', 'send-site-induction-email',
  'send-subcontractor-inspection-email', 'client-sign',
  'operative-certification-file-access', 'certification-file-access', 'price-file-access', 'labour-invoice-access',
  'material-order-file-access', 'todo-attachment-access', 'finance-ai-read',
  // The others that hand a request or row path to storage.
  'send-finance-email', 'send-repair-quote', 'send-schedule-email', 'send-snags-email', 'send-message-push',
  'onedrive-upload', 'onedrive-job-pack', 'hr-onedrive-copy', 'sync-operative-certification', 'xero',
];
test('#9 a storage path with %, ?, #, a backslash or a control character is refused before storage sees it', () => {
  const refused = ['a/%2e%2e/b', 'a/%2E%2E/b', 'a/.%2e/b', 'a/%2e./b', 'a\\..\\b', 'a/..\t/b', 'a/?x', 'a/#x', 'a/b%2fc',
    'a/b\r\nc', 'a/b\u007f', 'a/../b', 'a/./b', 'a//b', '/a/b', 'a/b/', '', null, 7];
  const allowed = ['e56d69c8-1111-2222-3333-444444444444/site/x y.pdf', 'expenses/org/2026-11-16/receipt (1).jpg', 'a/b.c.pdf'];
  const block = storagePathBlockOf(PATH_CHECKED[0]);
  assert.match(block, /^const UNSAFE_STORAGE_PATH = \/\[%\?#\\\\\\u0000-\\u001f\\u007f\]\/;/);
  const safe = runTs<(p: unknown) => boolean>(block, 'storagePathSafe');
  for (const p of refused) assert.equal(safe(p), false, `refused: ${JSON.stringify(p)}`);
  for (const p of allowed) assert.equal(safe(p), true, `allowed: ${p}`);
  for (const fn of PATH_CHECKED) {
    // The same check, word for word, in every function, and used (not only defined).
    assert.equal(storagePathBlockOf(fn).replace(/\r/g, ''), block.replace(/\r/g, ''), `${fn} has the same check`);
    assert.ok((src(fn).match(/storagePathSafe\(/g) || []).length >= 2, `${fn} uses it`);
  }
  // Where each one is applied.
  for (const fn of ['send-price-builder-email', 'send-document-email', 'send-site-induction-email', 'send-subcontractor-inspection-email']) {
    const s = src(fn);
    assert.match(s, /storagePathAllowed[\s\S]{0,120}if \(!storagePathSafe\(p\)\) return false;/, `${fn}: storagePathAllowed`);
    assert.match(s, /role \|\| ''\) === 'client'\) return false;\r?\n  if \(!storagePathSafe\(p\)\) return false;/, `${fn}: pathInCompany`);
    assert.match(s, /return storagePathSafe\(ref\.path\) && !ref\.bucket\.includes\('\/'\) && storagePathSafe\(ref\.bucket\) \? ref : null; \/\/ checked after decoding/, `${fn}: storageRef, after decoding`);
    assert.match(s, /if \(maxBytes <= 0 \|\| !storagePathSafe\(path\)\) return null;/, `${fn}: readStorageFile`);
    assert.match(s, /try \{\r?\n    if \(!storagePathSafe\(path\)\) return null;\r?\n    const \{ data, error \} = await admin\.storage\.from\(bucket\)\.createSignedUrl/, `${fn}: signedStorageLink`);
  }
  assert.doesNotMatch(src('send-subcontractor-inspection-email'), /UNSAFE_PATH_CHARS|storage_path && UNSAFE/, 'file_url paths are checked too');
  assert.match(src('send-subcontractor-inspection-email'), /subcontractor-inspections\/`\) \|\| !storagePathSafe\(sp\.path\) \|\|/);
  assert.match(src('send-expenses-email'), /startsWith\(`expenses\/\$\{caller\.org_id\}\/`\) \|\| !storagePathSafe\(path\)\) continue;/);
  assert.match(src('client-sign'), /if \(!p \|\| !org \|\| !storagePathSafe\(p\)\) return false;/);
  assert.match(src('finance-ai-read'), /!path\.startsWith\(me\.org_id \+ '\/'\) \|\| !storagePathSafe\(path\)\) return json\(\{ error: 'Forbidden' \}, 403\)/);
  for (const fn of ['price-file-access', 'labour-invoice-access', 'material-order-file-access', 'todo-attachment-access', 'operative-certification-file-access', 'certification-file-access']) {
    assert.match(src(fn), /return !!folder && s\.startsWith\(folder \+ '\/'\) && storagePathSafe\(s\);/, `${fn}: pathInFolder`);
  }
  const fin = src('send-finance-email');
  assert.match(fin, /storagePath\.startsWith\(caller\.org_id \+ '\/'\) \|\| !storagePathSafe\(storagePath\)\)\)/, 'send-finance-email: the document');
  assert.match(fin, /p\.startsWith\(caller\.org_id \+ '\/'\) \|\| !storagePathSafe\(p\)\) return json/, 'send-finance-email: the extras');
  assert.match(src('send-repair-quote'), /startsWith\(caller\.org_id \+ '\/'\) \|\| !storagePathSafe\(storagePath\)\)/);
  for (const fn of ['send-schedule-email', 'send-snags-email']) {
    assert.match(src(fn), /storagePathAllowed[\s\S]{0,120}if \(!storagePathSafe\(p\)\) return false;/, `${fn}: storagePathAllowed`);
  }
  assert.match(src('send-message-push'), /f\.path\.startsWith\(`\$\{siteId\}\/`\) && storagePathSafe\(f\.path\);/);
  assert.match(src('onedrive-upload'), /typeof photo_path !== 'string' \|\| !storagePathSafe\(photo_path\)/);
  assert.match(src('onedrive-upload'), /!storage_path\.startsWith\(prefix\) \|\| !storagePathSafe\(storage_path\)/);
  assert.match(src('onedrive-job-pack'), /file\.path\.startsWith\(`\$\{site\.id\}\/`\) \|\| !storagePathSafe\(file\.path\)\)/);
  assert.match(src('hr-onedrive-copy'), /startsWith\(`\$\{d\.org_id\}\/\$\{d\.user_id\}\/`\) && storagePathSafe\(d\.storage_path\);/);
  assert.match(src('sync-operative-certification'), /if \(!storagePathSafe\(row\.storage_path\)\) continue;\r?\n\s+const dlRes = await admin\.storage\.from\('certifications'\)\.download\(row\.storage_path\);/);
  assert.match(src('xero'), /if \(!path \|\| !storagePathSafe\(path\)\) return;\r?\n  try \{\r?\n    const \{ data \} = await admin\.storage\.from\('finance-docs'\)\.download\(path\);/);
});

test('#6 the Finance AI reader has a daily cap', () => {
  assert.match(src('finance-ai-read'), /const DAILY = \d+;/);
  const ai = src('finance-ai-read');
  assert.ok(ai.indexOf("ai_usage_log').insert") > 0 && ai.indexOf("ai_usage_log').insert") < ai.indexOf('api.anthropic.com'), 'logged before the AI is asked, so a burst can’t get past the cap');
  assert.match(ai, /\(usedToday \|\| 0\) > DAILY/);
});

test('#8 calendar reminders take the company from the event’s site', () => {
  const s = src('send-calendar-reminders');
  assert.match(s, /\.in\('id', recipientIds\)\.eq\('org_id', site\.org_id\)/);
  assert.doesNotMatch(s, /eq\('org_id', ev\.org_id\)|eq\('id', ev\.org_id\)/);
});

test('#7 the Finance trial is enforced on the server too (sandbox exempt, and companies the super admin puts live)', () => {
  for (const fn of ['xero', 'send-finance-email', 'finance-inbox']) {
    assert.match(src(fn), /const FIN_TRIAL = true;/, fn);
    assert.match(src(fn), /2eb072b7-2704-48c0-8110-62e45e621ded/, `${fn}: Sandbox Roofing exempt`);
    // 19 Nov 2026: a company put live in Platform Admin (organizations.finance_live, super admin only) isn't on the trial.
    assert.match(src(fn), /select\('finance_live'\)/, `${fn}: reads the company's live switch`);
    assert.match(src(fn), /FIN_TRIAL && !FIN_SANDBOX_ORGS\.includes\([^)]*\)[^;]*!\(await financeLive\(admin, /, `${fn}: the trial check lets a live company through`);
  }
  assert.match(src('xero'), /\['push_invoice', 'push_bill', 'push_sub_payment'\]\.includes\(action\) && !\(await financeLive\(admin, orgId\)\)\) return json\(\{ error: FIN_TRIAL_MSG \}, 403\)/);
});
