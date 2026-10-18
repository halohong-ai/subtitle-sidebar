// 测试页用的内容脚本入口：和正式版完全相同，只是视频标识从查询参数读取
// （file:// 页面的路径不是 /watch）。
import { render } from 'preact';
import { youtube } from '../../src/sites/youtube';
import type { SiteAdapter } from '../../src/sites/types';
import { Panel } from '../../src/ui/Panel';
import css from '../../src/ui/styles.css';

const adapter: SiteAdapter = {
  ...youtube,
  videoKey() {
    const v = new URLSearchParams(location.search).get('v');
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
