// Desktop development or server-side use only. Never bundle client secrets into a mobile app.
const { MULTISET_CLIENT_ID: id, MULTISET_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) throw new Error('Set MULTISET_CLIENT_ID and MULTISET_CLIENT_SECRET in the process environment.');
const response = await fetch('https://api.multiset.ai/v1/m2m/token', {
  method: 'POST', redirect: 'error',
  headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error(`MultiSet token request failed: HTTP ${response.status}`);
const result = await response.json();
if (typeof result.token !== 'string' || !result.token || !result.expiresOn) throw new Error('Unexpected token response.');
process.stderr.write(`Token expires ${result.expiresOn}\n`);
process.stdout.write(result.token); // Deliberate output for shell assignment; do not log in CI.
