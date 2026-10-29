import { createHash } from 'node:crypto';

export const contractPaths = {
  advisor: '/api/mobile/meetings/v1/openapi.json',
  participantExtras: '/api/mobile/v1x/openapi.json',
};

export function localOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('DutyGraph integration requires a plain localhost HTTP(S) origin.');
  return url.origin;
}

export async function servedContract(origin, kind) {
  const url = `${localOrigin(origin)}${contractPaths[kind]}`;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`DutyGraph ${kind} contract returned ${response.status}.`);
  const body = await response.text();
  const contract = JSON.parse(body);
  const prefix = kind === 'advisor' ? '/api/mobile/meetings/v1/' : '/api/mobile/v1x/';
  const paths = Object.keys(contract.paths ?? {});
  if (!String(contract.openapi).startsWith('3.') || !paths.length || paths.some(path => !path.startsWith(prefix)) || paths.some(path => path.startsWith('/dev/')))
    throw new Error(`DutyGraph ${kind} contract has invalid or out-of-scope paths.`);
  function checkRefs(value) {
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value && (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/')))
      throw new Error('Served contracts must use local references only.');
    for (const child of Object.values(value)) checkRefs(child);
  }
  checkRefs(contract);
  return { contract, body, sha256: createHash('sha256').update(body).digest('hex'), url };
}
