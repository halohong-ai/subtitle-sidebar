import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
// 跳过 macOS 在外置盘上生成的 ._ 元数据文件
cpSync('static', outdir, { recursive: true, filter: (src) => !/(^|\/)\._/.test(src) });

// 内容脚本不能是 ES 模块，所以每个入口单独打成 IIFE。
const options = {
  entryPoints: {
    'main-world': 'src/inject/main-world.ts',
    content: 'src/content/index.tsx',
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

// 测试页用的入口，输出到 tests/harness/build，不进扩展包。
const harness = {
  ...options,
  entryPoints: { 'harness-content': 'tests/harness/harness-content.tsx' },
  outdir: 'tests/harness/build',
  minify: false,
  logLevel: 'warning',
};

if (watch) {
  const hctx = await esbuild.context(harness);
  await hctx.watch();
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  await esbuild.build(harness);
}
