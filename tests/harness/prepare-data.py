#!/usr/bin/env python3
"""准备端到端测试数据，输出到 tests/harness/data/。

需要：
  - yt-dlp、ffmpeg
  - 一到两个中英双语 SRT（bilingual-srt-translator skill 的产物：英文行在前、中文行在后）

用法：
  python3 tests/harness/prepare-data.py a_bilingual.srt [b_bilingual.srt]
第一个 SRT 用作 YouTube 人工双语视频和 B站第 2P；第二个（缺省时同第一个）用作 B站第 1P。
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


def json3_to_bili(track):
    """json3 → B站字幕格式（秒）。"""
    return {'body': [{'from': e['tStartMs'] / 1000, 'to': (e['tStartMs'] + e['dDurationMs']) / 1000,
                      'content': e['segs'][0]['utf8']} for e in track['events']]}


def bili_data(srt_a: Path, srt_b: Path):
    en_a, zh_a = srt_to_json3(srt_a)
    en_b, zh_b = srt_to_json3(srt_b)
    duration = lambda t: int(max(e['tStartMs'] + e['dDurationMs'] for e in t['events']) / 1000) + 5
    return {
        'durations': {'p1': duration(en_b), 'p2': duration(en_a)},
        'subs': {
            'p1-en': json3_to_bili(en_b), 'p1-zh': json3_to_bili(zh_b),
            'p2-en': json3_to_bili(en_a), 'p2-zh': json3_to_bili(zh_a),
            # 「别的视频的字幕」：时长是正确字幕的 3 倍
            'wrong': {'body': [{'from': i * 30, 'to': i * 30 + 3, 'content': f'别的视频 {i}'}
                               for i in range(duration(en_b) // 10)]},
        },
    }


def main():
    if len(sys.argv) not in (2, 3):
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

    srt_a = Path(sys.argv[1])
    srt_b = Path(sys.argv[2]) if len(sys.argv) == 3 else srt_a
    (DATA / 'bili-data.js').write_text(
        'window.__BILI__ = ' + json.dumps(bili_data(srt_a, srt_b), ensure_ascii=False) + ';', 'utf-8')
    print('done:', DATA)


if __name__ == '__main__':
    main()
