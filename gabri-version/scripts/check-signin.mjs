// Run with: node scripts/check-signin.mjs
// Checks who may sign in: Google sign-in only for the school's own Google accounts (src/lib/googleClaims.ts),
// and a typed email only when it is a usc.edu address (src/lib/directory.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { throw new Error('Unexpected import: ' + name); } }, { filename: file });
  return exports;
}
const G = compile('src/lib/googleClaims.ts');
const D = compile('src/lib/directory.ts');
const reject = (claims, domain, why) => { const r = G.checkGoogleClaims(claims, domain); assert.equal(r.ok, false, why); return r; };

// 1. the allowed domain is usc.edu unless the env var names another; it is never empty
assert.equal(G.allowedDomain(undefined), 'usc.edu', 'not set: usc.edu');
assert.equal(G.allowedDomain(''), 'usc.edu', 'empty: usc.edu');
assert.equal(G.allowedDomain('   '), 'usc.edu', 'blank: usc.edu');
assert.equal(G.allowedDomain('ucla.edu'), 'ucla.edu', 'the env var can override');
assert.equal(G.allowedDomain(' @USC.edu '), 'usc.edu', 'tidied');
const USC = G.allowedDomain(undefined);

// 2. a usc.edu Google account is accepted
{
  const r = G.checkGoogleClaims({ email: 'TTrojan@usc.edu', email_verified: true, hd: 'usc.edu' }, USC);
  assert.equal(r.ok, true); assert.equal(r.email, 'ttrojan@usc.edu');
}
// 3. a gmail.com account is rejected (it has no hd claim at all)
reject({ email: 'someone@gmail.com', email_verified: true }, USC, 'gmail.com');
reject({ email: 'someone@gmail.com', email_verified: true, hd: 'gmail.com' }, USC, 'gmail.com with an hd');
// 4. the email's ending alone is not enough: hd must be the allowed domain
reject({ email: 'fake@usc.edu', email_verified: true }, USC, 'usc.edu email but no hd (a personal Google account)');
reject({ email: 'fake@usc.edu', email_verified: true, hd: 'other.edu' }, USC, 'usc.edu email, another hd');
reject({ email: 'x@other.edu', email_verified: true, hd: 'usc.edu' }, USC, 'hd right, email elsewhere');
reject({ email: 'x@usc.edu.attacker.com', email_verified: true, hd: 'usc.edu.attacker.com' }, USC, 'look-alike domain');
reject({ email: 'x@notusc.edu', email_verified: true, hd: 'notusc.edu' }, USC, 'domain that only ends in usc.edu');
reject({ email: 'a@evil.com@usc.edu', email_verified: true, hd: 'usc.edu' }, USC, 'two @ signs');
// 5. an unverified email is rejected, however it is spelled
assert.match(reject({ email: 'ttrojan@usc.edu', email_verified: false, hd: 'usc.edu' }, USC, 'unverified').error, /verified/);
reject({ email: 'ttrojan@usc.edu', hd: 'usc.edu' }, USC, 'no email_verified claim');
reject({ email: 'ttrojan@usc.edu', email_verified: 'true', hd: 'usc.edu' }, USC, 'the string "true" is not true');
// 6. nonsense in, rejected
for (const c of [null, undefined, {}, 'ttrojan@usc.edu', [], { email: 42, hd: {}, email_verified: true }]) reject(c, USC, 'not real claims');
reject({ email: 'ttrojan@usc.edu', email_verified: true, hd: 'usc.edu' }, '', 'no domain configured can never mean everyone');
// 7. with the env var set to another school, that school is accepted and usc.edu is not
assert.equal(G.checkGoogleClaims({ email: 'j@ucla.edu', email_verified: true, hd: 'ucla.edu' }, G.allowedDomain('ucla.edu')).ok, true);
reject({ email: 'ttrojan@usc.edu', email_verified: true, hd: 'usc.edu' }, G.allowedDomain('ucla.edu'), 'another school is configured');

// 8. a typed email (the demo sign-in) must be a usc.edu address
assert.equal(D.isUscEmail('ttrojan@usc.edu'), true);
assert.equal(D.isUscEmail('  TTrojan@USC.edu '), true);
for (const e of ['someone@gmail.com', 'ttrojan@ucla.edu', 'ttrojan@usc.edu.attacker.com', 'ttrojan@notusc.edu', 'a@b@usc.edu', '@usc.edu', 'ttrojan', '']) assert.equal(D.isUscEmail(e), false, `${e} is not a usc.edu address`);

// 9. the sign-in code actually uses these rules
const google = fs.readFileSync('src/lib/google.ts', 'utf8');
assert.match(google, /domain: allowedDomain\(process\.env\.GOOGLE_ALLOWED_DOMAIN\)/, 'google.ts defaults the domain');
assert.match(google, /checkGoogleClaims\(claims, cfg\(\)\.domain\)/, 'google.ts checks the claims');
assert.doesNotMatch(google, /email\.endsWith\(/, 'google.ts no longer accepts on the email ending');
assert.match(fs.readFileSync('.env.example', 'utf8'), /^GOOGLE_ALLOWED_DOMAIN=usc\.edu$/m, '.env.example sets usc.edu');

console.log('Sign-in checks passed: usc.edu by default, usc.edu accepted, gmail.com rejected, hd required, unverified rejected, typed non-usc.edu email rejected.');
