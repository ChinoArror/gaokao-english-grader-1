import { StructuredReport } from '../types';
import { renderDiffMarkupHtml } from '../utils/reportUtils';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const block = (label: string, value: string) =>
  `<p><span class="label">${escapeHtml(label)}</span>${escapeHtml(value).replace(/\n/g, '<br />')}</p>`;

const sectionHeader = (title: string) => `
  <div class="section-header">
    <span class="star">★</span>
    <span class="title">${escapeHtml(title)}</span>
    <span class="line"></span>
  </div>
`;

const overallCommentHtml = (report: StructuredReport) => {
  const extra = report.type === 'practical'
    ? `${block('【内容要点覆盖情况】', report.overallComment.contentCoverage)}${block('【主体部分】', report.overallComment.mainBody)}`
    : block('【情节内容】', report.overallComment.plotContent);

  return `
    ${sectionHeader('评语')}
    <div class="paper-card">
      ${block('【总分】', String(report.overallComment.score))}
      ${block('【完成度】', report.overallComment.completion)}
      ${extra}
      ${block('【词汇语法】', report.overallComment.vocabularyAndGrammar)}
    </div>
    <div class="handwriting-row">
      <span class="pill-label">卷面点评</span>
      <span class="pill-value">${escapeHtml(report.handwriting)}</span>
    </div>
  `;
};

const lineByLineHtml = (report: StructuredReport) => `
  ${sectionHeader('逐句批改')}
  <div class="paper-card">
    ${report.lineByLineCorrections.map((item) => `
      <div class="item-block">
        <p><span class="label">【学生原文】</span>${escapeHtml(item.originalSentence)}</p>
        <p><span class="label">【内容提升】</span>${renderDiffMarkupHtml(item.correctedSentence)}</p>
      </div>
    `).join('')}
  </div>
`;

const errorAnalysisHtml = (report: StructuredReport) => `
  ${sectionHeader('错误分析详情')}
  <div class="paper-card">
    ${report.errorAnalysis.map((item) => `
      <div class="item-block">
        ${block('【原文】', item.originalText)}
        ${block('【错误类型】', item.errorType)}
        ${block('【正确形式】', item.correction)}
        ${block('【原因分析】', item.explanation)}
      </div>
    `).join('')}
  </div>
`;

