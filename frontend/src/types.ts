export type Theme = 'light' | 'dark';

export interface BridgeContext {
  filePath: string;
  serverUrl: string;
  initialTheme: Theme;
}

export interface UploadResult {
  url: string;
}

export interface MarkoraBridge {
  getContext(): BridgeContext;
  // 디스크 파일을 읽어 본문(body)과 펜스 안쪽 inner YAML(frontmatter)을 분리해 반환한다.
  loadFile(): Promise<{ body: string; frontmatter: string }>;
  // 디스크 현재 본문을 부작용 없이 읽어온다 (저장 직전 외부 편집 충돌 검출용).
  peekFile(): Promise<string>;
  // body와 frontmatter(inner YAML)를 합쳐 파일에 저장한다. frontmatter가 비면 삭제된다.
  saveFile(body: string, frontmatter: string): Promise<void>;
  uploadImage(file: File): Promise<UploadResult>;
  onThemeChange(cb: (t: Theme) => void): () => void;
  // Kotlin이 외부 파일 변경(IDE 활성화/VFS 변경)을 감지해 reload를 요청할 때 호출되는 콜백 등록.
  onReloadRequest(cb: () => void): () => void;
}

declare global {
  interface Window {
    markora: {
      applyTheme: (t: Theme) => void;
      // Kotlin이 IDE 활성화/외부 변경 감지 시 호출하여 외부 디스크 변경 reload를 요청.
      reloadFromDisk: () => void;
    };
  }
}
