// 测试页用的内容脚本入口：和正式版相同，只是视频标识从查询参数读取
// （file:// 页面的路径不是 /watch 或 /video/BV…）。
//   YouTube 模拟页：?v=<videoId>
//   B站模拟页：    ?site=bili&bv=<BV号>&p=<分P>
import { render } from 'preact';
import { bilibili } from '../../src/sites/bilibili';
import type { SiteAdapter } from '../../src/sites/types';
import { youtube } from '../../src/sites/youtube';
import { Panel } from '../../src/ui/Panel';
import css from '../../src/ui/styles.css';

const params = () => new URLSearchParams(location.search);
const isBili = params().get('site') === 'bili';

const adapter: SiteAdapter = isBili
  ? {
      ...bilibili,
      videoKey() {
        const bv = params().get('bv');
        return bv ? `bili:${bv}:${Number(params().get('p')) || 1}` : null;
      },
    }
  : {
      ...youtube,
      videoKey() {
        const v = params().get('v');
        return v ? `yt:${v}` : null;
      },
    };

const host = document.createElement('div');
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = css;
const root = document.createElement('div');
shadow.append(style, root);
document.documentElement.appendChild(host);
render(<Panel adapter={adapter} />, root);
