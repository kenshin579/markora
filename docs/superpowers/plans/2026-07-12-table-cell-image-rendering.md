# 테이블 셀 이미지 렌더링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BlockNote 테이블 셀 안의 마크다운 이미지를 markora에서 표시(display-only)하고, 로드→저장 라운드트립에서 무손실 보존한다.

**Architecture:** 마크다운 문자열 계층에서 테이블 셀 이미지를 마크다운 무해 토큰으로 마스킹해 BlockNote 파서가 이미지를 드롭하지 않고 셀 텍스트로 보존하게 하고, 블록트리 계층(`postParse`)에서 토큰 텍스트를 `inlineImage` 커스텀 인라인 콘텐츠로 복원한다. 저장은 정확히 역방향(`preSerialize`에서 `inlineImage`→토큰, 직렬화 후 토큰→마크다운 이미지)이며 기존 `imageMap.restoreImagePaths`보다 먼저 실행된다.

**Tech Stack:** TypeScript, React 18, BlockNote 0.49 (`@blocknote/core`·`@blocknote/react`), Vitest(happy-dom).

작업 디렉터리: 모든 경로는 `markora/frontend/` 기준. 명령은 `markora/frontend/`에서 실행.

---

## File Structure

- **Create** `src/markdown/tableImage.ts` — 토큰 코덱(`encodeToken`/`decodeToken`), 문자열 마스킹(`maskTableImages`/`unmaskTableImages`), 셀 인라인 변환(`tokenTextToInline`/`inlineToTokenText`). 셀 이미지 관련 전 로직 응집.
- **Create** `src/inline/InlineImage.tsx` — `inlineImage` 커스텀 인라인 콘텐츠 스펙(표시 전용 `<img>`). `src/inline/KatexInline.tsx` 패턴.
- **Create** `src/markdown/__tests__/tableImage.test.ts` — 코덱·마스킹·변환 단위 테스트.
- **Create** `src/markdown/__tests__/tableImage-roundtrip.test.ts` — 실제 BlockNote 에디터를 통한 전체 라운드트립 통합 테스트.
- **Modify** `src/editor/schema.ts` — `inlineContentSpecs`에 `inlineImage` 등록.
- **Modify** `src/markdown/customParse.ts` — `postParse`/`preSerialize`에 `tableContent` 분기 추가.
- **Modify** `src/editor/Editor.tsx` — 로드 2곳 `maskTableImages`, 저장 1곳 `unmaskTableImages` 배선.

---

## Task 1: 토큰 코덱

**Files:**
- Create: `src/markdown/tableImage.ts`
- Test: `src/markdown/__tests__/tableImage.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/markdown/__tests__/tableImage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeToken, decodeToken } from '../tableImage';

describe('토큰 코덱', () => {
  it('encode → decode 라운드트립(한글 alt/title 포함)', () => {
    const img = { url: 'http://localhost:63342/api/local-image?path=%2Fa%2Fb.png', alt: '설명 [x]', title: '제목 "인용"' };
    const token = encodeToken(img);
    expect(token).toMatch(/^\.MKRAIMG\.[A-Za-z0-9_-]+\.$/);
    expect(decodeToken(token.slice('.MKRAIMG.'.length, -1))).toEqual(img);
  });

  it('토큰은 마크다운 특수문자/파이프를 포함하지 않는다', () => {
    const token = encodeToken({ url: 'a|b*c_d', alt: '![nested](x)', title: '' });
    const payload = token.slice('.MKRAIMG.'.length, -1);
    expect(payload).not.toMatch(/[|*`\[\]()<>~\\]/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tableImage.test.ts`
Expected: FAIL — `encodeToken`/`decodeToken` is not defined (모듈 없음).

- [ ] **Step 3: 최소 구현**

`src/markdown/tableImage.ts`:

```ts
// 테이블 셀 이미지 지원 (표시 전용 + 무손실 라운드트립)
//
// BlockNote 테이블 셀(tableParagraph)은 content: "inline*" 이라 블록 레벨 image 노드를
// 담을 수 없어, 마크다운 파싱 시 셀 안 이미지가 드롭된다. 이를 우회하기 위해 파싱 직전
// 셀 이미지를 마크다운 무해 토큰 텍스트로 마스킹하고(파서가 텍스트로 보존), 파싱 후
// 셀 인라인의 토큰을 inlineImage 커스텀 인라인 콘텐츠로 복원한다. 저장은 역방향.

