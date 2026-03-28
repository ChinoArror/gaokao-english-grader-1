# 1. 数据结构定义 (TypeScript Interfaces)

我们的批改需要区分两种题型，它们有公共的基础字段，也有各自特有的分析模块。请在代码中统一定义以下数据结构：

## 1.1 公共基础结构 (Base Report)
typescript
interface BaseReport {
  overallComment: {
    score: number; // 总分
    completion: string; // 完成度评价
    vocabularyAndGrammar: string; // 词汇语法评价
  };
  handwriting: string; // 卷面点评（中等/良好等，可根据排版情况模拟）
  lineByLineCorrections: {
    originalSentence: string;
    correctedSentence: string; // 需带有特定的 Markdown 标记，如删除线 ~~错词~~ 和加粗 **改词**
  }[];
  errorAnalysis: {
    originalText: string;
    errorType: string; // 比如：用词不当、时态错误
    correction: string;
    explanation: string; // 错误原因分析
  }[];
  excellentExpressions: {
    expression: string;
    analysis: string; // 比如：【高级词汇】/【高级句型】及解析
  }[];
  polishedEssay: string; // 作文润色（全文重写）
}

1.2 应用文专属结构 (Practical Writing)
interface PracticalWritingReport extends BaseReport {
  type: "practical";
  overallComment: BaseReport['overallComment'] & {
    contentCoverage: string; // 内容要点覆盖情况
    mainBody: string; // 主体部分评价
  };
  contentCoverageTable: {
    point: string; // 内容要点
    covered: boolean; // 是否覆盖
    analysis: string; // 亮点与不足分析
  }[];
  personalizedImprovement: {
    optimizationSuggestions: {
      intro: string; // 开头段建议
      body: string; // 主体段建议
      conclusion: string; // 结尾段建议
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
    better: string; // 更好表达
  }[];
}

1.3 读后续写专属结构 (Continuation Writing)
interface ContinuationWritingReport extends BaseReport {
  type: "continuation";
  overallComment: BaseReport['overallComment'] & {
    plotContent: string; // 情节内容评价
  };
  plotAnalysis: {
    originalPlot: string; // 原文情节梳理
    inferredPlot: string; // 续写情节推理
    studentOutline: string; // 学生续写大纲梳理
    plotComment: string; // 情节逻辑点评
  };
  cohesionAndTransition: {
    paragraph1: string; // 第一段衔接分析
    paragraph2: string; // 第二段衔接分析
  };
  personalizedImprovement: {
    detailEnhancement: {
      action: { original: string; better: string; analysis: string }; // 动作描写
      psychology: { original: string; better: string; analysis: string }; // 心理描写
      language: { original: string; better: string; analysis: string }; // 语言描写
    };
  };
  sceneVocabulary: {
    sceneDescription: string;
    vocabularyList: string; // 相关场景词汇及中文释义
  }[];
}

2. 后端 LLM Prompt 修改要求
请在请求 LLM 的逻辑中，根据用户选择的“作文类型”（应用文 或 读后续写），注入不同的 System Prompt。

强制要求 LLM 必须且只能输出符合上述 TypeScript 接口的 JSON 格式数据，不要包含任何 Markdown 代码块包裹（或在后端做好 JSON 提取和解析容错）。

针对 lineByLineCorrections 字段，需在 prompt 中明确指示 LLM 使用特定的格式（例如将错词用双波浪线 ~~ 包裹，改正词用双星号 ** 包裹），以便前端渲染差异。
