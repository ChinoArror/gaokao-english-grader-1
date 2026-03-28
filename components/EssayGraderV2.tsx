import React, { useEffect, useMemo, useState } from 'react';
import { EssaySubmission, EssayType, GradingTaskResultEnvelope, InputMethod } from '../types';
import { gradeEssay } from '../services/geminiService';
import { copyText } from '../services/clipboard';
import { openPrintableReportV3 } from '../services/reportPrintV3';
import { ReportRenderer } from './report/ReportRenderer';
import { api } from '../services/api';
import { essayTypeToLabel, normalizeSummaryTitle, statusToLabel } from '../utils/reportUtils';

interface EssayGraderProps {
  onNavigateToHistory?: () => void;
  onNavigateToListen?: () => void;
  onLogout?: () => void;
}

const ICON_PATHS = [
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  "M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222",
  "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
];

const statusClass = (status?: string) =>
  ({
    queued: 'bg-amber-50 text-amber-700 border-amber-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    successful: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
  }[status || 'queued'] || 'bg-slate-50 text-slate-700 border-slate-200');

const typeClass = (essayType?: string) =>
  essayType === 'continuation'
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-indigo-50 text-indigo-700 border-indigo-200';

const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${className}`}>{children}</span>
);

const getReportTitle = (essayType?: EssayType | string) =>
  essayType === EssayType.CONTINUATION || essayType === 'continuation'
    ? '读后续写批改报告'
    : '应用文批改报告';

const buildTaskFilename = (task: GradingTaskResultEnvelope) => {
  const username = (localStorage.getItem('auth_username') || 'user').replace(/[\\/:*?"<>|\s]+/g, '_');
  const essayLabel = essayTypeToLabel(task.essayType);
  const shortUuid = task.task_uuid.slice(0, 8);
  const date = new Date(task.updatedAt * 1000);
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${username}-${essayLabel}-${shortUuid}-${dateText}.json`;
};

