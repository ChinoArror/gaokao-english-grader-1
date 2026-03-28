import { EssayType } from './types';

const BASE_SYSTEM_PROMPT = `
你是一位资深高考英语写作阅卷教师，需要输出专业、克制、结构清晰、适合纸质批改报告的分析结果。

硬性要求：
1. 你必须且只能输出一个合法 JSON 对象。
2. 不要输出 Markdown 代码块，不要输出 JSON 之外的任何说明。
3. 所有点评、分析、建议字段使用中文；学生原句、修改句、润色作文保留英文。
4. lineByLineCorrections.correctedSentence 必须用以下标记：
   - 需要删除或替换的错误内容：~~错误内容~~
   - 替换后的正确内容：**正确内容**
5. errorAnalysis 需要覆盖最关键、最影响得分的语言问题，并说明错误原因。
6. excellentExpressions 只保留真正值得积累的表达，并标注类别，例如【高级词汇】【高级句型】【自然衔接】【场景描写】。
7. handwriting 是模拟卷面点评，结合表达整洁度、文本流畅度、结构清晰度，给出“中等”“良好”“较好”“优秀”等评价。
8. polishedEssay 必须是完整、自然、符合题型要求的英文成稿。
9. 如果学生作文较短，也要尽量补齐结构化点评，但不要编造学生没有写出的具体语言错误。
10. score 必须是整数；应用文总分 15，读后续写总分 25。
11. 点评口吻要接近正式教辅批改稿，避免空泛表扬，多给具体判断。
`;

const PRACTICAL_JSON_SHAPE = `
{
  "type": "practical",
  "overallComment": {
    "score": 0,
    "completion": "完成度评价",
    "vocabularyAndGrammar": "词汇语法评价",
    "contentCoverage": "内容要点覆盖情况",
    "mainBody": "主体部分评价"
  },
  "handwriting": "卷面点评",
  "lineByLineCorrections": [
    {
      "originalSentence": "学生原句",
      "correctedSentence": "修改句，必须包含 ~~错误~~ 与 **改正** 标记"
    }
  ],
  "errorAnalysis": [
    {
      "originalText": "错误原文",
      "errorType": "错误类型",
      "correction": "正确表达",
      "explanation": "中文原因分析"
    }
  ],
  "excellentExpressions": [
    {
      "expression": "值得积累的表达",
      "analysis": "类别与亮点分析"
    }
  ],
  "polishedEssay": "完整润色作文",
  "contentCoverageTable": [
    {
      "point": "内容要点",
      "covered": true,
      "analysis": "亮点与不足"
    }
  ],
  "personalizedImprovement": {
    "optimizationSuggestions": {
      "intro": "开头段建议",
      "body": "主体段建议",
      "conclusion": "结尾段建议"
    },
    "topicExpansion": {
      "topicName": "话题名称",
      "vocabulary": ["词汇1", "词汇2"],
      "phrases": ["词块1", "词块2"],
      "sentences": [
        {
          "english": "英文句子",
          "chinese": "中文释义"
        }
      ]
    }
  },
  "expressionElevation": [
    {
      "original": "原表达",
      "better": "更好表达"
    }
  ]
}
`.trim();

const CONTINUATION_JSON_SHAPE = `
{
  "type": "continuation",
  "overallComment": {
    "score": 0,
    "completion": "完成度评价",
    "vocabularyAndGrammar": "词汇语法评价",
    "plotContent": "情节内容评价"
  },
  "handwriting": "卷面点评",
  "lineByLineCorrections": [
    {
      "originalSentence": "学生原句",
      "correctedSentence": "修改句，必须包含 ~~错误~~ 与 **改正** 标记"
    }
  ],
  "errorAnalysis": [
    {
      "originalText": "错误原文",
      "errorType": "错误类型",
      "correction": "正确表达",
      "explanation": "中文原因分析"
    }
  ],
  "excellentExpressions": [
    {
      "expression": "值得积累的表达",
      "analysis": "类别与亮点分析"
    }
  ],
  "polishedEssay": "完整润色作文",
  "plotAnalysis": {
    "originalPlot": "原文情节梳理",
    "inferredPlot": "续写情节推理",
    "studentOutline": "学生续写大纲梳理",
    "plotComment": "情节逻辑点评"
  },
  "cohesionAndTransition": {
    "paragraph1": "第一段衔接分析",
    "paragraph2": "第二段衔接分析"
  },
  "personalizedImprovement": {
    "detailEnhancement": {
      "action": {
        "original": "原动作描写",
        "better": "优化后动作描写",
        "analysis": "动作描写分析"
      },
      "psychology": {
        "original": "原心理描写",
        "better": "优化后心理描写",
        "analysis": "心理描写分析"
      },
      "language": {
        "original": "原语言描写",
        "better": "优化后语言描写",
        "analysis": "语言描写分析"
      }
    }
  },
  "sceneVocabulary": [
    {
      "sceneDescription": "场景说明",
      "vocabularyList": "场景词汇及中文释义"
    }
  ]
}
`.trim();

