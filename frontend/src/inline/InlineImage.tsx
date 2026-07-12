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
