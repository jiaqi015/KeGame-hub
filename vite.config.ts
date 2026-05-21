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
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
    return String(pkg.lineCount || 0);
  } catch {
    return '0';
  }
}

function getBuildCode() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
    return pkg.buildCode || '000000';
  } catch {
    return '000000';
  }
}

export default defineConfig(({mode}) => {
  const commitHash = getGitCommitHash();
  const appVersion = getAppVersion();
  const versionType = getVersionType();
  const lineCount = getLineCount();
  const buildCode = getBuildCode();
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(commitHash),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_VERSION_TYPE': JSON.stringify(versionType),
      'import.meta.env.VITE_LINE_COUNT': JSON.stringify(lineCount),
      'import.meta.env.VITE_BUILD_CODE': JSON.stringify(buildCode),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
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
    test: {
      exclude: ['**/.claude/worktrees/**', '**/node_modules/**', '**/e2e/**'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
