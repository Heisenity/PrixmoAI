import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const getPackageName = (id: string) => {
  const modulePath = id.split('node_modules/')[1];

  if (!modulePath) {
    return null;
  }

  const parts = modulePath.split('/');
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl =
    env.VITE_API_BASE_URL || env.SERVER_PUBLIC_URL || 'http://localhost:5000';
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';

  return {
    plugins: [react()],
    define: {
      __PRIXMOAI_API_BASE_URL__: JSON.stringify(apiBaseUrl),
      __PRIXMOAI_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __PRIXMOAI_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
    },
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
  };
});
