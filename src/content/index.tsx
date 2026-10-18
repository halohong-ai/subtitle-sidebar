import { render } from 'preact';
import { bilibili } from '../sites/bilibili';
import { youtube } from '../sites/youtube';
import { Panel } from '../ui/Panel';
import css from '../ui/styles.css';

const HOST_ID = 'subtitle-sidebar-host';

function mount(): void {
  if (document.getElementById(HOST_ID)) return;
  // 浮窗放在 Shadow DOM 里，样式不会和网站互相影响。
  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const root = document.createElement('div');
  shadow.append(style, root);
  document.documentElement.appendChild(host);
  const adapter = location.hostname.endsWith('bilibili.com') ? bilibili : youtube;
  render(<Panel adapter={adapter} />, root);
}

mount();