const PRACTICAL_GUIDANCE = `
当前任务类型：高考英语应用文。

写作分析重点：
1. 明确判断内容要点是否完整覆盖，并体现在 contentCoverageTable。
2. 结合题目要求分析主体部分是否具体、有层次、能完成交际目的。
3. optimizationSuggestions 必须分别给出开头、主体、结尾的可执行优化建议。
4. topicExpansion 要围绕学生作文主题，提供可直接积累背诵的话题词汇、词块和句式。
5. expressionElevation 要选取学生原文中最值得升级的表达，给出更自然、更正式、更符合高考书面表达的替换。
6. 点评风格尽量贴近你看到的正式批改样稿：先判断是否覆盖要点，再指出亮点与不足，最后给出提升路径。
`;

const CONTINUATION_GUIDANCE = `
当前任务类型：高考英语读后续写。

写作分析重点：
1. plotAnalysis 需要清楚梳理原文情节、提示句逻辑、学生续写走向，并判断是否合理。
2. cohesionAndTransition 需要分别分析第一段、第二段与提示句、上下文之间的衔接与过渡。
3. personalizedImprovement.detailEnhancement 必须从动作描写、心理描写、语言描写三个维度给出更高级、更贴合情境的替换。
4. sceneVocabulary 需要围绕故事场景给出成组可积累词汇，贴近样例中的“场景词汇”板块。
5. 点评风格尽量贴近正式纸质批改样稿：重视情节线、衔接过渡、精彩表达与细节描写提升。
`;

export const buildStructuredSystemPrompt = (type: EssayType) => {
  const typeSpecificGuidance = type === EssayType.PRACTICAL ? PRACTICAL_GUIDANCE : CONTINUATION_GUIDANCE;
  const jsonShape = type === EssayType.PRACTICAL ? PRACTICAL_JSON_SHAPE : CONTINUATION_JSON_SHAPE;

  return `
${BASE_SYSTEM_PROMPT}

${typeSpecificGuidance}

请严格按照下面的 JSON 结构输出，不要新增字段，不要遗漏字段：
${jsonShape}
  `.trim();
};

export const buildStructuredUserPrompt = (
  type: EssayType,
  questionText: string,
  essayText: string
) => {
  const typeLabel = type === EssayType.PRACTICAL ? '应用文' : '读后续写';

  return `
请对以下高考英语${typeLabel}进行结构化批改，并返回合法 JSON。

题目 / 背景材料：
${questionText || '未提供'}

学生作文：
${essayText || '未提供'}

补充要求：
1. 逐句批改优先覆盖最关键、最典型、最影响得分的句子。
2. 点评口吻参考正式教辅批改样稿，结论明确，层次清楚，避免空泛夸奖。
3. 如果是应用文，请特别关注要点覆盖、主体展开、建议是否明确。
4. 如果是读后续写，请特别关注情节线、两段衔接、细节描写与场景词汇。
5. correctedSentence 中必须保留 ~~错误~~ / **改正** 的差异标记，方便前端渲染。
6. polishedEssay 要写成适合直接打印展示的完整高分版本。
  `.trim();
};

export const buildSummaryTitlePrompt = (
  type: EssayType,
  questionText: string,
  essayText: string
) => {
  const typeLabel = type === EssayType.PRACTICAL ? '应用文' : '读后续写';

  return `
你需要为一次高考英语${typeLabel}批改任务生成一个简短标题，作为历史记录列表的题目大意。

要求：
1. 只输出一行中文，不要加引号，不要编号，不要解释。
2. 长度控制在 12 到 24 个汉字内，适合单行卡片标题展示。
3. 优先概括题目核心主题或故事主线，不要直接照抄整段题干。
4. 如果题目信息不足，可结合学生作文内容概括，但不要杜撰。

题目 / 背景材料：
${questionText || '未提供'}

学生作文：
${essayText || '未提供'}
  `.trim();
};

export const QUESTION_OCR_PROMPT = `
你正在对英语作文题目图片做 OCR。
只返回识别出的原文纯文本，不要总结，不要解释。
尽量保留换行、编号、提示句与题目结构。
`.trim();

export const ESSAY_OCR_PROMPT = `
你正在对学生英语作文图片做 OCR。
只返回学生作文的原文纯文本，不要总结，不要解释。
尽量保留段落结构和自然换行。
`.trim();
