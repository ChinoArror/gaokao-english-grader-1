export enum EssayType {
  PRACTICAL = 'PRACTICAL', // 应用文
  CONTINUATION = 'CONTINUATION' // 读后续写
}

export enum InputMethod {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export interface EssaySubmission {
  type: EssayType;
  method: InputMethod;
  questionText: string;
  essayContent: string;
  questionImages: File[];
  essayImages: File[];
}

export interface GradingResult {
  score: string;
  feedback: string;
  analysis: string;
  sample: string;
  rawResponse: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  token?: string;
  username?: string;
  role?: 'admin' | 'user';
  userId?: number;
}

export interface User {
  id: number;
  username: string;
  password?: string;
  created_at: number;
}

export interface HistoryRecord {
  id: number;
  user_id: number;
  timestamp: number;
  topic: string;
  original_content: string;
  feedback: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  role?: 'admin' | 'user';
  username?: string;
  userId?: number;
  error?: string;
}