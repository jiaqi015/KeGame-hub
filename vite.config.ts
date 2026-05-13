import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {execSync} from 'child_process';
import {defineConfig} from 'vite';

function getGitCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

function getAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getVersionType() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
    return pkg.versionType || 'square';
  } catch {
    return 'square';
  }
}

function getLineCount() {
  try {
    const result = execSync(
      'find src lib api modules e2e scripts server.ts -name "*.ts" -o -name "*.tsx" -o -name "*.css" 2>/dev/null | xargs wc -l | tail -1',
      {cwd: __dirname, encoding: 'utf-8'}
    );
    const match = result.match(/(\d+)/);
    return match ? match[1] : '0';
  } catch {
    return '0';
  }
}

export default defineConfig(({mode}) => {
  const commitHash = getGitCommitHash();
  const appVersion = getAppVersion();
  const versionType = getVersionType();
  const lineCount = getLineCount();
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(commitHash),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_VERSION_TYPE': JSON.stringify(versionType),
      'import.meta.env.VITE_LINE_COUNT': JSON.stringify(lineCount),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('/lucide-react/')) {
              return 'icons-vendor';
            }
            if (id.includes('/xlsx/')) {
              return 'xlsx-vendor';
            }
            if (id.includes('/marked/') || id.includes('/highlight.js/') || id.includes('/katex/')) {
              return 'content-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
