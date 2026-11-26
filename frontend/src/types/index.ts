export * from './generated';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export type ThemeMode = 'light' | 'dark';
