import { describe, it, expect } from 'vitest';
import { checkSaveSafety, hasFrontmatter } from '../saveGuard';

describe('hasFrontmatter', () => {
  it('YAML frontmatter로 시작하면 true', () => {
    expect(hasFrontmatter('---\ntitle: Hi\ntags: [a]\n---\n\n# Body\n')).toBe(true);
  });
  it('BOM이 앞에 붙어도 인식', () => {
    expect(hasFrontmatter('﻿---\ntitle: Hi\n---\nbody')).toBe(true);
  });
  it('frontmatter 없으면 false', () => {
    expect(hasFrontmatter('# Just a heading\n\ntext')).toBe(false);
  });
  it('본문 중간의 --- 구분선은 frontmatter가 아니다', () => {
    expect(hasFrontmatter('text\n\n---\n\nmore')).toBe(false);
  });
});

describe('checkSaveSafety', () => {
  it('frontmatter가 사라지는 저장은 차단', () => {
    const previous = '---\ntitle: Post\n---\n\n# Body\n\ncontent here\n';
    // 라운드트립이 frontmatter를 ***/setext로 깨뜨린 결과
    const next = '***\n\ntitle: Post\n------------\n\n# Body\n\ncontent here\n';
    const r = checkSaveSafety(previous, next);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/frontmatter/i);
  });

  it('frontmatter가 보존되면 허용', () => {
    const previous = '---\ntitle: Post\n---\n\n# Body\n';
    const next = '---\ntitle: Post\n---\n\n# Body edited\n';
    expect(checkSaveSafety(previous, next).safe).toBe(true);
  });

  it('frontmatter 없는 문서의 일반 편집은 허용', () => {
    const previous = '# Heading\n\nsome paragraph text that is reasonably long\n';
    const next = '# Heading\n\nsome paragraph text that is reasonably long, edited\n';
    expect(checkSaveSafety(previous, next).safe).toBe(true);
  });

  it('내용 대부분(50%+, 50자+)이 사라지는 저장은 차단', () => {
    const previous = 'A'.repeat(100) + '\n' + 'B'.repeat(100) + '\n';
    const next = 'A'.repeat(20) + '\n';
    const r = checkSaveSafety(previous, next);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/content/i);
  });

  it('작은 문서에서의 비율 큰 삭제는 오탐하지 않는다 (절대 손실 < 50자)', () => {
    const previous = 'hello world\n';   // 12자
    const next = 'hi\n';                  // 3자, 75% 줄지만 절대 9자
    expect(checkSaveSafety(previous, next).safe).toBe(true);
  });

  it('빈 previous는 항상 안전', () => {
    expect(checkSaveSafety('', 'anything new').safe).toBe(true);
  });
});

describe('checkSaveSafety: 외부 편집 클로버 가드 (disk 인자)', () => {
  const lines = (n: number, prefix = 'line') =>
    Array.from({ length: n }, (_, i) => `${prefix} ${i}`).join('\n') + '\n';

  it('디스크가 마지막 동기화본보다 커졌고(외부 추가) 저장본이 대폭 짧으면 차단', () => {
    const previous = lines(20);          // markora가 마지막으로 본 내용
    const disk = lines(40);              // 터미널(외부)에서 줄이 추가됨
    const next = lines(5);               // lossy 직렬화 결과(짤림)
    const r = checkSaveSafety(previous, next, disk);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/external/i);
  });

  it('캡처 사례 재현: 디스크 621줄인데 저장본 346줄이면 차단', () => {
    const previous = lines(500);         // markora가 본 옛 내용(이미 stale)
    const disk = lines(621);             // Claude Code가 만든 실제 디스크 내용
    const next = lines(346);             // BlockNote lossy 직렬화(코드블록 중간 짤림)
    const r = checkSaveSafety(previous, next, disk);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/external/i);
  });

  it('외부 편집이 없으면(disk == previous) 일반 편집은 허용 — 회귀 방지', () => {
    const previous = lines(30);
    const next = lines(30).replace('line 0', 'line 0 edited');
    expect(checkSaveSafety(previous, next, previous).safe).toBe(true);
  });

  it('disk 미제공이면 기존 2-인자 동작 유지 — 회귀 방지', () => {
    const previous = '# Heading\n\nsome paragraph text that is reasonably long\n';
    const next = '# Heading\n\nsome paragraph text that is reasonably long, edited\n';
    expect(checkSaveSafety(previous, next).safe).toBe(true);
  });

  it('이미지 URL 표현 차이로 disk!=previous지만 줄 수/내용이 사실상 같으면 차단하지 않음 (오탐 방지)', () => {
    // 저장 후 previous(lastKnown)에는 절대 URL, disk에는 상대경로가 들어가 문자열은 다르지만
    // 줄 수와 실내용은 동일 → 외부 편집이 아니므로 허용해야 한다.
    const previous = '# Doc\n\n![a](http://localhost:63342/api/local-image?path=%2Fp%2Fimages%2Fa.png)\n\nbody\n';
    const disk = '# Doc\n\n![a](images/a.png)\n\nbody\n';
    const next = '# Doc\n\n![a](http://localhost:63342/api/local-image?path=%2Fp%2Fimages%2Fa.png)\n\nbody edited\n';
    expect(checkSaveSafety(previous, next, disk).safe).toBe(true);
  });
});
