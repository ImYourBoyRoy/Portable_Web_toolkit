export default {
  schemaVersion: 1,
  project: { name: 'tauri-application', root: '../..' },
  adapters: [
    {
      id: 'frontend-browser-mode',
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:1420',
      scenarios: [
        { name: 'main-window', path: '/', steps: [] }
      ]
    },
    {
      id: 'packaged-webview',
      type: 'command-evidence',
      command: 'npm',
      args: ['run', 'test:tauri-a11y-export'],
      outputFile: 'target/a11y/tauri-evidence.json',
      timeoutMs: 180000
    }
  ],
  reporters: [
    { type: 'console' },
    { type: 'json', file: 'tauri-.wcag-audit-results.json' },
    { type: 'sarif', file: 'tauri-.wcag-audit-results.sarif' }
  ]
};
