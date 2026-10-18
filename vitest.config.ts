import { defineConfig } from 'vitest/config';

// 外置盘上 macOS 会生成 ._ 开头的元数据文件，排除掉。
export default defineConfig({
  test: { include: ['tests/**/[!._]*.test.ts'] },
});
