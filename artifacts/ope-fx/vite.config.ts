import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5173);
// Render already supplies CLERK_PUBLISHABLE_KEY for the API. Reuse it when
// VITE_CLERK_PUBLISHABLE_KEY was not duplicated into the build environment.
// Clerk publishable keys are safe to embed in the browser bundle.
const clerkPublishableKey =
  process.env.VITE_CLERK_PUBLISHABLE_KEY ??
  process.env.CLERK_PUBLISHABLE_KEY ??
  '';

export default defineConfig({
  base: '/',
  define: {
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':
      JSON.stringify(clerkPublishableKey),
  },
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
