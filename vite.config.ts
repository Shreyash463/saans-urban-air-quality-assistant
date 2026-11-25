import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

const PRELOAD_FONT_PATTERNS = [
  /plus-jakarta-sans-latin-400-normal.*\.woff2$/,
  /sora-latin-700-normal.*\.woff2$/,
  /jetbrains-mono-latin-600-normal.*\.woff2$/,
];

const BROTLI_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json']);

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function saansBuildOptimizations(): Plugin {
  return {
    name: 'saans-build-optimizations',
    apply: 'build',
    closeBundle(error?: Error): void {
      if (error) return;
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
      const distSrcAssets = path.resolve(distDir, 'src/assets');
      if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
        fs.cpSync(srcAssets, distSrcAssets, { recursive: true, force: true });
      }

      // Inject <link rel="preload"> for primary Latin WOFF2 weights into built index.html
      const indexFile = path.join(distDir, 'index.html');
      const assetsDir = path.join(distDir, 'assets');
      if (fs.existsSync(indexFile) && fs.existsSync(assetsDir)) {
        const assetFiles = fs.readdirSync(assetsDir);
        const preloadLinks = PRELOAD_FONT_PATTERNS.map((pattern) =>
          assetFiles.find((name) => pattern.test(name))
        )
          .filter((name): name is string => Boolean(name))
          .map(
            (name) =>
              `    <link rel="preload" as="font" type="font/woff2" href="/assets/${name}" crossorigin />`
          );

        if (preloadLinks.length > 0) {
          const html = fs.readFileSync(indexFile, 'utf8');
          const injected = html.replace(
            '</head>',
            `${preloadLinks.join('\n')}\n  </head>`
          );
          fs.writeFileSync(indexFile, injected, 'utf8');
        }
      }

      // Precompress compressible build outputs with Brotli for FastAPI static serving
      if (fs.existsSync(distDir)) {
        for (const filePath of walkFiles(distDir)) {
          const ext = path.extname(filePath).toLowerCase();
          if (!BROTLI_EXTENSIONS.has(ext) || filePath.endsWith('.br')) continue;
          const raw = fs.readFileSync(filePath);
          if (raw.byteLength < 256) continue;
          const compressed = zlib.brotliCompressSync(raw, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            },
          });
          if (compressed.byteLength < raw.byteLength) {
            fs.writeFileSync(`${filePath}.br`, compressed);
          }
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), saansBuildOptimizations()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
