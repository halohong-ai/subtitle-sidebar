#!/usr/bin/env python3
"""准备端到端测试数据，输出到 tests/harness/data/。

需要：
  - yt-dlp、ffmpeg
  - 一个中英双语 SRT（bilingual-srt-translator skill 的产物：英文行在前、中文行在后）

用法：
  python3 tests/harness/prepare-data.py path/to/xxx_bilingual.srt
"""

import json
import re
import subprocess
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent / 'data'
ASR_VIDEO = 'https://www.youtube.com/watch?v=ugvHCXCOmm4'  # Lex Fridman × Dario Amodei，5 小时


def srt_to_json3(srt_path: Path):
    """把双语 SRT 拆成英文、中文两条「人工字幕」json3。"""
    def ms(t):
        h, m, rest = t.split(':')
        s, f = rest.split(',')
        return ((int(h) * 60 + int(m)) * 60 + int(s)) * 1000 + int(f)

    en, zh = [], []
    for block in re.split(r'\n\s*\n', srt_path.read_text('utf-8').strip()):
        lines = block.strip().split('\n')
        if len(lines) < 3:
            continue
        a, b = [x.strip() for x in lines[1].split('-->')]
        start, end = ms(a), ms(b)
        en.append({'tStartMs': start, 'dDurationMs': end - start, 'segs': [{'utf8': lines[2]}]})
        zh.append({'tStartMs': start, 'dDurationMs': end - start, 'segs': [{'utf8': ' '.join(lines[3:])}]})
    return {'events': en}, {'events': zh}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    DATA.mkdir(parents=True, exist_ok=True)

    asr = DATA / 'sample.en.json3'
    if not asr.exists():
        subprocess.run(['yt-dlp', '--skip-download', '--write-auto-subs', '--sub-langs', 'en',
                        '--sub-format', 'json3', '-o', str(DATA / 'sample'), ASR_VIDEO], check=True)

    video = DATA / 'video.mp4'
    if not video.exists():
        # 5 小时、每秒 1 帧的测试画面，用来测试进度跟随和跳转
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=1',
                        '-t', '18900', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart', str(video)], check=True)

    en, zh = srt_to_json3(Path(sys.argv[1]))
    data = {
        'ASR00000001': {'en': json.loads(asr.read_text('utf-8'))},
        'MANUAL00001': {'en': en, 'zh-Hans': zh},
    }
    # file:// 页面不能 fetch，所以打包成 <script> 能加载的 JS
    (DATA / 'data.js').write_text('window.__CAPTIONS__ = ' + json.dumps(data, ensure_ascii=False) + ';', 'utf-8')
    print('done:', DATA)


if __name__ == '__main__':
    main()