export interface TableImage {
  url: string;
  alt: string;
  title: string;
}

// 토큰: .MKRAIMG.<base64url(JSON)>.  — base64url 알파벳(A-Za-z0-9-_)은 마크다운/파이프에
// 무해하고, 구분자 '.' 은 base64url 에 등장하지 않아 경계가 모호하지 않다.
const TOKEN_RE = /\.MKRAIMG\.([A-Za-z0-9_-]+)\./g;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeToken(img: TableImage): string {
  const bytes = new TextEncoder().encode(JSON.stringify(img));
  return `.MKRAIMG.${toBase64Url(bytes)}.`;
}

export function decodeToken(payload: string): TableImage {
  const json = new TextDecoder().decode(fromBase64Url(payload));
  const o = JSON.parse(json);
  return { url: o.url ?? '', alt: o.alt ?? '', title: o.title ?? '' };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tableImage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/markdown/tableImage.ts src/markdown/__tests__/tableImage.test.ts
git commit -m "feat: 테이블 셀 이미지 토큰 코덱 추가"
```

---

## Task 2: 문자열 마스킹/언마스킹

**Files:**
- Modify: `src/markdown/tableImage.ts`
- Test: `src/markdown/__tests__/tableImage.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (기존 파일 하단에 append)**

`src/markdown/__tests__/tableImage.test.ts` 에 추가:

```ts
import { maskTableImages, unmaskTableImages } from '../tableImage';

describe('maskTableImages', () => {
  it('테이블 셀 이미지를 토큰으로 치환', () => {
    const md = [
      '| A | B |',
      '| --- | --- |',
      '| ![alt](img.png) | text |',
      '',
    ].join('\n');
    const masked = maskTableImages(md);
    expect(masked).not.toContain('![alt](img.png)');
    expect(masked).toMatch(/\.MKRAIMG\.[A-Za-z0-9_-]+\./);
    // 헤더/구분/셀 텍스트/파이프 구조는 유지
    expect(masked.split('\n')[2]).toMatch(/^\| \.MKRAIMG\..+\. \| text \|$/);
  });

  it('테이블 밖 일반 단락의 이미지는 건드리지 않는다', () => {
    const md = 'para ![a](x.png) end\n\n| H |\n| --- |\n| c |';
    expect(maskTableImages(md)).toContain('![a](x.png)');
  });

  it('파이프만 있고 구분행이 없는 단락은 테이블로 오인하지 않는다', () => {
    const md = 'a | b ![a](x.png) c | d';
    expect(maskTableImages(md)).toContain('![a](x.png)');
  });

  it('코드펜스 내부 테이블 유사 라인은 건드리지 않는다', () => {
    const md = '```\n| ![a](x.png) |\n| --- |\n```';
    expect(maskTableImages(md)).toContain('![a](x.png)');
  });
});

describe('unmaskTableImages', () => {
  it('토큰을 마크다운 이미지로 복원(title 유무)', () => {
    const withTitle = encodeToken({ url: 'u.png', alt: 'a', title: 't' });
    const noTitle = encodeToken({ url: 'v.png', alt: 'b', title: '' });
    expect(unmaskTableImages(`x ${withTitle} y`)).toBe('x ![a](u.png "t") y');
    expect(unmaskTableImages(`x ${noTitle} y`)).toBe('x ![b](v.png) y');
  });

  it('mask → unmask 왕복이 테이블 이미지 원문을 복원', () => {
    const md = '| A |\n| --- |\n| ![alt](img.png) |';
    expect(unmaskTableImages(maskTableImages(md))).toBe(md);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tableImage.test.ts`
Expected: FAIL — `maskTableImages`/`unmaskTableImages` is not defined.

- [ ] **Step 3: 최소 구현 (`tableImage.ts` 에 추가)**

```ts
// blockquote.ts / strikethrough.ts 와 동일한 펜스 판정.
const FENCE_RE = /^ {0,3}(```|~~~)/;
// GFM 구분행: 셀마다 optional colon + 하이픈. 최소 한 개의 '-' 포함.
const DELIM_ROW_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
// 마크다운 이미지 ![alt](target "title"?). target 은 공백 없는 토큰.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim() !== '';
}

