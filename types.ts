
export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface ImageHistoryItem {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  timestamp: number;
}

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
}

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export type Language = 'am' | 'en';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
