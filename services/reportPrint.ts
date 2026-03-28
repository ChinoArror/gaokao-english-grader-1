import { marked } from 'marked';
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
    ${report.lineByLineCorrections.map((item, index) => `
      <div class="item-block">
        <div class="item-index">${index + 1}</div>
        ${block('【学生原文】', item.originalSentence)}
        <p><span class="label">【内容提升】</span><span>${renderDiffMarkupHtml(item.correctedSentence)}</span></p>
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
      <div class="label">【4. 话题句式】</div>
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
    ${block('【点评】', report.plotAnalysis.plotComment)}
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

export const buildPrintableReportHtml = (params: {
  report: StructuredReport;
  topic?: string;
  originalContent?: string;
  dateText?: string;
}) => {
  const { report, topic, originalContent, dateText } = params;
  const typeTitle = report.type === 'practical' ? '应用文批改报告' : '读后续写批改报告';
  const body = report.type === 'practical' ? practicalHtml(report) : continuationHtml(report);

  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(topic || typeTitle)}</title>
    <style>
      body { font-family: "Noto Serif SC", "Songti SC", "SimSun", serif; margin: 0; color: #111827; background: white; }
      .page { max-width: 980px; margin: 0 auto; padding: 28px 42px 90px; }
      .top-meta { display: flex; justify-content: flex-end; font-size: 14px; color: #111827; margin-bottom: 8px; }
      .title { text-align: center; font-size: 30px; font-weight: 800; margin: 18px 0 26px; }
      .section-header { display: flex; align-items: center; gap: 10px; margin: 28px 0 14px; font-size: 18px; font-weight: 700; }
      .section-header .line { flex: 1; border-top: 1px dashed #334155; }
      .paper-card { font-size: 16px; line-height: 1.8; }
      .paper-card p { margin: 6px 0; }
      .label { font-weight: 700; margin-right: 6px; }
      .pill-label, .pill-value { display: inline-flex; align-items: center; justify-content: center; min-width: 120px; height: 38px; border-radius: 999px; font-weight: 700; }
      .handwriting-row { display: flex; align-items: center; gap: 16px; margin-top: 18px; margin-bottom: 12px; }
      .pill-label { background: #1f2937; color: #fff; }
      .pill-value { background: #fbe7d8; color: #111827; }
      .item-block { margin: 14px 0; break-inside: avoid; }
      .item-index { font-weight: 700; margin-bottom: 4px; }
      .report-table { width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 8px; }
      .report-table th, .report-table td { border: 1px solid #334155; padding: 10px 12px; vertical-align: top; }
      .report-table th { background: #f8fafc; font-weight: 800; }
      .diff-delete { color: #b91c1c; text-decoration: line-through; text-decoration-thickness: 2px; }
      .diff-add { color: #047857; font-weight: 800; }
      .polished { text-align: center; }
      .polished-title { font-size: 22px; font-weight: 800; margin-bottom: 16px; }
      .essay { white-space: pre-wrap; text-align: left; line-height: 1.85; }
      .footer { position: fixed; left: 42px; right: 42px; bottom: 22px; display: flex; justify-content: space-between; font-size: 12px; color: #111827; }
      @media print {
        .page { padding-bottom: 70px; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="top-meta">${escapeHtml(typeTitle)}</div>
      <div class="title">${escapeHtml(topic || typeTitle)}</div>
      ${overallCommentHtml(report)}
      ${lineByLineHtml(report)}
      ${errorAnalysisHtml(report)}
      ${body}
      ${report.type === 'practical' ? `
        ${sectionHeader('出彩表达')}
        <div class="paper-card">
          ${report.excellentExpressions.map((item, index) => `<div class="item-block"><p>${index + 1}. ${escapeHtml(item.expression)}</p><p>${escapeHtml(item.analysis)}</p></div>`).join('')}
        </div>
      ` : ''}
      ${sectionHeader('作文润色')}
      <div class="paper-card polished">
        <div class="polished-title">${escapeHtml(topic || 'Polished Essay')}</div>
        <div class="essay">${escapeHtml(report.polishedEssay)}</div>
      </div>
      ${originalContent ? `${sectionHeader('原文识别结果')}<div class="paper-card"><div class="essay">${escapeHtml(originalContent)}</div></div>` : ''}
    </div>
    <div class="footer">
      <span>作文批改报告</span>
      <span>${escapeHtml(dateText || new Date().toLocaleDateString('zh-CN'))}</span>
    </div>
  </body>
  </html>
  `;
};

export const openPrintableReport = (params: {
  report: StructuredReport;
  topic?: string;
  originalContent?: string;
  dateText?: string;
}) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(buildPrintableReportHtml(params));
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};

export const buildPrintableMarkdownHtml = (params: {
  markdown: string;
  title?: string;
  dateText?: string;
}) => {
  const { markdown, title, dateText } = params;
  const renderedMarkdown = String(marked.parse(markdown));

  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || 'Markdown Report')}</title>
    <style>
      body { font-family: "Noto Serif SC", "Songti SC", "SimSun", serif; margin: 0; color: #111827; background: white; }
      .page { max-width: 980px; margin: 0 auto; padding: 28px 42px 90px; }
      .top-meta { display: flex; justify-content: flex-end; font-size: 14px; color: #111827; margin-bottom: 8px; }
      .title { text-align: center; font-size: 30px; font-weight: 800; margin: 18px 0 26px; }
      .content { font-size: 16px; line-height: 1.85; }
      .content h1, .content h2, .content h3 { margin-top: 1.4em; margin-bottom: 0.6em; color: #0f172a; }
      .content p, .content li { margin: 0.45em 0; }
      .content ul, .content ol { padding-left: 1.6em; }
      .content table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 15px; }
      .content th, .content td { border: 1px solid #334155; padding: 10px 12px; vertical-align: top; }
      .content th { background: #f8fafc; font-weight: 800; }
      .content del { color: #b91c1c; text-decoration-thickness: 2px; }
      .content strong { color: #047857; font-weight: 800; }
      .footer { position: fixed; left: 42px; right: 42px; bottom: 22px; display: flex; justify-content: space-between; font-size: 12px; color: #111827; }
      @media print {
        .page { padding-bottom: 70px; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="top-meta">Markdown Report</div>
      <div class="title">${escapeHtml(title || 'Markdown Report')}</div>
      <div class="content">${renderedMarkdown}</div>
    </div>
    <div class="footer">
      <span>作文批改报告</span>
      <span>${escapeHtml(dateText || new Date().toLocaleDateString('zh-CN'))}</span>
    </div>
  </body>
  </html>
  `;
};

export const openPrintableMarkdown = (params: {
  markdown: string;
  title?: string;
  dateText?: string;
}) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(buildPrintableMarkdownHtml(params));
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};
