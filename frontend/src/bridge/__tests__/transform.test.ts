import { describe, it, expect } from 'vitest';
import { splitFrontmatter, joinFrontmatter } from '../transform';

describe('splitFrontmatter', () => {
  it('맨 앞 YAML frontmatter의 inner YAML만 떼어내고 본문을 분리', () => {
    const md = '---\ntitle: Post\ntags: [a, b]\n---\n\n# Body\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('title: Post\ntags: [a, b]');
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

  it('BOM이 앞에 있어도 inner YAML만 분리(BOM 제거)', () => {
    const md = '﻿---\ntitle: X\n---\nbody\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('title: X');
    expect(body).toBe('body\n');
  });

  it('CRLF 입력도 inner YAML을 분리(본문은 그대로)', () => {
    const md = '---\r\ntitle: X\r\n---\r\nbody\r\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('title: X');
    expect(body).toBe('body\r\n');
  });
});

describe('joinFrontmatter', () => {
  it('inner YAML을 --- 펜스로 감싸 body 앞에 붙인다', () => {
    expect(joinFrontmatter('title: X', '\n# Body\n')).toBe('---\ntitle: X\n---\n\n# Body\n');
  });

  it('frontmatter가 빈 문자열이면 body만 반환(frontmatter 삭제)', () => {
    expect(joinFrontmatter('', '# Body\n')).toBe('# Body\n');
  });

  it('frontmatter가 공백뿐이어도 body만 반환', () => {
    expect(joinFrontmatter('   \n  ', '# Body\n')).toBe('# Body\n');
  });

  it('split → join 라운드트립이 LF 본문 원본을 보존', () => {
    const md = '---\ntitle: Post\n---\n\n# Body\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(joinFrontmatter(frontmatter, body)).toBe(md);
  });
});
