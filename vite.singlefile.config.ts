import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { viteSingleFile } from 'vite-plugin-singlefile';

function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// 오프라인 단일 파일 전용 빌드: 상대경로 + 모든 자산 인라인
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId() + '-offline') },
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist-single',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000
  }
});
