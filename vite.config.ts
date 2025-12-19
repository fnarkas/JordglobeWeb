import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Rewrite /party to /party.html
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true
  },
  publicDir: 'public',
  appType: 'mpa',
  plugins: [
    {
      name: 'rewrite-party',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/party' || req.url === '/party/') {
            req.url = '/party.html';
          }
          if (req.url === '/host' || req.url === '/host/') {
            req.url = '/host.html';
          }
          next();
        });
      }
    }
  ]
});
