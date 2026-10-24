// 打包上架用的 zip：先正式构建，再把 dist/ 压成 store/subtitle-sidebar-<版本>.zip。
// 用法：npm run pack
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('static/manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== version) {
  console.error(`版本号不一致：manifest.json 是 ${version}，package.json 是 ${pkg.version}`);
  process.exit(1);
}

execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
const zip = resolve(`store/subtitle-sidebar-${version}.zip`);
rmSync(zip, { force: true });
// -X 不带 macOS 扩展属性；排除外置盘上的 ._ 元数据文件
execFileSync('zip', ['-r', '-X', zip, '.', '-x', '._*', '*/._*', '.DS_Store'], { cwd: 'dist', stdio: 'inherit' });
console.log(`\n已生成 ${zip}`);
