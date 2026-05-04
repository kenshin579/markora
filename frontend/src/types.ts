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
  loadFile(): Promise<string>;
  saveFile(markdown: string): Promise<void>;
  uploadImage(file: File): Promise<UploadResult>;
  onThemeChange(cb: (t: Theme) => void): () => void;
}

declare global {
  interface Window {
    markora: {
      applyTheme: (t: Theme) => void;
    };
  }
}
