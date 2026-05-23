import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { copyText } from '../services/clipboard';
import { GradingTaskResultEnvelope, HistoryRecord } from '../types';
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

const isContinuationType = (essayType?: string) =>
  essayType === 'continuation' || essayType === 'CONTINUATION';

const typeClass = (essayType?: string) =>
  isContinuationType(essayType)
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-indigo-50 text-indigo-700 border-indigo-200';

const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${className}`}>{children}</span>
);

const Spinner = ({ label = 'Loading...' }: { label?: string }) => (
  <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
    <p className="mt-4 text-sm font-semibold text-gray-500">{label}</p>
  </div>
);

const getReportTitle = (essayType?: string) =>
  isContinuationType(essayType) ? '读后续写批改报告' : '应用文批改报告';

const buildTaskFilename = (task: GradingTaskResultEnvelope) => {
  const username = (localStorage.getItem('auth_username') || 'user').replace(/[\\/:*?"<>|\s]+/g, '_');
  const essayLabel = essayTypeToLabel(task.essayType);
  const shortUuid = task.task_uuid.slice(0, 8);
  const date = new Date(task.updatedAt * 1000);
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${username}-${essayLabel}-${shortUuid}-${dateText}.json`;
};

export const HistoryPageV3: React.FC<HistoryPageProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const { taskUuid } = useParams<{ taskUuid?: string }>();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [taskDetail, setTaskDetail] = useState<GradingTaskResultEnvelope | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'full' | 'original' | 'feedback' | null>(null);

  const reportTitle = getReportTitle(taskDetail?.essayType || selectedRecord?.essay_type);

  const fallbackReport = useMemo(
    () => (selectedRecord?.feedback ? parseStructuredReport(selectedRecord.feedback) : null),
    [selectedRecord]
  );

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!taskUuid) {
      setSelectedRecord(null);
      setTaskDetail(null);
      setDetailError(null);
      return;
    }

    const matchedRecord = history.find((record) => record.task_uuid === taskUuid) || null;
    setSelectedRecord(matchedRecord);
  }, [history, taskUuid]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!taskUuid) return;

      setDetailLoading(true);
      setDetailError(null);
      setTaskDetail(null);

      try {
        const detail = await api.getTask(taskUuid);
        setTaskDetail(detail);
      } catch (err: any) {
        console.error('Failed to load task detail:', err);
        setDetailError(err?.message || 'Failed to load task detail.');
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetail();
  }, [taskUuid]);

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

  const handleSelectRecord = (record: HistoryRecord) => {
    if (record.task_uuid) {
      navigate(`/history/${record.task_uuid}`);
      return;
    }

    setSelectedRecord(record);
    setTaskDetail(null);
    setDetailError(null);
  };

  const handleDelete = async (record: HistoryRecord) => {
    if (!record.task_uuid || !confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.deleteHistory(record.task_uuid);
      if (selectedRecord?.task_uuid === record.task_uuid || taskUuid === record.task_uuid) {
        setSelectedRecord(null);
        setTaskDetail(null);
        navigate('/history');
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
      topic: reportTitle,
      originalContent: taskDetail?.transcription || selectedRecord?.original_content || undefined,
      dateText: new Date((taskDetail?.updatedAt || selectedRecord?.timestamp || Math.floor(Date.now() / 1000)) * 1000).toLocaleDateString('zh-CN'),
    });
  };

  const renderDetail = () => {
    if (detailLoading) {
      return <Spinner label="Loading task detail..." />;
    }

    if (detailError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          {detailError}
        </div>
      );
    }

    if (!selectedRecord && !taskDetail) {
      return (
        <div className="flex h-full flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-slate-300">
            <span className="text-5xl">□</span>
          </div>
          <p className="text-lg text-gray-500">Select a task to view details</p>
        </div>
      );
    }

    const status = taskDetail?.status || selectedRecord?.status;
    const report = taskDetail?.report || fallbackReport;
    const originalContent = taskDetail?.originalContent || selectedRecord?.original_content || '';
    const timestamp = taskDetail?.updatedAt || selectedRecord?.updated_at || selectedRecord?.timestamp || Math.floor(Date.now() / 1000);

    return (
      <div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">{reportTitle}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge className={statusClass(status)}>{statusToLabel(status)}</Badge>
              <Badge className={typeClass(taskDetail?.essayType || selectedRecord?.essay_type)}>
                {essayTypeToLabel(taskDetail?.essayType || selectedRecord?.essay_type)}
              </Badge>
              {(taskDetail?.task_uuid || selectedRecord?.task_uuid) && (
                <Badge className="bg-white text-slate-600 border-slate-200">UUID {(taskDetail?.task_uuid || selectedRecord?.task_uuid || '').slice(0, 8)}</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">{new Date(timestamp * 1000).toLocaleString()}</p>
          </div>
          <div className="flex gap-2">
            {taskDetail && <button onClick={downloadJson} className="rounded-lg bg-gray-100 p-2 transition-colors hover:bg-gray-200" title="Download JSON">JSON</button>}
            {taskDetail && <button onClick={() => copyJson('full')} className="rounded-lg bg-gray-100 p-2 transition-colors hover:bg-gray-200" title="Copy JSON">{copiedTarget === 'full' ? 'Copied' : 'Copy'}</button>}
            {report && <button onClick={printTask} className="rounded-lg bg-gray-100 p-2 transition-colors hover:bg-gray-200" title="Print">PDF</button>}
          </div>
        </div>

        {(status === 'queued' || status === 'processing' || status === 'failed') && !report && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 leading-7 text-slate-700">
            {status === 'queued' && 'This task is still waiting in the queue.'}
            {status === 'processing' && 'This task is currently being processed in the background.'}
            {status === 'failed' && (taskDetail?.errorMessage || selectedRecord?.error_message || 'This task failed during background processing.')}
          </div>
        )}

        {originalContent && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Original Content</h3>
              <button onClick={() => copyJson('original')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50">
                {copiedTarget === 'original' ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="whitespace-pre-wrap text-gray-700">{originalContent}</p>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-800">AI Feedback</h3>
            <button onClick={() => copyJson('feedback')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50">
              {copiedTarget === 'feedback' ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            {report ? (
              <ReportRenderer report={report} topic={reportTitle} />
            ) : selectedRecord?.feedback ? (
              <LegacyMarkdownReport markdown={selectedRecord.feedback} />
            ) : (
              <p className="text-gray-500">No feedback available yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => (
    <>
      <h2 className="mb-3 text-lg font-bold text-gray-800 md:text-xl">Tasks ({history.length})</h2>
      {loading ? (
        <Spinner label="Loading tasks..." />
      ) : history.length === 0 ? (
        <div className="py-12 text-center"><p className="text-gray-500">No tasks yet</p></div>
      ) : (
        <div className="space-y-3">
          {history.map((record, index) => {
            const title = normalizeSummaryTitle(record.summary_title, record.task_uuid, record.status);
            const active = taskUuid
              ? taskUuid === record.task_uuid
              : selectedRecord?.task_uuid
                ? selectedRecord.task_uuid === record.task_uuid
                : selectedRecord?.id === record.id;
            return (
              <div key={record.task_uuid || `${record.id}-${index}`} onClick={() => handleSelectRecord(record)} className={`rounded-xl border-2 p-4 transition-all duration-300 ${active ? 'border-indigo-500 bg-indigo-50 shadow-lg' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'} cursor-pointer`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="line-clamp-2 font-semibold text-gray-800">{title}</h3>
                  {record.task_uuid && (
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(record); }} className="text-red-500 transition-colors hover:text-red-700" title="Delete task">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">{new Date(record.timestamp * 1000).toLocaleString()}</p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Badge className={statusClass(record.status)}>{statusToLabel(record.status)}</Badge>
                  <Badge className={typeClass(record.essay_type)}>{essayTypeToLabel(record.essay_type)}</Badge>
                  {record.task_uuid && <Badge className="bg-white text-slate-600 border-slate-200">UUID {record.task_uuid.slice(0, 8)}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const isDetailRoute = Boolean(taskUuid);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-indigo-50 to-blue-100 p-3 md:p-8">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
        {isDetailRoute ? (
          <div className="mb-3 shrink-0">
            <button onClick={() => navigate('/history')} className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 lg:hidden">
              <ArrowLeft className="h-4 w-4" />
              Back to History
            </button>
            <div className="hidden items-center justify-between gap-3 rounded-2xl border border-white/50 bg-white/80 p-5 shadow-xl backdrop-blur-lg lg:flex">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Grading History</h1>
                <p className="mt-1 text-gray-500">View queued, processing, successful, and failed tasks</p>
              </div>
              <button onClick={onBack} className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">
                Back to Grader
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3 shrink-0 rounded-2xl border border-white/50 bg-white/80 p-4 shadow-xl backdrop-blur-lg md:mb-5 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 md:text-3xl">Grading History</h1>
                <p className="mt-1 hidden text-gray-500 sm:block">View queued, processing, successful, and failed tasks</p>
              </div>
              <button onClick={onBack} className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg md:px-6 md:py-3">
                Back to Grader
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <div className={`${isDetailRoute ? 'hidden lg:grid' : 'grid'} h-full grid-cols-1 gap-6 lg:grid-cols-2`}>
            <div className="min-h-0 overflow-y-auto rounded-2xl border border-white/50 bg-white/80 p-4 shadow-xl backdrop-blur-lg md:p-6">
              {renderList()}
            </div>

            <div className="hidden min-h-0 overflow-y-auto rounded-2xl border border-white/50 bg-white/80 p-4 shadow-xl backdrop-blur-lg md:p-6 lg:block">
              {renderDetail()}
            </div>
          </div>

          {isDetailRoute && (
            <div className="h-full overflow-y-auto rounded-2xl border border-white/50 bg-white/80 p-4 shadow-xl backdrop-blur-lg md:p-6 lg:hidden">
              {renderDetail()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