const UploadBox = ({ label, files, onChange }: { label: string; files: File[]; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
  <div>
    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">{label}</label>
    <div className="group mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-200 border-dashed rounded-2xl hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-300">
      <div className="space-y-2 text-center">
        <div className="mx-auto h-12 w-12 text-gray-300 group-hover:text-blue-500 transition-colors duration-300 flex items-center justify-center bg-gray-50 group-hover:bg-white rounded-full">
          <svg className="h-8 w-8" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex text-sm text-gray-600 justify-center">
          <label className="relative cursor-pointer rounded-md font-semibold text-blue-600 hover:text-blue-500">
            <span>Upload files</span>
            <input type="file" className="sr-only" accept="image/*" multiple onChange={onChange} />
          </label>
          <p className="pl-1">or drag and drop</p>
        </div>
        {files.length > 0 && <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">{files.length} files selected</span>}
      </div>
    </div>
  </div>
);

export const EssayGraderV2: React.FC<EssayGraderProps> = ({ onNavigateToHistory, onNavigateToListen, onLogout }) => {
  const displayName = localStorage.getItem('auth_username') || localStorage.getItem('user_uuid')?.slice(0, 8) || 'there';
  const iconPath = useMemo(() => ICON_PATHS[Math.floor(Math.random() * ICON_PATHS.length)], []);
  const [essayType, setEssayType] = useState<EssayType>(EssayType.PRACTICAL);
  const [inputMethod, setInputMethod] = useState<InputMethod>(InputMethod.TEXT);
  const [questionText, setQuestionText] = useState('');
  const [essayContent, setEssayContent] = useState('');
  const [questionImages, setQuestionImages] = useState<File[]>([]);
  const [essayImages, setEssayImages] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [taskResult, setTaskResult] = useState<GradingTaskResultEnvelope | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCopied, setResultCopied] = useState(false);
  const [taskUuid, setTaskUuid] = useState<string | null>(null);

  const report = taskResult?.report;
  const resultJson = taskResult ? JSON.stringify(taskResult, null, 2) : '';
  const reportTitle = getReportTitle(taskResult?.essayType || essayType);

  useEffect(() => {
    const restore = async () => {
      const stored = localStorage.getItem('last_task_uuid');
      try {
        const active = stored ? await api.getTask(stored) : await api.getLatestActiveTask();
        if (active) {
          setTaskResult(active);
          setTaskUuid(active.task_uuid);
          setTranscription(active.transcription || null);
          localStorage.setItem('last_task_uuid', active.task_uuid);
          if (active.status === 'successful' || active.status === 'failed') localStorage.removeItem('last_task_uuid');
        }
      } catch (restoreError) {
        console.error('Failed to restore task:', restoreError);
        localStorage.removeItem('last_task_uuid');
      }
    };
    restore();
  }, []);

  useEffect(() => {
    if (!taskUuid || !taskResult || taskResult.status === 'successful' || taskResult.status === 'failed') return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await api.getTask(taskUuid);
        setTaskResult(latest);
        setTranscription(latest.transcription || null);
        if (latest.status === 'successful' || latest.status === 'failed') {
          localStorage.removeItem('last_task_uuid');
          window.clearInterval(timer);
        }
      } catch (pollError) {
        console.error('Failed to poll task:', pollError);
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [taskResult, taskUuid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setTaskResult(null);
    setTaskUuid(null);
    setTranscription(null);

    if (inputMethod === InputMethod.TEXT && (!questionText.trim() || !essayContent.trim())) {
      setError('Please fill in both the Question and Essay content.');
      setIsLoading(false);
      return;
    }
    if (inputMethod === InputMethod.IMAGE && (questionImages.length === 0 || essayImages.length === 0)) {
      setError('Please upload both the Question image(s) and Essay image(s).');
      setIsLoading(false);
      return;
    }

    const submission: EssaySubmission = { type: essayType, method: inputMethod, questionText, essayContent, questionImages, essayImages };
    try {
      const response = await gradeEssay(submission);
      const nextTask: GradingTaskResultEnvelope = {
        task_uuid: response.task_uuid!,
        status: response.status!,
        essayType: response.essayType || essayType,
        inputMethod: response.inputMethod || inputMethod,
        summaryTitle: normalizeSummaryTitle(response.summaryTitle, response.task_uuid, response.status),
        createdAt: response.createdAt || Math.floor(Date.now() / 1000),
        updatedAt: response.updatedAt || Math.floor(Date.now() / 1000),
        topic: questionText || undefined,
        errorMessage: response.errorMessage,
      };
      setTaskResult(nextTask);
      setTaskUuid(nextTask.task_uuid);
      localStorage.setItem('last_task_uuid', nextTask.task_uuid);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!resultJson) return;
    await copyText(resultJson);
    setResultCopied(true);
    window.setTimeout(() => setResultCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!taskResult) return;
    const blob = new Blob([resultJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildTaskFilename(taskResult);
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!report) return;
    openPrintableReportV3({ report, topic: reportTitle, originalContent: transcription || essayContent || undefined, dateText: new Date().toLocaleDateString('zh-CN') });
  };

  const taskCard = taskResult && (
    <div className="flex flex-col h-full animate-slide-up">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50 sm:rounded-t-3xl flex flex-wrap gap-4 justify-between items-start no-print">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClass(taskResult.status)}>{statusToLabel(taskResult.status)}</Badge>
            <Badge className={typeClass(taskResult.essayType)}>{essayTypeToLabel(taskResult.essayType)}</Badge>
            <Badge className="bg-white text-slate-600 border-slate-200">UUID {taskResult.task_uuid.slice(0, 8)}</Badge>
          </div>
          <div>
            {taskResult.status === 'successful' && <h3 className="font-bold text-slate-800 text-lg">{reportTitle}</h3>}
            <p className="text-sm text-slate-500 mt-1 break-all">Task UUID: {taskResult.task_uuid}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleCopy} className="text-xs font-bold bg-white text-slate-700 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
            {resultCopied ? 'Copied' : 'Copy JSON'}
          </button>
          <button onClick={handleDownload} className="text-xs font-bold bg-white text-blue-600 px-4 py-2 rounded-xl border border-blue-100 hover:bg-blue-50 shadow-sm transition-all">
            Download JSON
          </button>
          {report && (
            <button onClick={handlePrint} className="text-xs font-bold bg-white text-green-600 px-4 py-2 rounded-xl border border-green-100 hover:bg-green-50 shadow-sm transition-all">
              PDF
            </button>
          )}
        </div>
      </div>
      <div className="p-6 sm:p-10 overflow-y-auto max-h-[800px] result-content scroll-smooth bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.08),_transparent_45%),linear-gradient(180deg,#ffffff,#f8fafc)]">
        {taskResult.status !== 'successful' ? (
          <div className="max-w-2xl mx-auto rounded-[28px] border border-slate-200 bg-white/90 p-8 shadow-sm">
            <h4 className="text-xl font-bold text-slate-900 mb-3">{taskResult.status === 'failed' ? 'Task Failed' : 'Task Submitted'}</h4>
            <p className="text-slate-600 leading-7">
              {taskResult.status === 'queued' && 'The task has entered the Cloudflare Queue. You can refresh this page and the worker will continue in the background.'}
              {taskResult.status === 'processing' && 'The worker is processing OCR and structured grading in the background. You can keep this page open or return later from History.'}
              {taskResult.status === 'failed' && (taskResult.errorMessage || 'The task failed during background processing. Please retry with clearer input or fewer images.')}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">UUID</div><div className="mt-2 text-sm font-medium text-slate-700 break-all">{taskResult.task_uuid}</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Updated</div><div className="mt-2 text-sm font-medium text-slate-700">{new Date(taskResult.updatedAt * 1000).toLocaleString()}</div></div>
            </div>
          </div>
        ) : report ? (
          <ReportRenderer report={report} topic={reportTitle} />
        ) : (
          <div className="max-w-2xl mx-auto rounded-[28px] border border-amber-200 bg-amber-50 p-8 text-amber-900">
            The task finished, but the structured report could not be rendered. Please download the JSON result for inspection.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-0 sm:pb-12">
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 sticky top-0 z-20 no-print transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-default">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} /></svg>
            </div>
            <div><h1 className="text-xl font-bold text-gray-900 tracking-tight">AI Grader</h1><p className="text-xs text-gray-400 font-medium -mt-0.5">Hi, {displayName}</p></div>
          </div>
          <div className="flex items-center gap-3">
            {onNavigateToHistory && <button onClick={onNavigateToHistory} title="History" className="p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-lg transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>}
            {onNavigateToListen && <button onClick={onNavigateToListen} title="Listening Tool" className="p-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl shadow-lg transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></button>}
            {onLogout && <button onClick={onLogout} title="Logout" className="p-2.5 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl shadow-lg transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>}
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Gemini 3.0</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-8 animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 sm:gap-8 lg:gap-10">
          <div className="space-y-0 sm:space-y-8 input-section no-print">
            <div className="bg-white sm:rounded-3xl shadow-none sm:shadow-lg sm:shadow-gray-200/50 border-b sm:border border-gray-100 p-6 sm:p-8">
              <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center"><span className="w-1.5 h-6 bg-blue-500 rounded-full mr-3"></span>Task Configuration</h2>
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-600 mb-3 ml-1">Essay Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => setEssayType(EssayType.PRACTICAL)} className={`p-4 rounded-2xl border-2 transition-all ${essayType === EssayType.PRACTICAL ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-500'}`}><span className="font-bold text-sm sm:text-base block">Practical Writing</span><span className="text-xs mt-1 opacity-75 font-medium block">应用文 (15分)</span></button>
                  <button type="button" onClick={() => setEssayType(EssayType.CONTINUATION)} className={`p-4 rounded-2xl border-2 transition-all ${essayType === EssayType.CONTINUATION ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-100 bg-white text-gray-500'}`}><span className="font-bold text-sm sm:text-base block">Continuation</span><span className="text-xs mt-1 opacity-75 font-medium block">读后续写 (25分)</span></button>
                </div>
              </div>
              <label className="block text-sm font-semibold text-gray-600 mb-3 ml-1">Input Method</label>
              <div className="flex space-x-1 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-100">
                <button type="button" onClick={() => setInputMethod(InputMethod.TEXT)} className={`flex-1 py-2.5 text-sm font-semibold rounded-xl ${inputMethod === InputMethod.TEXT ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Manual Input</button>
                <button type="button" onClick={() => setInputMethod(InputMethod.IMAGE)} className={`flex-1 py-2.5 text-sm font-semibold rounded-xl ${inputMethod === InputMethod.IMAGE ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Upload Images</button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white sm:rounded-3xl shadow-none sm:shadow-lg sm:shadow-gray-200/50 border-b sm:border border-gray-100 p-6 sm:p-8">
              <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center"><span className="w-1.5 h-6 bg-indigo-500 rounded-full mr-3"></span>Submission Content</h2>
              {inputMethod === InputMethod.TEXT ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">Task Requirements</label>
                    <textarea rows={4} className="w-full rounded-2xl border-gray-200 bg-gray-50/30 shadow-sm border p-4 resize-none" placeholder="Paste the writing prompt here..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">Your Essay</label>
                    <textarea rows={12} className="w-full rounded-2xl border-gray-200 bg-gray-50/30 shadow-sm border p-4 font-mono text-sm resize-y" placeholder="Type or paste your essay here..." value={essayContent} onChange={(e) => setEssayContent(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <UploadBox label="1. Task/Question Images" files={questionImages} onChange={(e) => e.target.files && setQuestionImages(Array.from(e.target.files))} />
                  <UploadBox label="2. Essay Images" files={essayImages} onChange={(e) => e.target.files && setEssayImages(Array.from(e.target.files))} />
                </div>
              )}
              {error && <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">{error}</div>}
              <div className="mt-8">
                <button type="submit" disabled={isLoading} className={`w-full flex items-center justify-center py-4 px-6 rounded-2xl shadow-lg text-base font-bold text-white transition-all ${isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
                  {isLoading ? 'Submitting Task...' : 'Start AI Grading'}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-0 sm:space-y-6 mt-4 sm:mt-0 pb-12 sm:pb-0">
            <div className={`print-only-content bg-white sm:rounded-3xl shadow-none sm:shadow-lg sm:shadow-gray-200/50 border-t sm:border border-gray-100 h-full min-h-[500px] flex flex-col ${!taskResult && !isLoading ? 'justify-center items-center' : ''}`}>
              {!taskResult && !isLoading && (
                <div className="text-center p-10">
                  <div className="bg-gray-50 h-28 w-28 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-800">Ready to Grade</h3>
                  <p className="text-gray-400 max-w-xs mt-3 px-4 mx-auto leading-relaxed">Enter details in the left panel and click start to submit a background grading task.</p>
                </div>
              )}
              {isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center p-12">
                  <div className="relative w-24 h-24 mb-8">
                    <div className="absolute inset-0 border-4 border-blue-50 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-600 rounded-full animate-spin border-t-transparent shadow-lg shadow-blue-500/30"></div>
                  </div>
                  <h3 className="text-xl font-bold text-gray-800">Submitting Task...</h3>
                  <p className="text-gray-500 mt-2">Sending your grading request to the queue</p>
                </div>
              )}
              {taskCard}
            </div>
          </div>
        </div>
      </main>

      {transcription && (
        <>
          <button onClick={() => setShowTranscription(!showTranscription)} className="fixed bottom-8 right-8 bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 rounded-full shadow-2xl transition-all z-30 no-print" title="View Transcription">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          {showTranscription && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40 no-print">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-start mb-6">
                  <div><h3 className="text-2xl font-bold text-gray-800">Original Text Transcription</h3><p className="text-sm text-gray-500 mt-1">Transcribed from uploaded images</p></div>
                  <button onClick={() => setShowTranscription(false)} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-6 border border-gray-200"><pre className="whitespace-pre-wrap text-gray-700 font-mono text-sm leading-relaxed">{transcription}</pre></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
