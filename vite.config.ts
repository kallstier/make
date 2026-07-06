import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// 빌드 식별자: CI(GITHUB_SHA) 우선, 로컬은 git HEAD, 둘 다 없으면 'dev'
function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: '/make/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId())
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000
  }
});
