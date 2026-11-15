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

// pathInFolder exactly as written in each file-access function.
function pathInFolderOf(fn: string): (p: unknown, folder: string) => boolean {
  const m = /function pathInFolder[\s\S]*?\n}\n/.exec(src(fn));
  assert.ok(m, `${fn} has pathInFolder`);
  const js = ts.transpileModule(`${m[0]}\nreturn pathInFolder;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(js)() as (p: unknown, folder: string) => boolean;
}
test('#4 a file is only signed when it sits in the checked site’s / to-do’s / company’s folder', () => {
  const S = '11111111-1111-1111-1111-111111111111', O = '22222222-2222-2222-2222-222222222222';
  const cases: [unknown, string, boolean][] = [
    [`${S}/price/abc-x.pdf`, S, true], [`${O}/price/abc.pdf`, S, false], [`${S}/../${O}/x.pdf`, S, false],
    [`${S}//x.pdf`, S, false], [`${S}x/y.pdf`, S, false], [S, S, false], ['', S, false], [`${S}/a\\b.pdf`, S, false],
    [`${S}/./x`, S, false], [`${O}/${S}/c.pdf`, `${O}/${S}`, true], [`${O}/m-${S}/c.pdf`, `${O}/${S}`, false],
    [`${S}/x.pdf`, '', false], [null, S, false],
  ];
  for (const fn of ['price-file-access', 'labour-invoice-access', 'material-order-file-access', 'todo-attachment-access', 'operative-certification-file-access', 'certification-file-access']) {
    const f = pathInFolderOf(fn);
    for (const [p, folder, want] of cases) assert.equal(f(p, folder), want, `${fn}: ${String(p)} in ${folder}`);
    assert.match(src(fn), /if \(!(pathInFolder\(fileRow\.storage_path, |folders\.some\(\(f\) => pathInFolder\(fileRow\.storage_path, f\)\)\))/, `${fn} uses it before signing`);
  }
  // Signing up moves a hand-added operative's certificates to them but leaves the files in <org>/m-<id>/.
  assert.match(src('operative-certification-file-access'), /manual_operatives'\)\.select\('id'\)\.eq\('org_id', fileRow\.org_id\)\.eq\('linked_profile_id', userData\.user\.id\)/);
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

test('#7 the Finance trial is enforced on the server too (sandbox exempt)', () => {
  for (const fn of ['xero', 'send-finance-email', 'finance-inbox']) {
    assert.match(src(fn), /const FIN_TRIAL = true;/, fn);
    assert.match(src(fn), /2eb072b7-2704-48c0-8110-62e45e621ded/, `${fn}: Sandbox Roofing exempt`);
  }
  assert.match(src('xero'), /\['push_invoice', 'push_bill', 'push_sub_payment'\]\.includes\(action\)\) return json\(\{ error: FIN_TRIAL_MSG \}, 403\)/);
});
