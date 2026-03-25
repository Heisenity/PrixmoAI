import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const getPackageName = (id: string) => {
  const modulePath = id.split('node_modules/')[1];

  if (!modulePath) {
    return null;
  }

  const parts = modulePath.split('/');
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          const packageName = getPackageName(id);

          if (!packageName) {
            return 'vendor';
          }

          if (
            packageName === 'react' ||
            packageName === 'react-dom' ||
            packageName === 'scheduler'
          ) {
            return 'react-vendor';
          }

          if (
            packageName === 'react-router' ||
            packageName === 'react-router-dom'
          ) {
            return 'router';
          }

          if (
            packageName === '@supabase/supabase-js' ||
            packageName.startsWith('@supabase/')
          ) {
            return 'supabase';
          }

          if (
            packageName === 'framer-motion' ||
            packageName === 'motion-dom' ||
            packageName === 'motion-utils'
          ) {
            return 'motion';
          }

          if (packageName === 'lenis') {
            return 'lenis';
          }

          if (packageName === 'lucide-react') {
            return 'icons';
          }

          return 'vendor';
        },
      },
    },
  },
});
