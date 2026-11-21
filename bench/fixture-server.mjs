import { once } from 'node:events';
import { createServer } from 'node:http';

export async function startFixtureServer({ host = '127.0.0.1', port = 0 } = {}) {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${host}`);
    const page = renderFixturePage(requestUrl);
    response.writeHead(page.status, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
    });
    response.end(page.html);
  });

  server.listen(port, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not expose a TCP address');
  }

  return {
    baseUrl: `http://${host}:${address.port}`,
    server,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

export function renderFixturePage(url) {
  switch (url.pathname) {
    case '/':
      return htmlPage('Fixture start', [
        '<h1>Fixture start</h1>',
        '<a href="/docs">Open documentation</a>',
      ]);
    case '/docs':
      return htmlPage('Documentation', [
        '<h1>Documentation</h1>',
        '<p>Documentation opened successfully.</p>',
      ]);
    case '/search':
      return htmlPage('Catalog search', [
        '<h1>Catalog search</h1>',
        '<form action="/results" method="get">',
        '  <label for="query">Search</label>',
        '  <input id="query" name="q" type="search">',
        '  <button type="submit">Search</button>',
        '</form>',
      ]);
    case '/results': {
      const query = url.searchParams.get('q') ?? '';
      return htmlPage('Search results', [
        '<h1>Search results</h1>',
        `<p>Query: ${escapeHtml(query)}</p>`,
      ]);
    }
    case '/filter':
      return htmlPage('Plan filter', [
        '<h1>Plan filter</h1>',
        '<form action="/filtered" method="get">',
        '  <label for="plan">Plan</label>',
        '  <select id="plan" name="plan">',
        '    <option value="basic">Basic</option>',
        '    <option value="pro">Pro</option>',
        '  </select>',
        '  <button type="submit">Apply filter</button>',
        '</form>',
      ]);
    case '/filtered': {
      const plan = url.searchParams.get('plan') ?? '';
      return htmlPage('Filtered plans', [
        '<h1>Filtered plans</h1>',
        `<p>Plan: ${escapeHtml(plan)}</p>`,
      ]);
    }
    case '/journey':
      return htmlPage('Journey start', [
        '<h1>Journey start</h1>',
        '<a href="/journey/step-2">Continue</a>',
      ]);
    case '/journey/step-2':
      return htmlPage('Journey step two', [
        '<h1>Journey step two</h1>',
        '<a href="/journey/complete">Finish</a>',
      ]);
    case '/journey/complete':
      return htmlPage('Journey complete', [
        '<h1>Journey complete</h1>',
        '<p>Journey completed successfully.</p>',
      ]);
    default:
      return {
        status: 404,
        html: '<!doctype html><title>Not found</title><h1>Not found</h1>',
      };
  }
}

function htmlPage(title, body) {
  return {
    status: 200,
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8">',
      `  <title>${escapeHtml(title)}</title>`,
      '</head>',
      '<body>',
      '  <main>',
      ...body.map((line) => `    ${line}`),
      '  </main>',
      '</body>',
      '</html>',
    ].join('\n'),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
