import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');

/** Validate actual browser requests and acknowledgments against served schemas. */
export function contractTraffic(contracts) {
  const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
  const routes = [];
  for (const contract of contracts)
    for (const [template, methods] of Object.entries(contract.paths)) {
      const pattern = new RegExp('^' + template.split('/').map(part => /^\{[^}]+\}$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '$');
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        const compile = schema => schema ? ajv.compile({ ...schema, components: contract.components }) : null;
        routes.push({ template, pattern, method, request: compile(operation.requestBody?.content?.['application/json']?.schema), responses: Object.fromEntries(Object.entries(operation.responses ?? {}).map(([status, response]) => [status, compile(response.content?.['application/json']?.schema)])) });
      }
    }
  let count = 0;
  const checks = [], failures = [];
  const check = async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/mobile/meetings/v1/') && !url.pathname.startsWith('/api/mobile/v1x/')) return;
    const request = response.request();
    const route = routes.find(route => route.pattern.test(url.pathname) && route.method === request.method().toLowerCase());
    if (!route) throw new Error(`Uncontracted mobile operation: ${request.method()} ${url.pathname}`);
    const validate = (schema, body, direction) => {
      if (schema && !schema(body)) throw new Error(`${direction} contract mismatch: ${request.method()} ${route.template} (${schema.errors.map(error => `${error.instancePath || '/'} ${error.keyword}`).join(', ')})`);
    };
    if (route.request && request.postData()) validate(route.request, request.postDataJSON(), 'Request');
    const schema = route.responses[response.status()] ?? route.responses.default;
    if (!(String(response.status()) in route.responses) && !('default' in route.responses)) throw new Error(`Undocumented response ${response.status()}: ${request.method()} ${route.template}`);
    if (schema) validate(schema, await response.json(), 'Response');
    count++;
  };
  return {
    attach(context) { context.on('response', response => { const promise = check(response).catch(error => failures.push(error.message)); checks.push(promise); }); },
    async finish() { await Promise.all(checks); if (failures.length) throw new Error([...new Set(failures)].join('\n')); if (!count) throw new Error('No real mobile contract traffic was observed.'); console.log(`Validated ${count} actual mobile exchanges against the served contracts.`); },
  };
}
