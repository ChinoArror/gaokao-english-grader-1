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

export interface InlineImagePart {
  mimeType: string;
  data: string;
}

export interface BaseReport {
  overallComment: {
    score: number;
    completion: string;
    vocabularyAndGrammar: string;
  };
  handwriting: string;
  lineByLineCorrections: {
    originalSentence: string;
    correctedSentence: string;
  }[];
  errorAnalysis: {
    originalText: string;
    errorType: string;
    correction: string;
    explanation: string;
  }[];
  excellentExpressions: {
    expression: string;
    analysis: string;
  }[];
  polishedEssay: string;
}

export interface PracticalWritingReport extends BaseReport {
  type: 'practical';
  overallComment: BaseReport['overallComment'] & {
    contentCoverage: string;
    mainBody: string;
  };
  contentCoverageTable: {
    point: string;
    covered: boolean;
    analysis: string;
  }[];
  personalizedImprovement: {
    optimizationSuggestions: {
      intro: string;
      body: string;
      conclusion: string;
    };
    topicExpansion: {
      topicName: string;
      vocabulary: string[];
      phrases: string[];
      sentences: { english: string; chinese: string }[];
    };
  };
  expressionElevation: {
    original: string;
    better: string;
  }[];
}

export interface ContinuationWritingReport extends BaseReport {
  type: 'continuation';
  overallComment: BaseReport['overallComment'] & {
    plotContent: string;
  };
  plotAnalysis: {
    originalPlot: string;
    inferredPlot: string;
    studentOutline: string;
    plotComment: string;
  };
  cohesionAndTransition: {
    paragraph1: string;
    paragraph2: string;
  };
  personalizedImprovement: {
    detailEnhancement: {
      action: { original: string; better: string; analysis: string };
      psychology: { original: string; better: string; analysis: string };
      language: { original: string; better: string; analysis: string };
    };
  };
  sceneVocabulary: {
    sceneDescription: string;
    vocabularyList: string;
  }[];
}

export type StructuredReport = PracticalWritingReport | ContinuationWritingReport;

export interface GradeEssayRequest {
  type: EssayType;
  method: InputMethod;
  questionText?: string;
  essayContent?: string;
  questionImages?: InlineImagePart[];
  essayImages?: InlineImagePart[];
}

export type TaskStatus = 'queued' | 'processing' | 'successful' | 'failed';

export interface GradingTaskPayload {
  task_uuid: string;
  type: EssayType;
  method: InputMethod;
  questionText?: string;
  essayContent?: string;
  questionImages?: InlineImagePart[];
  essayImages?: InlineImagePart[];
  questionImageFiles?: File[];
  essayImageFiles?: File[];
  payloadR2Key?: string;
}

export interface GradingTaskSummary {
  task_uuid: string;
  status: TaskStatus;
  essayType: EssayType;
  summaryTitle: string;
  timestamp: number;
  updatedAt?: number;
  errorMessage?: string;
}

export interface GradingTaskResultEnvelope {
  task_uuid: string;
  status: TaskStatus;
  essayType: EssayType;
  inputMethod: InputMethod;
  summaryTitle: string;
  createdAt: number;
  updatedAt: number;
  topic?: string;
  originalContent?: string;
  transcription?: string;
  report?: StructuredReport;
  errorMessage?: string;
}

export interface GradeEssayResponse {
  task_uuid?: string;
  status?: TaskStatus;
  report?: StructuredReport;
  feedback?: string;
  markdown?: string;
  transcription?: string;
  truncated?: boolean;
  summaryTitle?: string;
  createdAt?: number;
  updatedAt?: number;
  inputMethod?: InputMethod;
  essayType?: EssayType;
  errorMessage?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  token?: string;
  username?: string;
  role?: 'admin' | 'user';
  userId?: number;
}

export interface User {
  uuid: string;
  username: string;
  name: string;
  last_seen: string;
}

export interface UsageStat {
  date: string;
  user_id: number;
  username: string;
  success_count: number;
  error_count: number;
  total_tokens: number;
}

export interface HistoryRecord {
  id: number;
  user_id: number;
  timestamp: number;
  topic: string;
  original_content: string;
  feedback: string;
  task_uuid?: string;
  status?: TaskStatus;
  essay_type?: EssayType;
  summary_title?: string;
  updated_at?: number;
  error_message?: string;
}
