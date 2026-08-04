export default {
  schemaVersion: 1,
  project: { name: 'example-web-app', root: '../..' },
  adapters: [
    {
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:4173',
      scenarios: [{ name: 'home', path: '/', steps: [] }]
    },
    {
      type: 'manual-evidence',
      file: 'examples/basic/manual-evidence.json'
    }
  ],
  reporters: [
    { type: 'console' },
    { type: 'json', file: 'example-results.json' },
    { type: 'html', file: 'example-report.html' }
  ]
};
