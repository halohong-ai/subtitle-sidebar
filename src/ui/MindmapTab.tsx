import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mindmap } from '../core/types';
import { seek } from '../content/sync';
import { downloadUrl } from './files';
import { drawRadial, drawTree, mindmapToPng } from './mindmap';

interface Props {
  mindmap?: Mindmap;
  /** 导入的导图图片（如 skill 生成的 PNG），只能看，不能点击跳转 */
  image?: string;
  dark: boolean;
  filename: string;
  getVideo: () => HTMLVideoElement | null;
}

export function MindmapTab({ mindmap, image, dark, filename, getVideo }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 竖排树：随侧栏宽度重画
  useEffect(() => {
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!mindmap || !box || !svg) return;
    let lastWidth = 0;
    const draw = () => {
      const w = Math.floor(box.clientWidth);
      if (w > 0 && w !== lastWidth) {
        lastWidth = w;
        drawTree(svg, mindmap, w, dark);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [mindmap, dark]);

  const onMapClick = (e: MouseEvent) => {
    const g = (e.target as Element).closest('[data-time]');
    const video = getVideo();
    if (g && video) seek(video, Number(g.getAttribute('data-time')));
  };

  const exportPng = async () => {
    setExporting(true);
    try {
      if (mindmap) downloadUrl(`${filename}_mindmap.png`, await mindmapToPng(mindmap));
      else if (image) downloadUrl(`${filename}_mindmap.png`, image);
    } finally {
      setExporting(false);
    }
  };

  if (!mindmap && !image) {
    return (
      <div class="empty">
        <p>还没有导图。</p>
        <p>
          点右上角 ⋯ →「复制 AI 提示词」，AI 的回复里会包含导图；点 ⋯ →「导入」粘贴即可。
          也可以导入 bilingual-srt-translator 生成的导图 PNG（图片只能查看，不能点击跳转）。
        </p>
      </div>
    );
  }

  return (
    <div class="mindmap">
      <div class="mindmap-bar">
        {mindmap && <span class="hint">点分支跳到对应位置</span>}
        <button type="button" onClick={() => setEnlarged(true)}>
          放大查看
        </button>
        <button type="button" class="primary" disabled={exporting} onClick={exportPng}>
          {exporting ? '导出中…' : '导出 PNG'}
        </button>
      </div>
      <div class="mindmap-body list" ref={boxRef}>
        {mindmap ? (
          <svg ref={svgRef} class="mindmap-svg" onClick={onMapClick} />
        ) : (
          <img src={image} alt="思维导图" class="mindmap-img" onClick={() => setEnlarged(true)} />
        )}
      </div>
      {enlarged && (
        <Overlay mindmap={mindmap} image={image} onSeek={onMapClick} onClose={() => setEnlarged(false)} />
      )}
    </div>
  );
}

function Overlay({
  mindmap,
  image,
  onSeek,
  onClose,
}: {
  mindmap?: Mindmap;
  image?: string;
  onSeek: (e: MouseEvent) => void;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (mindmap && svgRef.current) drawRadial(svgRef.current, mindmap);
  }, [mindmap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="overlay-card">
        <button type="button" class="icon overlay-close" aria-label="关闭" onClick={onClose}>
          ×
        </button>
        {mindmap ? (
          <svg ref={svgRef} class="mindmap-large" onClick={onSeek} />
        ) : (
          <img src={image} alt="思维导图" class="mindmap-large" />
        )}
      </div>
    </div>
  );
}
