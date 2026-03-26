import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import eslintPlugin from 'vite-plugin-eslint';

export default defineConfig({
  plugins: [
    react(),
    { ...eslintPlugin(), apply: 'serve' }, // dev only to reduce build time
  ],
  server: {
    allowedHosts: ['mxcubeweb-proxima1.exp.synchrotron-soleil.fr','mxcubeweb-px1.synchrotron-soleil.fr' ],
    host: '195.221.8.78',
    port: 5173,
    watch: {
      usePolling: true, // This might help with some network setups
    },
    open: true, // open default browser on start
    strictPort: true, // fail if port already in use (must be 5173 to match server's CORS config)
    proxy: {
      '/mxcube/api': 'https://mxcubeweb-proxima1.exp.synchrotron-soleil.fr:8081', //'195.221.8.78:8081'
      '/socket.io/': { target: 'wss://mxcubeweb-proxima1.exp.synchrotron-soleil.fr:8081', ws: true },
      '/video/': '195.221.8.78:8000',
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  assetsInclude: ['**/*.ogv'],
});
