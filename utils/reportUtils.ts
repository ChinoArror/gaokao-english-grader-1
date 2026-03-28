import {
  ContinuationWritingReport,
  EssayType,
  GradingTaskResultEnvelope,
  InputMethod,
  PracticalWritingReport,
  StructuredReport,
  TaskStatus,
} from '../types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasBaseReportShape = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) return false;

  return (
    isObject(value.overallComment) &&
    typeof value.handwriting === 'string' &&
    Array.isArray(value.lineByLineCorrections) &&
    Array.isArray(value.errorAnalysis) &&
    Array.isArray(value.excellentExpressions) &&
    typeof value.polishedEssay === 'string'
  );
};

export const isStructuredReport = (value: unknown): value is StructuredReport => {
  if (!hasBaseReportShape(value) || typeof value.type !== 'string') return false;

  if (value.type === 'practical') {
    return Array.isArray((value as PracticalWritingReport).contentCoverageTable) &&
      isObject((value as PracticalWritingReport).personalizedImprovement) &&
      Array.isArray((value as PracticalWritingReport).expressionElevation);
  }

  if (value.type === 'continuation') {
    return isObject((value as ContinuationWritingReport).plotAnalysis) &&
      isObject((value as ContinuationWritingReport).cohesionAndTransition) &&
      isObject((value as ContinuationWritingReport).personalizedImprovement) &&
      Array.isArray((value as ContinuationWritingReport).sceneVocabulary);
  }

  return false;
};

export const extractJsonObject = (rawText: string): string | null => {
  const trimmed = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  return trimmed.slice(firstBrace, lastBrace + 1);
};

export const parseStructuredReport = (rawText: string): StructuredReport | null => {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return isStructuredReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const formatList = (items: string[]) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- 暂无';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const renderDiffMarkupHtml = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/~~(.*?)~~/g, '<span class="diff-delete">$1</span>')
    .replace(/\*\*(.*?)\*\*/g, '<span class="diff-add">$1</span>')
    .replace(/\n/g, '<br />');
};

