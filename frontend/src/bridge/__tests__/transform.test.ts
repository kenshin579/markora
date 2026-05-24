import { describe, it, expect } from 'vitest';
import { splitFrontmatter, joinFrontmatter } from '../transform';

describe('splitFrontmatter', () => {
  it('맨 앞 YAML frontmatter를 본문과 분리', () => {
    const md = '---\ntitle: Post\ntags: [a, b]\n---\n\n# Body\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('---\ntitle: Post\ntags: [a, b]\n---\n');
    expect(body).toBe('\n# Body\n\ntext\n');
  });

  it('frontmatter가 없으면 frontmatter는 빈 문자열, body는 원본', () => {
    const md = '# Just heading\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('');
    expect(body).toBe(md);
  });

  it('본문 중간의 --- 구분선은 frontmatter로 보지 않는다', () => {
    const md = 'intro\n\n---\n\nmore\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('');
    expect(body).toBe(md);
  });

  it('BOM이 앞에 있어도 분리', () => {
    const md = '﻿---\ntitle: X\n---\nbody\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('﻿---\ntitle: X\n---\n');
    expect(body).toBe('body\n');
  });

  it('CRLF 줄바꿈도 처리', () => {
    const md = '---\r\ntitle: X\r\n---\r\nbody\r\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('---\r\ntitle: X\r\n---\r\n');
    expect(body).toBe('body\r\n');
  });
});

describe('joinFrontmatter', () => {
  it('frontmatter를 body 앞에 그대로 붙인다', () => {
    expect(joinFrontmatter('---\ntitle: X\n---\n', '\n# Body\n')).toBe('---\ntitle: X\n---\n\n# Body\n');
  });

  it('frontmatter가 빈 문자열이면 body만 반환', () => {
    expect(joinFrontmatter('', '# Body\n')).toBe('# Body\n');
  });

  it('split → join 라운드트립이 원본을 보존', () => {
    const md = '---\ntitle: Post\n---\n\n# Body\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(joinFrontmatter(frontmatter, body)).toBe(md);
  });
});
