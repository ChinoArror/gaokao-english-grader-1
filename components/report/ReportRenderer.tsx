import React from 'react';
import { marked } from 'marked';
import { StructuredReport } from '../../types';

const sectionTitleClass = 'text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-3 mb-4';
const sectionRuleClass = 'h-px flex-1 border-t border-dashed border-slate-300';

const renderDiffNodes = (text: string) => {
  const parts = text.split(/(~~.*?~~|\*\*.*?\*\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <span key={index} className="text-rose-600 line-through decoration-2 decoration-rose-500 mx-0.5">
          {part.slice(2, -2)}
        </span>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="text-emerald-700 font-bold mx-0.5">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="text-slate-900 text-xl">★</span>
    <h2 className={sectionTitleClass}>{title}</h2>
    <span className={sectionRuleClass}></span>
  </div>
);

const InfoCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
    <div className="mt-2 text-sm leading-6 text-slate-700 whitespace-pre-wrap">{value}</div>
  </div>
);

const Table: React.FC<{ headers: string[]; rows: React.ReactNode[][] }> = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
    <table className="min-w-full border-collapse text-sm">
      <thead className="bg-slate-100">
        <tr>
          {headers.map((header) => (
            <th key={header} className="border-b border-slate-200 px-4 py-3 text-left font-bold text-slate-700">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="align-top odd:bg-white even:bg-slate-50/60">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border-t border-slate-200 px-4 py-3 text-slate-700 leading-6">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const LegacyMarkdownReport: React.FC<{ markdown: string }> = ({ markdown }) => (
  <div
    className="prose prose-slate prose-headings:text-slate-800 prose-strong:text-slate-900 max-w-none"
    dangerouslySetInnerHTML={{ __html: marked.parse(markdown) }}
  />
);

export const ReportRenderer: React.FC<{
  report: StructuredReport;
  topic?: string;
  truncated?: boolean;
}> = ({ report, topic, truncated }) => {
  return (
    <div className="space-y-6 md:space-y-8 text-[14px] sm:text-[15px] text-slate-700 leading-6 sm:leading-7">
      <section className="rounded-[24px] sm:rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50/70 p-4 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="text-xs sm:text-sm font-semibold tracking-[0.16em] text-slate-400">
              {report.type === 'practical' ? '应用文结构化批改' : '读后续写结构化批改'}
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {topic || (report.type === 'practical' ? '应用文批改报告' : '读后续写批改报告')}
            </h1>
            {truncated && (
              <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Response reached the model output limit. Some sections may be slightly condensed.
              </div>
            )}
          </div>
          <div className="rounded-[24px] sm:rounded-[28px] bg-slate-950 px-5 sm:px-7 py-4 sm:py-5 text-white shadow-lg min-w-[140px] w-full sm:w-auto">
            <div className="text-xs tracking-[0.22em] text-slate-300">评分</div>
            <div className="mt-2 text-3xl sm:text-4xl font-black">{report.overallComment.score}</div>
            <div className="text-sm text-slate-300 mt-2">
              {report.type === 'practical' ? '应用文 15 分制' : '续写 25 分制'}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="评语" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoCard label="完成度" value={report.overallComment.completion} />
          <InfoCard label="词汇语法" value={report.overallComment.vocabularyAndGrammar} />
          {report.type === 'practical' ? (
            <>
              <InfoCard label="内容要点覆盖" value={report.overallComment.contentCoverage} />
              <InfoCard label="主体评价" value={report.overallComment.mainBody} />
            </>
          ) : (
            <InfoCard label="情节内容" value={report.overallComment.plotContent} />
          )}
          <InfoCard label="卷面点评" value={report.handwriting} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="逐句批改" />
        <div className="space-y-4">
          {report.lineByLineCorrections.map((item, index) => (
            <div key={`${item.originalSentence}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <div className="text-xs font-bold tracking-[0.14em] text-slate-400">逐句批改 {index + 1}</div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                  <div className="text-xs font-semibold text-slate-500">学生原句</div>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">{item.originalSentence}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50/60 p-3 sm:p-4">
                  <div className="text-xs font-semibold text-emerald-700">内容提升</div>
                  <p className="mt-2 whitespace-pre-wrap text-slate-800">{renderDiffNodes(item.correctedSentence)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="错误分析详情" />
        <div className="space-y-4">
          {report.errorAnalysis.map((item, index) => (
            <div key={`${item.originalText}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold tracking-[0.14em] text-slate-400">错误分析 {index + 1}</div>
              <div className="mt-3 space-y-2">
                <p><span className="font-semibold text-slate-900">原文：</span>{item.originalText}</p>
                <p><span className="font-semibold text-slate-900">错误类型：</span>{item.errorType}</p>
                <p><span className="font-semibold text-slate-900">正确形式：</span>{item.correction}</p>
                <p><span className="font-semibold text-slate-900">原因分析：</span>{item.explanation}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {report.type === 'practical' ? (
        <>
          <section className="space-y-4">
            <SectionHeader title="内容要点覆盖" />
            <Table
              headers={['内容要点', '覆盖情况', '分析']}
              rows={report.contentCoverageTable.map((item) => [
                item.point,
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${item.covered ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {item.covered ? '已覆盖' : '未覆盖'}
                </span>,
                item.analysis,
              ])}
            />
          </section>

          <section className="space-y-4">
            <SectionHeader title="个性化提升" />
            <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-4">优化建议</h3>
                <ul className="space-y-3">
                  <li><span className="font-semibold text-slate-900">开头段：</span>{report.personalizedImprovement.optimizationSuggestions.intro}</li>
                  <li><span className="font-semibold text-slate-900">主体段：</span>{report.personalizedImprovement.optimizationSuggestions.body}</li>
                  <li><span className="font-semibold text-slate-900">结尾段：</span>{report.personalizedImprovement.optimizationSuggestions.conclusion}</li>
                </ul>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-4">话题拓展</h3>
                <p className="font-semibold text-slate-900">{report.personalizedImprovement.topicExpansion.topicName}</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-2">话题词汇</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {report.personalizedImprovement.topicExpansion.vocabulary.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-2">话题词块</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {report.personalizedImprovement.topicExpansion.phrases.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-2">话题句式</h4>
                    <div className="space-y-3">
                      {report.personalizedImprovement.topicExpansion.sentences.map((item, index) => (
                        <div key={`${item.english}-${index}`} className="rounded-2xl bg-slate-50 p-3">
                          <p className="font-medium text-slate-900">{item.english}</p>
                          <p className="text-sm text-slate-600 mt-1">{item.chinese}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title="表达提升" />
            <div className="space-y-4">
              {report.expressionElevation.map((item, index) => (
                <div key={`${item.original}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p><span className="font-semibold text-slate-900">原句：</span>{item.original}</p>
                  <p className="mt-3"><span className="font-semibold text-slate-900">更多表达：</span>{item.better}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="space-y-4">
            <SectionHeader title="情节分析" />
            <div className="grid gap-4 xl:grid-cols-2">
              <InfoCard label="原文情节梳理" value={report.plotAnalysis.originalPlot} />
              <InfoCard label="续写情节推理" value={report.plotAnalysis.inferredPlot} />
              <InfoCard label="学生续写大纲" value={report.plotAnalysis.studentOutline} />
              <InfoCard label="情节逻辑点评" value={report.plotAnalysis.plotComment} />
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title="衔接过渡" />
            <div className="grid gap-4 xl:grid-cols-2">
              <InfoCard label="第一段分析" value={report.cohesionAndTransition.paragraph1} />
              <InfoCard label="第二段分析" value={report.cohesionAndTransition.paragraph2} />
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title="个性化提升" />
            <div className="grid gap-4 xl:grid-cols-3">
              <InfoCard
                label="动作描写"
                value={`【学生原文】${report.personalizedImprovement.detailEnhancement.action.original}\n【内容提升】${report.personalizedImprovement.detailEnhancement.action.better}\n【点拨】${report.personalizedImprovement.detailEnhancement.action.analysis}`}
              />
              <InfoCard
                label="心理描写"
                value={`【学生原文】${report.personalizedImprovement.detailEnhancement.psychology.original}\n【内容提升】${report.personalizedImprovement.detailEnhancement.psychology.better}\n【点拨】${report.personalizedImprovement.detailEnhancement.psychology.analysis}`}
              />
              <InfoCard
                label="语言描写"
                value={`【学生原文】${report.personalizedImprovement.detailEnhancement.language.original}\n【内容提升】${report.personalizedImprovement.detailEnhancement.language.better}\n【点拨】${report.personalizedImprovement.detailEnhancement.language.analysis}`}
              />
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title="场景词汇" />
            <Table
              headers={['场景', '词汇及中文释义']}
              rows={report.sceneVocabulary.map((item) => [item.sceneDescription, item.vocabularyList])}
            />
          </section>
        </>
      )}

      <section className="space-y-4">
        <SectionHeader title="出彩表达" />
        <div className="space-y-4">
          {report.excellentExpressions.map((item, index) => (
            <div key={`${item.expression}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-slate-900">{index + 1}. {item.expression}</p>
              <p className="mt-2 text-slate-700">{item.analysis}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="作文润色" />
        <div className="rounded-[28px] sm:rounded-[32px] border border-slate-200 bg-white px-4 sm:px-6 py-6 sm:py-8 shadow-sm">
          <div className="mx-auto max-w-4xl text-center text-slate-900">
            <div className="text-lg sm:text-xl font-extrabold tracking-tight mb-4 sm:mb-6">高分范文</div>
            <div className="whitespace-pre-wrap text-left leading-7 sm:leading-8 text-[15px] sm:text-[17px]">{report.polishedEssay}</div>
          </div>
        </div>
      </section>
    </div>
  );
};