export const reportToMarkdown = (report: StructuredReport, options?: {
  topic?: string;
  originalContent?: string;
  date?: string;
}) => {
  const header: string[] = ['# 作文批改报告'];

  if (options?.topic) header.push(`**题目**：${options.topic}`);
  if (options?.date) header.push(`**日期**：${options.date}`);

  const sections: string[] = [
    header.join('\n\n'),
    '## 评语',
    `- **总分**：${report.overallComment.score}`,
    `- **完成度**：${report.overallComment.completion}`,
    `- **词汇语法**：${report.overallComment.vocabularyAndGrammar}`,
  ];

  if (report.type === 'practical') {
    sections.push(`- **内容要点覆盖情况**：${report.overallComment.contentCoverage}`);
    sections.push(`- **主体评价**：${report.overallComment.mainBody}`);
  } else {
    sections.push(`- **情节内容**：${report.overallComment.plotContent}`);
  }

  sections.push(
    '',
    '## 卷面点评',
    report.handwriting,
    '',
    '## 逐句批改',
    report.lineByLineCorrections.length > 0
      ? report.lineByLineCorrections.map((item, index) =>
        `${index + 1}. **学生原句**：${item.originalSentence}\n   **修改建议**：${item.correctedSentence}`
      ).join('\n')
      : '暂无逐句批改',
    '',
    '## 错误分析详情',
    report.errorAnalysis.length > 0
      ? report.errorAnalysis.map((item, index) =>
        `${index + 1}. **原文**：${item.originalText}\n   **错误类型**：${item.errorType}\n   **修改建议**：${item.correction}\n   **原因分析**：${item.explanation}`
      ).join('\n')
      : '暂无错误分析',
  );

  if (report.type === 'practical') {
    sections.push(
      '',
      '## 内容要点覆盖',
      '| 内容要点 | 覆盖情况 | 分析 |',
      '| --- | --- | --- |',
      ...report.contentCoverageTable.map((item) =>
        `| ${item.point} | ${item.covered ? '已覆盖' : '未覆盖'} | ${item.analysis} |`
      ),
      '',
      '## 个性化提升',
      '### 优化建议',
      `- **开头段**：${report.personalizedImprovement.optimizationSuggestions.intro}`,
      `- **主体段**：${report.personalizedImprovement.optimizationSuggestions.body}`,
      `- **结尾段**：${report.personalizedImprovement.optimizationSuggestions.conclusion}`,
      '',
      `### 话题拓展：${report.personalizedImprovement.topicExpansion.topicName}`,
      '#### 话题词汇',
      formatList(report.personalizedImprovement.topicExpansion.vocabulary),
      '',
      '#### 话题词块',
      formatList(report.personalizedImprovement.topicExpansion.phrases),
      '',
      '#### 话题句式',
      report.personalizedImprovement.topicExpansion.sentences.length > 0
        ? report.personalizedImprovement.topicExpansion.sentences.map((item, index) =>
          `${index + 1}. **英文**：${item.english}\n   **中文**：${item.chinese}`
        ).join('\n')
        : '- 暂无',
      '',
      '## 表达提升',
      report.expressionElevation.length > 0
        ? report.expressionElevation.map((item, index) =>
          `${index + 1}. **原句**：${item.original}\n   **更好表达**：${item.better}`
        ).join('\n')
        : '暂无表达提升'
    );
  } else {
    sections.push(
      '',
      '## 情节分析',
      `- **原文情节梳理**：${report.plotAnalysis.originalPlot}`,
      `- **续写情节推理**：${report.plotAnalysis.inferredPlot}`,
      `- **学生续写大纲**：${report.plotAnalysis.studentOutline}`,
      `- **情节点评**：${report.plotAnalysis.plotComment}`,
      '',
      '## 衔接与过渡',
      `- **第一段分析**：${report.cohesionAndTransition.paragraph1}`,
      `- **第二段分析**：${report.cohesionAndTransition.paragraph2}`,
      '',
      '## 个性化提升',
      '### 细节描写提升',
      `- **动作描写**：${report.personalizedImprovement.detailEnhancement.action.original}\n  - 更优表达：${report.personalizedImprovement.detailEnhancement.action.better}\n  - 分析：${report.personalizedImprovement.detailEnhancement.action.analysis}`,
      `- **心理描写**：${report.personalizedImprovement.detailEnhancement.psychology.original}\n  - 更优表达：${report.personalizedImprovement.detailEnhancement.psychology.better}\n  - 分析：${report.personalizedImprovement.detailEnhancement.psychology.analysis}`,
      `- **语言描写**：${report.personalizedImprovement.detailEnhancement.language.original}\n  - 更优表达：${report.personalizedImprovement.detailEnhancement.language.better}\n  - 分析：${report.personalizedImprovement.detailEnhancement.language.analysis}`,
      '',
      '## 场景词汇',
      '| 场景 | 词汇 |',
      '| --- | --- |',
      ...report.sceneVocabulary.map((item) =>
        `| ${item.sceneDescription} | ${item.vocabularyList} |`
      ),
    );
  }

  sections.push(
    '',
    '## 出彩表达',
    report.excellentExpressions.length > 0
      ? report.excellentExpressions.map((item, index) =>
        `${index + 1}. **表达**：${item.expression}\n   **解析**：${item.analysis}`
      ).join('\n')
      : '暂无出彩表达',
    '',
    '## 作文润色',
    report.polishedEssay
  );

  if (options?.originalContent) {
    sections.push('', '## 原文识别结果', options.originalContent);
  }

  return sections.join('\n');
};

export const reportToStoredFeedback = (report: StructuredReport) => JSON.stringify(report);

export const essayTypeToLabel = (essayType: EssayType | string | undefined) => {
  if (essayType === EssayType.CONTINUATION || essayType === 'continuation') return '续写';
  return '应用文';
};

export const statusToLabel = (status: TaskStatus | string | undefined) => {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'successful':
      return 'Successful';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
};

export const normalizeSummaryTitle = (value: string | undefined, taskUuid?: string, status?: TaskStatus | string) => {
  const trimmed = (value || '').trim();
  if (trimmed) return trimmed;

  const suffix = taskUuid ? taskUuid.slice(0, 8) : 'unknown';
  switch (status) {
    case 'failed':
      return `Failed Task ${suffix}`;
    case 'queued':
    case 'processing':
      return `Processing Task ${suffix}`;
    default:
      return `Grading Task ${suffix}`;
  }
};

export const buildTaskResultEnvelope = (params: {
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
  report?: StructuredReport | null;
  errorMessage?: string;
}): GradingTaskResultEnvelope => ({
  task_uuid: params.task_uuid,
  status: params.status,
  essayType: params.essayType,
  inputMethod: params.inputMethod,
  summaryTitle: params.summaryTitle,
  createdAt: params.createdAt,
  updatedAt: params.updatedAt,
  topic: params.topic,
  originalContent: params.originalContent,
  transcription: params.transcription,
  report: params.report || undefined,
  errorMessage: params.errorMessage,
});
