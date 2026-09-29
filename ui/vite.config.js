import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import eslintPlugin from 'vite-plugin-eslint';

// Which UI source this build is made from (see source-id.sh). mxgo.sh
// compares build/ui-source.txt with the checkout, so a stale build - the
// server serves ui/build as it is - cannot go unnoticed.
const uiDir = path.dirname(fileURLToPath(import.meta.url));

function uiSourceId() {
  try {
    return execFileSync('sh', [path.join(uiDir, 'source-id.sh')])
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const UI_SOURCE = uiSourceId();

const uiSourceStamp = {
  name: 'ui-source-stamp',
  apply: 'build',
  writeBundle(options) {
    writeFileSync(path.join(options.dir, 'ui-source.txt'), `${UI_SOURCE}\n`);
  },
};

export default defineConfig({
  define: {
    __UI_SOURCE__: JSON.stringify(UI_SOURCE),
  },
  plugins: [
    react(),
    uiSourceStamp,
    { ...eslintPlugin(), apply: 'serve' }, // dev only to reduce build time
  ],
  server: {
    allowedHosts: [
      'mxcubeweb-proxima1.exp.synchrotron-soleil.fr',
      'mxcubeweb-px1.synchrotron-soleil.fr',
    ],
    host: '195.221.8.78',
    port: 5173,
    watch: {
      usePolling: true, // This might help with some network setups
    },
    open: true, // open default browser on start
    strictPort: true, // fail if port already in use (must be 5173 to match server's CORS config)
    proxy: {
      '/mxcube/api':
        'https://mxcubeweb-proxima1.exp.synchrotron-soleil.fr:8081', //'195.221.8.78:8081'
      '/socket.io/': {
        target: 'wss://mxcubeweb-proxima1.exp.synchrotron-soleil.fr:8081',
        ws: true,
      },
      '/video/': '195.221.8.78:8000',
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  assetsInclude: ['**/*.ogv'],
});
