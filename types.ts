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
}