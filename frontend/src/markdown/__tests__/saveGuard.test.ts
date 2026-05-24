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