const practicalHtml = (report: Extract<StructuredReport, { type: 'practical' }>) => `
  ${sectionHeader('内容要点覆盖')}
  <table class="report-table">
    <thead>
      <tr><th>内容要点</th><th>覆盖情况</th><th>分析</th></tr>
    </thead>
    <tbody>
      ${report.contentCoverageTable.map((item) => `
        <tr>
          <td>${escapeHtml(item.point)}</td>
          <td>${item.covered ? '√' : '×'}</td>
          <td>${escapeHtml(item.analysis)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ${sectionHeader('个性化提升')}
  <div class="paper-card">
    <h3>一、优化建议</h3>
    ${block('1. 开头段', report.personalizedImprovement.optimizationSuggestions.intro)}
    ${block('2. 主体段', report.personalizedImprovement.optimizationSuggestions.body)}
    ${block('3. 结尾段', report.personalizedImprovement.optimizationSuggestions.conclusion)}
    <h3>二、话题相关素材拓展</h3>
    ${block('1. 话题名称', report.personalizedImprovement.topicExpansion.topicName)}
    ${block('2. 话题词汇', report.personalizedImprovement.topicExpansion.vocabulary.join('；'))}
    ${block('3. 话题词块', report.personalizedImprovement.topicExpansion.phrases.join('；'))}
    <div class="item-block">
      <p class="label">【话题句式】</p>
      ${report.personalizedImprovement.topicExpansion.sentences.map((item) => `
        <p>【英文】${escapeHtml(item.english)}</p>
        <p>【翻译】${escapeHtml(item.chinese)}</p>
      `).join('')}
    </div>
  </div>
  ${sectionHeader('表达提升')}
  <div class="paper-card">
    ${report.expressionElevation.map((item, index) => `
      <div class="item-block">
        <p><span class="label">原句 ${index + 1}：</span>${escapeHtml(item.original)}</p>
        <p><span class="label">更多表达：</span>${escapeHtml(item.better)}</p>
      </div>
    `).join('')}
  </div>
`;

const continuationHtml = (report: Extract<StructuredReport, { type: 'continuation' }>) => `
  ${sectionHeader('情节分析')}
  <div class="paper-card">
    ${block('【原文情节梳理】', report.plotAnalysis.originalPlot)}
    ${block('【续写情节推理】', report.plotAnalysis.inferredPlot)}
    ${block('【学生续写大纲】', report.plotAnalysis.studentOutline)}
    ${block('【情节点评】', report.plotAnalysis.plotComment)}
  </div>
  ${sectionHeader('衔接过渡')}
  <div class="paper-card">
    ${block('【第一段分析】', report.cohesionAndTransition.paragraph1)}
    ${block('【第二段分析】', report.cohesionAndTransition.paragraph2)}
  </div>
  ${sectionHeader('出彩表达')}
  <div class="paper-card">
    ${report.excellentExpressions.map((item, index) => `
      <div class="item-block">
        <p>${index + 1}. ${escapeHtml(item.expression)}</p>
        <p>${escapeHtml(item.analysis)}</p>
      </div>
    `).join('')}
  </div>
  ${sectionHeader('个性化提升')}
  <div class="paper-card">
    <h3>细节描写提升</h3>
    <div class="item-block">
      ${block('【动作描写-学生原文】', report.personalizedImprovement.detailEnhancement.action.original)}
      ${block('【动作描写-内容提升】', report.personalizedImprovement.detailEnhancement.action.better)}
      ${block('【动作描写-点拨】', report.personalizedImprovement.detailEnhancement.action.analysis)}
    </div>
    <div class="item-block">
      ${block('【心理描写-学生原文】', report.personalizedImprovement.detailEnhancement.psychology.original)}
      ${block('【心理描写-内容提升】', report.personalizedImprovement.detailEnhancement.psychology.better)}
      ${block('【心理描写-点拨】', report.personalizedImprovement.detailEnhancement.psychology.analysis)}
    </div>
    <div class="item-block">
      ${block('【语言描写-学生原文】', report.personalizedImprovement.detailEnhancement.language.original)}
      ${block('【语言描写-内容提升】', report.personalizedImprovement.detailEnhancement.language.better)}
      ${block('【语言描写-点拨】', report.personalizedImprovement.detailEnhancement.language.analysis)}
    </div>
  </div>
  ${sectionHeader('场景词汇')}
  <table class="report-table">
    <thead>
      <tr><th>场景</th><th>词汇及中文释义</th></tr>
    </thead>
    <tbody>
      ${report.sceneVocabulary.map((item) => `
        <tr>
          <td>${escapeHtml(item.sceneDescription)}</td>
          <td>${escapeHtml(item.vocabularyList)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
`;

export const buildPrintableReportHtmlV3 = (params: {
  report: StructuredReport;
  topic?: string;
  originalContent?: string;
  dateText?: string;
}) => {
  const { report, topic, originalContent, dateText } = params;
  const title = topic || (report.type === 'practical' ? '应用文批改报告' : '读后续写批改报告');
  const body = report.type === 'practical' ? practicalHtml(report) : continuationHtml(report);

  return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 11mm 14mm 12mm; }
      body { margin: 0; color: #111827; background: white; font-family: "Noto Serif SC", "Songti SC", "SimSun", serif; }
      .page { width: 100%; max-width: 182mm; margin: 0 auto; padding-bottom: 16mm; }
      .meta { display: flex; justify-content: flex-end; font-size: 11.5px; margin-bottom: 3mm; }
      .title-main { text-align: center; font-size: 21px; font-weight: 800; line-height: 1.14; margin: 2.5mm 0 4.5mm; }
      .section-header { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; margin: 4.2mm 0 1.6mm; }
      .section-header .line { flex: 1; border-top: 1px dashed #64748b; }
      .paper-card { font-size: 12.4px; line-height: 1.44; }
      .paper-card p { margin: 0.7mm 0; }
      .item-block { margin: 2mm 0; break-inside: avoid; }
      .label { font-weight: 700; margin-right: 4px; }
      .handwriting-row { display: flex; align-items: center; gap: 10px; margin: 2.3mm 0 1.4mm; }
      .pill-label, .pill-value { display: inline-flex; align-items: center; justify-content: center; min-width: 96px; height: 28px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
      .pill-label { background: #1f2937; color: white; }
      .pill-value { background: #fae6d8; color: #111827; }
      .report-table { width: 100%; border-collapse: collapse; margin: 1.4mm 0 2.6mm; font-size: 11.6px; }
      .report-table th, .report-table td { border: 1px solid #475569; padding: 6px 8px; vertical-align: top; line-height: 1.32; }
      .report-table th { background: #f8fafc; font-weight: 800; }
      .diff-delete { color: #b91c1c; text-decoration: line-through; text-decoration-thickness: 2px; }
      .diff-add { color: #047857; font-weight: 800; }
      h3 { margin: 2.2mm 0 1.1mm; font-size: 14px; }
      .essay-title { text-align: center; font-size: 17px; font-weight: 800; margin-bottom: 2.2mm; }
      .essay-content { white-space: pre-wrap; line-height: 1.5; font-size: 12.5px; text-align: left; }
      .footer { position: fixed; left: 14mm; right: 14mm; bottom: 6mm; display: flex; justify-content: space-between; font-size: 10.5px; color: #111827; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="title-main">${escapeHtml(title)}</div>
      ${overallCommentHtml(report)}
      ${lineByLineHtml(report)}
      ${errorAnalysisHtml(report)}
      ${body}
      ${sectionHeader('作文润色')}
      <div class="paper-card">
        <div class="essay-title">高分范文</div>
        <div class="essay-content">${escapeHtml(report.polishedEssay)}</div>
      </div>
      ${originalContent ? `${sectionHeader('原文识别结果')}<div class="paper-card"><div class="essay-content">${escapeHtml(originalContent)}</div></div>` : ''}
    </div>
  </body>
  </html>`;
};

export const openPrintableReportV3 = (params: {
  report: StructuredReport;
  topic?: string;
  originalContent?: string;
  dateText?: string;
}) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(buildPrintableReportHtmlV3(params));
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};