function maskImagesInLine(line: string): string {
  return line.replace(IMAGE_RE, (_m, alt: string, url: string, title?: string) =>
    encodeToken({ url, alt: alt ?? '', title: title ?? '' }));
}

// GFM 테이블 블록(헤더행 + 구분행 + 본문행)을 라인 스캔으로 식별하고, 그 안의
// 마크다운 이미지만 토큰으로 치환한다. 코드펜스 내부는 제외.
export function maskTableImages(md: string): string {
  const lines = md.split('\n');
  let inFence = false;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) { inFence = !inFence; inTable = false; continue; }
    if (inFence) continue;
    if (!inTable) {
      // 헤더행 조건: 현재 줄이 파이프 행이고 다음 줄이 구분행.
      if (isTableRow(line) && i + 1 < lines.length && DELIM_ROW_RE.test(lines[i + 1])) {
        inTable = true;
      }
    } else if (!isTableRow(line)) {
      // 빈 줄/비-행에서 테이블 종료.
      inTable = false;
      continue;
    }
    if (inTable) lines[i] = maskImagesInLine(line);
  }
  return lines.join('\n');
}

export function unmaskTableImages(md: string): string {
  return md.replace(TOKEN_RE, (_m, payload: string) => {
    const { url, alt, title } = decodeToken(payload);
    return title ? `![${alt}](${url} "${title}")` : `![${alt}](${url})`;
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tableImage.test.ts`
Expected: PASS (모든 테스트).

- [ ] **Step 5: 커밋**

```bash
git add src/markdown/tableImage.ts src/markdown/__tests__/tableImage.test.ts
git commit -m "feat: 테이블 셀 이미지 마스킹/언마스킹 추가"
```

---

## Task 3: 셀 인라인 변환 (토큰텍스트 ↔ inlineImage)

**Files:**
- Modify: `src/markdown/tableImage.ts`
- Test: `src/markdown/__tests__/tableImage.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (append)**

```ts
import { tokenTextToInline, inlineToTokenText } from '../tableImage';

describe('tokenTextToInline / inlineToTokenText', () => {
  it('셀 텍스트의 토큰을 inlineImage 로 분리', () => {
    const token = encodeToken({ url: 'u.png', alt: 'a', title: '' });
    const nodes = [{ type: 'text', text: `before ${token} after`, styles: {} }];
    const out = tokenTextToInline(nodes as any);
    expect(out).toEqual([
      { type: 'text', text: 'before ', styles: {} },
      { type: 'inlineImage', props: { url: 'u.png', alt: 'a', title: '' } },
      { type: 'text', text: ' after', styles: {} },
    ]);
  });

  it('토큰 없는 노드는 그대로 통과', () => {
    const nodes = [{ type: 'text', text: '평범한 셀', styles: {} }];
    expect(tokenTextToInline(nodes as any)).toEqual(nodes);
  });

  it('inlineImage 를 토큰 텍스트로 되돌리고 인접 텍스트와 병합', () => {
    const nodes = [
      { type: 'text', text: 'before ', styles: {} },
      { type: 'inlineImage', props: { url: 'u.png', alt: 'a', title: '' } },
      { type: 'text', text: ' after', styles: {} },
    ];
    const out = inlineToTokenText(nodes as any);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('text');
    // 병합된 텍스트는 언마스킹 시 원본 이미지로 복원 가능
    expect(unmaskTableImages(out[0].text)).toBe('before ![a](u.png) after');
  });

  it('split → join 대칭(왕복)', () => {
    const token = encodeToken({ url: 'u.png', alt: 'a', title: '' });
    const original = [{ type: 'text', text: `x ${token} y`, styles: {} }];
    const back = inlineToTokenText(tokenTextToInline(original as any));
    expect(back).toEqual(original);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tableImage.test.ts`
Expected: FAIL — `tokenTextToInline`/`inlineToTokenText` is not defined.

- [ ] **Step 3: 최소 구현 (`tableImage.ts` 에 추가)**

```ts
type InlineNode =
  | { type: 'text'; text: string; styles: Record<string, any> }
  | { type: 'inlineImage'; props: { url: string; alt: string; title: string } }
  | { type: string; [k: string]: any };

// splitInlineMath 대칭: 텍스트 노드의 토큰을 text | inlineImage | text 로 분리.
export function tokenTextToInline(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if ((n as any).type !== 'text' || typeof (n as any).text !== 'string') { out.push(n); continue; }
    const text = (n as any).text as string;
    const styles = (n as any).styles;
    TOKEN_RE.lastIndex = 0;
    if (!TOKEN_RE.test(text)) { out.push(n); continue; }
    TOKEN_RE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index), styles });
      const { url, alt, title } = decodeToken(m[1]);
      out.push({ type: 'inlineImage', props: { url, alt, title } });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last), styles });
  }
  return out;
}

// joinInlineMath 대칭: inlineImage 를 토큰 텍스트로 직렬화하고 인접 텍스트와 병합.
export function inlineToTokenText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    let serialized: InlineNode;
    if ((n as any).type === 'inlineImage') {
      const p = (n as any).props ?? {};
      serialized = { type: 'text', text: encodeToken({ url: p.url ?? '', alt: p.alt ?? '', title: p.title ?? '' }), styles: {} };
    } else if ((n as any).type === 'text') {
      serialized = { type: 'text', text: (n as any).text, styles: (n as any).styles };
    } else {
      out.push(n);
      continue;
    }
    const prev = out[out.length - 1] as any;
    if (prev && prev.type === 'text' && (serialized as any).type === 'text' &&
        JSON.stringify(prev.styles) === JSON.stringify((serialized as any).styles)) {
      out[out.length - 1] = { type: 'text', text: prev.text + (serialized as any).text, styles: prev.styles };
    } else {
      out.push(serialized);
    }
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tableImage.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/markdown/tableImage.ts src/markdown/__tests__/tableImage.test.ts
git commit -m "feat: 셀 인라인 토큰텍스트↔inlineImage 변환 추가"
```

---

## Task 4: inlineImage 인라인 콘텐츠 스펙 + 스키마 등록

**Files:**
- Create: `src/inline/InlineImage.tsx`
- Modify: `src/editor/schema.ts`

- [ ] **Step 1: InlineImage 스펙 작성**

`src/inline/InlineImage.tsx`:

```tsx
import React from 'react';
import { createReactInlineContentSpec } from '@blocknote/react';

// 테이블 셀 안 이미지 표시 전용 인라인 콘텐츠. 셀은 inline* 만 허용하므로 블록 image
// 대신 이 인라인 콘텐츠로 렌더한다. 편집 UI 없음(표시 전용).
export const InlineImage = createReactInlineContentSpec(
  {
    type: 'inlineImage',
    propSchema: {
      url: { default: '' },
      alt: { default: '' },
      title: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const { url, alt, title } = inlineContent.props as { url: string; alt: string; title: string };
      return (
        <img
          src={url}
          alt={alt}
          title={title || undefined}
          style={{ maxWidth: '100%', verticalAlign: 'middle' }}
        />
      );
    },
  }
);
```

- [ ] **Step 2: 스키마에 등록**

`src/editor/schema.ts` 수정 — 상단 import 블록에 추가:

```ts
import { KatexInline } from '../inline/KatexInline';
import { InlineImage } from '../inline/InlineImage';
```

그리고 `inlineContentSpecs` 를 다음으로 변경:

```ts
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline, inlineImage: InlineImage },
```

- [ ] **Step 3: 타입체크로 검증**

Run: `npm run build 2>&1 | head -30` (또는 `npx tsc --noEmit` 이 없으면 build)
Expected: 컴파일 성공(에러 없음). 빌드가 dist 를 갱신하는 것은 정상.

- [ ] **Step 4: 커밋**

```bash
git add src/inline/InlineImage.tsx src/editor/schema.ts
git commit -m "feat: inlineImage 인라인 콘텐츠 스펙 추가 및 스키마 등록"
```

---

## Task 5: customParse 의 tableContent 분기

**Files:**
- Modify: `src/markdown/customParse.ts`
- Test: `src/markdown/__tests__/roundtrip.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (`roundtrip.test.ts` 하단에 append)**

```ts
import { encodeToken } from '../tableImage';

describe('postParse/preSerialize: 테이블 셀 이미지', () => {
  const tableBlock = (cellContent: any[]) => ({
    type: 'table',
    content: {
      type: 'tableContent',
      columnWidths: [undefined],
      rows: [{ cells: [{ type: 'tableCell', content: cellContent, props: {} }] }],
    },
  });

  it('postParse 가 셀의 토큰 텍스트를 inlineImage 로 복원', () => {
    const token = encodeToken({ url: 'u.png', alt: 'a', title: '' });
    const input = [tableBlock([{ type: 'text', text: token, styles: {} }])];
    const out: any = postParse(input as any)[0];
    expect(out.content.rows[0].cells[0].content).toEqual([
      { type: 'inlineImage', props: { url: 'u.png', alt: 'a', title: '' } },
    ]);
  });

  it('preSerialize 가 셀의 inlineImage 를 토큰 텍스트로 되돌림', () => {
    const input = [tableBlock([{ type: 'inlineImage', props: { url: 'u.png', alt: 'a', title: '' } }])];
    const out: any = preSerialize(input as any)[0];
    const cell = out.content.rows[0].cells[0].content;
    expect(cell).toHaveLength(1);
    expect(cell[0].type).toBe('text');
    expect(cell[0].text).toBe(encodeToken({ url: 'u.png', alt: 'a', title: '' }));
  });

  it('문자열 셀(shorthand)은 그대로 통과', () => {
    const input = [{ type: 'table', content: { type: 'tableContent', rows: [{ cells: ['plain'] }] } }];
    expect(postParse(input as any)).toEqual(input);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- roundtrip.test.ts`
Expected: FAIL — 현재 postParse/preSerialize 는 tableContent 를 처리하지 않아 토큰 텍스트가 그대로 남는다.

- [ ] **Step 3: 최소 구현 (`customParse.ts` 수정)**

파일 상단 import 에 추가(1행, `codeBlockOptions` import 아래):

```ts
import { tokenTextToInline, inlineToTokenText } from './tableImage';
```

`INLINE_MATH_BLOCK_TYPES` 상수 아래에 헬퍼 추가:

```ts
// 테이블 블록은 content 가 배열이 아니라 { type:'tableContent', rows:[{cells:[{type:'tableCell', content:[...]}]}] }
// 객체라 기존 재귀가 도달하지 못한다. 각 셀의 인라인 배열에 fn 을 적용한 새 블록을 만든다.
function mapTableCells(b: AnyBlock, fn: (nodes: any[]) => any[]): AnyBlock {
  const content: any = b.content;
  const rows = (content.rows ?? []).map((row: any) => ({
    ...row,
    cells: (row.cells ?? []).map((cell: any) =>
      cell && typeof cell === 'object' && Array.isArray(cell.content)
        ? { ...cell, content: fn(cell.content) }
        : cell),
  }));
  return { ...b, content: { ...content, rows } };
}
```

`postParse` 의 `blocks.map(b => {` 콜백 맨 앞(첫 `if` 위)에 추가:

```ts
    if ((b.content as any)?.type === 'tableContent') {
      return mapTableCells(b, tokenTextToInline);
    }
```

`preSerialize` 의 `blocks.map(b => {` 콜백 맨 앞(첫 `if` 위)에 추가:

```ts
    if ((b.content as any)?.type === 'tableContent') {
      return mapTableCells(b, inlineToTokenText);
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- roundtrip.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/markdown/customParse.ts src/markdown/__tests__/roundtrip.test.ts
git commit -m "feat: customParse 에 테이블 셀 이미지 tableContent 분기 추가"
```

---

## Task 6: Editor.tsx 배선 (mask/unmask)

**Files:**
- Modify: `src/editor/Editor.tsx`

- [ ] **Step 1: import 추가**

`src/editor/Editor.tsx` 상단 import 블록(`customParse` import 아래)에 추가:

```ts
import { maskTableImages, unmaskTableImages } from '../markdown/tableImage';
```

- [ ] **Step 2: 초기 로드 배선 (line ~64)**

기존:

```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, body);
```

으로 되어 있는 **초기 로드** 부분을 다음으로 변경:

```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, maskTableImages(body));
```

- [ ] **Step 3: 리로드 배선 (line ~177)**

리로드 핸들러 내부의 동일한 문장(두 번째 `parseMarkdownWithBlockquotes` 호출):

```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, body);
```

을 다음으로 변경:

```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, maskTableImages(body));
```

- [ ] **Step 4: 저장 배선 (line ~93)**

기존:

```ts
        const body = await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any);
```

을 다음으로 변경(직렬화 결과를 언마스킹 — `bridge.saveFile` 내부의 `restoreImagePaths` 보다 먼저 실행됨):

```ts
        const body = unmaskTableImages(
          await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any),
        );
```

- [ ] **Step 5: 타입체크/빌드 검증**

Run: `npm run build 2>&1 | tail -20`
Expected: 컴파일 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/editor/Editor.tsx
git commit -m "feat: Editor 로드/저장에 테이블 셀 이미지 mask/unmask 배선"
```

---

## Task 7: 전체 라운드트립 통합 테스트

실제 BlockNote 에디터로 마크다운 테이블(이미지 포함)을 파싱→복원→직렬화까지 검증한다.

**Files:**
- Create: `src/markdown/__tests__/tableImage-roundtrip.test.ts`

- [ ] **Step 1: 통합 테스트 작성**

`src/markdown/__tests__/tableImage-roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../blockquote';
import { postParse, preSerialize } from '../customParse';
import { maskTableImages, unmaskTableImages } from '../tableImage';

// Editor.tsx 의 로드/저장 파이프라인을 그대로 재현한다.
async function load(editor: any, md: string) {
  const blocks = await parseMarkdownWithBlockquotes(editor, maskTableImages(md));
  return postParse(blocks as any);
}
async function save(editor: any): Promise<string> {
  return unmaskTableImages(
    await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any),
  );
}

describe('테이블 셀 이미지 전체 라운드트립', () => {
  it('로드하면 셀에 inlineImage 가 생기고, 저장하면 마크다운 이미지로 복원된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = [
      '| Annotation editor | Live page |',
      '| --- | --- |',
      '| ![shot](docs/a.png) | ![badge](docs/b.png) |',
    ].join('\n');

    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);

    // 셀 안에 inlineImage 가 존재하는지 확인
    const flat = JSON.stringify(editor.document);
    expect(flat).toContain('inlineImage');
    expect(flat).toContain('docs/a.png');
    expect(flat).toContain('docs/b.png');

    // 저장 시 마크다운 이미지 문법 복원(이미지 유실 없음)
    const out = await save(editor);
    expect(out).toContain('![shot](docs/a.png)');
    expect(out).toContain('![badge](docs/b.png)');
    expect(out).not.toContain('MKRAIMG');
  });

  it('테이블 밖 블록 이미지는 영향받지 않는다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = '![plain](docs/c.png)\n\n| H |\n| --- |\n| ![cell](docs/d.png) |';
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('![plain](docs/c.png)');
    expect(out).toContain('![cell](docs/d.png)');
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npm test -- tableImage-roundtrip.test.ts`
Expected: PASS (2 tests). 만약 셀 이미지가 여전히 드롭되면 `inlineImage` assertion 에서 실패 — mask 단계나 스키마 등록을 재점검.

- [ ] **Step 3: 전체 테스트 스위트 실행(회귀 확인)**

Run: `npm test`
Expected: 기존 테스트 포함 전부 PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/markdown/__tests__/tableImage-roundtrip.test.ts
git commit -m "test: 테이블 셀 이미지 전체 라운드트립 통합 테스트 추가"
```

---

## Task 8: 수동 검증 (실제 IDE)

자동 테스트는 파이프라인을 검증하지만, JCEF 안 실제 렌더는 눈으로 확인해야 한다.

- [ ] **Step 1: 샌드박스 IDE 실행**

Run (from `markora/`): `./gradlew runIde`
Expected: 샌드박스 IDE 가 뜨고 플러그인이 로드됨(프론트엔드가 빌드되어 dist 에 번들됨).

- [ ] **Step 2: 테이블 이미지가 있는 .md 파일 열기**

`snapscreen/README.md`(문제 재현 파일)처럼 테이블 셀에 이미지가 있는 마크다운을 markora 탭으로 연다.
Expected: 셀 안 이미지가 렌더링된다(빈 셀이 아님).

- [ ] **Step 3: 라운드트립 확인**

markora 탭에서 아무 편집(예: 셀 밖 텍스트 한 글자 추가 후 삭제)으로 저장을 트리거하고, 터미널에서 파일을 확인:

Run (from repo of the .md): `git diff -- <file>.md`
Expected: 테이블 셀 이미지 마크다운(`![...](...)`)이 유실 없이 그대로 남아 있다. 상대경로가 절대 `localhost` URL 로 바뀌지 않았다.

- [ ] **Step 4: 완료 보고**

runIde 종료. 결과를 사용자에게 보고.

---

## Self-Review (작성자 기록)

- **스펙 커버리지:** 원인(스펙 배경) → Task 1-6 구현; 무손실 라운드트립 → Task 2·3·5·7; HTML `<img>` 셀 이미지는 기존 `imageMap` 이 `![](url)` 로 변환 후 `maskTableImages` 가 토큰화하므로 별도 코드 불필요(Task 7 의 일반 이미지 경로와 동일 메커니즘, 스펙 엣지케이스 절에 명시됨); 표시 전용 `<img>` → Task 4; 테스트 → Task 1-3·5·7; 수동 검증 → Task 8. 갭 없음.
- **플레이스홀더:** 모든 코드 스텝에 완전한 코드 포함. TODO/TBD 없음.
- **타입 일관성:** `TableImage`, `encodeToken`/`decodeToken`, `maskTableImages`/`unmaskTableImages`, `tokenTextToInline`/`inlineToTokenText`, `mapTableCells`, `inlineImage` props(`url`/`alt`/`title`) 이 Task 전반에서 동일 시그니처로 사용됨.
