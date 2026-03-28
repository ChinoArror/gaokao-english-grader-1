import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { copyText } from '../services/clipboard';
import { HistoryRecord, GradingTaskResultEnvelope } from '../types';
import { LegacyMarkdownReport, ReportRenderer } from './report/ReportRenderer';
import { openPrintableReportV3 } from '../services/reportPrintV3';
import { essayTypeToLabel, normalizeSummaryTitle, parseStructuredReport, statusToLabel } from '../utils/reportUtils';

interface HistoryPageProps {
  onBack: () => void;
}

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

const getReportTitle = (essayType?: string) =>
  essayType === 'continuation' ? '读后续写批改报告' : '应用文批改报告';

const buildTaskFilename = (task: GradingTaskResultEnvelope) => {
  const username = (localStorage.getItem('auth_username') || 'user').replace(/[\\/:*?"<>|\s]+/g, '_');
  const essayLabel = essayTypeToLabel(task.essayType);
  const shortUuid = task.task_uuid.slice(0, 8);
  const date = new Date(task.updatedAt * 1000);
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${username}-${essayLabel}-${shortUuid}-${dateText}.json`;
};

export const HistoryPageV2: React.FC<HistoryPageProps> = ({ onBack }) => {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [taskDetail, setTaskDetail] = useState<GradingTaskResultEnvelope | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'full' | 'original' | 'feedback' | null>(null);

  const selectedTitle = selectedRecord ? getReportTitle(taskDetail?.essayType || selectedRecord.essay_type) : '';
  const detailReportTitle = getReportTitle(taskDetail?.essayType || selectedRecord?.essay_type);

  const fallbackReport = useMemo(
    () => (selectedRecord?.feedback ? parseStructuredReport(selectedRecord.feedback) : null),
    [selectedRecord]
  );

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedRecord?.task_uuid) {
        setTaskDetail(null);
        return;
      }
      try {
        setTaskDetail(await api.getTask(selectedRecord.task_uuid));
      } catch (err) {
        console.error('Failed to load task detail:', err);
        setTaskDetail(null);
      }
    };
    loadDetail();
  }, [selectedRecord]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setHistory(await api.getHistory());
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (record: HistoryRecord) => {
    if (!record.task_uuid || !confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.deleteHistory(record.task_uuid);
      if (selectedRecord?.task_uuid === record.task_uuid) {
        setSelectedRecord(null);
        setTaskDetail(null);
      }
      await loadHistory();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const fullJson = taskDetail ? JSON.stringify(taskDetail, null, 2) : '';
  const originalJson = JSON.stringify({
    task_uuid: taskDetail?.task_uuid || selectedRecord?.task_uuid,
    originalContent: taskDetail?.originalContent || selectedRecord?.original_content || '',
    transcription: taskDetail?.transcription || selectedRecord?.original_content || '',
  }, null, 2);
  const feedbackJson = JSON.stringify({
    task_uuid: taskDetail?.task_uuid || selectedRecord?.task_uuid,
    status: taskDetail?.status || selectedRecord?.status,
    report: taskDetail?.report || fallbackReport,
    errorMessage: taskDetail?.errorMessage || selectedRecord?.error_message,
  }, null, 2);

  const copyJson = async (target: 'full' | 'original' | 'feedback') => {
    const value = target === 'full' ? fullJson : target === 'original' ? originalJson : feedbackJson;
    if (!value) return;
    await copyText(value);
    setCopiedTarget(target);
    window.setTimeout(() => setCopiedTarget((current) => (current === target ? null : current)), 2000);
  };

  const downloadJson = () => {
    if (!taskDetail) return;
    const blob = new Blob([fullJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildTaskFilename(taskDetail);
    a.click();
    URL.revokeObjectURL(url);
  };

  const printTask = () => {
    const report = taskDetail?.report || fallbackReport;
    if (!report) return;
    openPrintableReportV3({
      report,
      topic: selectedTitle || selectedRecord?.topic || '作文批改报告',
      originalContent: taskDetail?.transcription || selectedRecord?.original_content || undefined,
      dateText: new Date((taskDetail?.updatedAt || selectedRecord?.timestamp || Math.floor(Date.now() / 1000)) * 1000).toLocaleDateString('zh-CN'),
    });
  };

  const renderDetail = () => {
    if (!selectedRecord) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500 text-lg">Select a task to view details</p>
        </div>
      );
    }

    const status = taskDetail?.status || selectedRecord.status;
    const report = taskDetail?.report || fallbackReport;

    return (
      <div>
        <div className="flex justify-between items-start mb-6 gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">{selectedTitle}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge className={statusClass(status)}>{statusToLabel(status)}</Badge>
              <Badge className={typeClass(selectedRecord.essay_type)}>{essayTypeToLabel(selectedRecord.essay_type)}</Badge>
              {selectedRecord.task_uuid && <Badge className="bg-white text-slate-600 border-slate-200">UUID {selectedRecord.task_uuid.slice(0, 8)}</Badge>}
            </div>
            <p className="text-sm text-gray-500">{new Date((selectedRecord.updated_at || selectedRecord.timestamp) * 1000).toLocaleString()}</p>
          </div>
          <div className="flex gap-2">
            {taskDetail && <button onClick={downloadJson} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" title="Download JSON">JSON</button>}
            {taskDetail && <button onClick={() => copyJson('full')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" title="Copy JSON">{copiedTarget === 'full' ? 'Copied' : 'Copy'}</button>}
            {report && <button onClick={printTask} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" title="Print">PDF</button>}
          </div>
        </div>

        {(status === 'queued' || status === 'processing' || status === 'failed') && !report && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 mb-6 text-slate-700 leading-7">
            {status === 'queued' && 'This task is still waiting in the queue.'}
            {status === 'processing' && 'This task is currently being processed in the background.'}
            {status === 'failed' && (taskDetail?.errorMessage || selectedRecord.error_message || 'This task failed during background processing.')}
          </div>
        )}

        {(taskDetail?.originalContent || selectedRecord.original_content) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Original Content</h3>
              <button onClick={() => copyJson('original')} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
                {copiedTarget === 'original' ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="whitespace-pre-wrap text-gray-700">{taskDetail?.originalContent || selectedRecord.original_content}</p>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h3 className="text-lg font-semibold text-gray-800">AI Feedback</h3>
            <button onClick={() => copyJson('feedback')} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
              {copiedTarget === 'feedback' ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            {report ? (
              <ReportRenderer report={report} topic={selectedTitle} />
            ) : selectedRecord.feedback ? (
              <LegacyMarkdownReport markdown={selectedRecord.feedback} />
            ) : (
              <p className="text-gray-500">No feedback available yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 mb-6 border border-white/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Grading History</h1>
              <p className="text-gray-500 mt-1">View queued, processing, successful, and failed tasks</p>
            </div>
            <button onClick={onBack} className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-xl shadow-lg transition-all">
              Back to Grader
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/50 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Tasks ({history.length})</h2>
            {loading ? (
              <div className="text-center py-12"><div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div><p className="mt-4 text-gray-500">Loading tasks...</p></div>
            ) : history.length === 0 ? (
              <div className="text-center py-12"><p className="text-gray-500">No tasks yet</p></div>
            ) : (
              <div className="space-y-3">
                {history.map((record, index) => {
                  const title = normalizeSummaryTitle(record.summary_title, record.task_uuid, record.status);
                  const active = selectedRecord?.task_uuid ? selectedRecord.task_uuid === record.task_uuid : selectedRecord?.id === record.id;
                  return (
                    <div key={record.task_uuid || `${record.id}-${index}`} onClick={() => setSelectedRecord(record)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${active ? 'border-indigo-500 bg-indigo-50 shadow-lg' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'}`}>
                      <div className="flex justify-between items-start gap-3">
                        <h3 className="font-semibold text-gray-800 line-clamp-2">{title}</h3>
                        {record.task_uuid && <button onClick={(e) => { e.stopPropagation(); handleDelete(record); }} className="text-red-500 hover:text-red-700 transition-colors">✕</button>}
                      </div>
                      <p className="text-sm text-gray-500 mt-2">{new Date(record.timestamp * 1000).toLocaleString()}</p>
                      <div className="mt-3 flex flex-wrap gap-2 items-end">
                        <Badge className={statusClass(record.status)}>{statusToLabel(record.status)}</Badge>
                        <Badge className={typeClass(record.essay_type)}>{essayTypeToLabel(record.essay_type)}</Badge>
                        {record.task_uuid && <Badge className="bg-white text-slate-600 border-slate-200">UUID {record.task_uuid.slice(0, 8)}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/50 max-h-[calc(100vh-12rem)] overflow-y-auto">
            {renderDetail()}
          </div>
        </div>
      </div>
    </div>
  );
};
