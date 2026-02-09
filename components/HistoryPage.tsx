import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import { api } from '../services/api';
import { HistoryRecord } from '../types';

interface HistoryPageProps {
    onBack: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onBack }) => {
    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const records = await api.getHistory();
            setHistory(records);
        } catch (err) {
            console.error('Failed to load history:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this record?')) {
            return;
        }

        try {
            await api.deleteHistory(id);
            loadHistory();
            if (selectedRecord?.id === id) {
                setSelectedRecord(null);
            }
        } catch (err) {
            console.error('Failed to delete record:', err);
        }
    };

    const exportAsMarkdown = (record: HistoryRecord) => {
        const markdown = `# Essay Grading Record

**Topic:** ${record.topic || 'N/A'}
**Date:** ${new Date(record.timestamp * 1000).toLocaleString()}

---

## Original Content
${record.original_content || 'N/A'}

---

## Feedback
${record.feedback}
`;

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `essay-${record.id}-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const printRecord = (record: HistoryRecord) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Essay Grading Record</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
          h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 0.5rem; }
          h2 { color: #1e40af; margin-top: 2rem; }
          .meta { color: #6b7280; margin-bottom: 2rem; }
          .content { line-height: 1.6; }
          @media print { body { padding: 1rem; } }
        </style>
      </head>
      <body>
        <h1>Essay Grading Record</h1>
        <div class="meta">
          <p><strong>Topic:</strong> ${record.topic || 'N/A'}</p>
          <p><strong>Date:</strong> ${new Date(record.timestamp * 1000).toLocaleString()}</p>
        </div>
        <h2>Original Content</h2>
        <div class="content">${record.original_content ? record.original_content.replace(/\n/g, '<br>') : 'N/A'}</div>
        <h2>Feedback</h2>
        <div class="content">${marked(record.feedback)}</div>
      </body>
      </html>
    `;

        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.print();
        };
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 mb-6 border border-white/50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">Grading History</h1>
                            <p className="text-gray-500 mt-1">View and manage your essay records</p>
                        </div>
                        <button
                            onClick={onBack}
                            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                        >
                            <span className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back to Grader
                            </span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Records List */}
                    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/50 max-h-[calc(100vh-12rem)] overflow-y-auto">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Records ({history.length})</h2>

                        {loading ? (
                            <div className="text-center py-12">
                                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
                                <p className="mt-4 text-gray-500">Loading records...</p>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-12">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="mt-4 text-gray-500">No records yet</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {history.map((record) => (
                                    <div
                                        key={record.id}
                                        onClick={() => setSelectedRecord(record)}
                                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${selectedRecord?.id === record.id
                                                ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                                                : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-semibold text-gray-800 line-clamp-1">
                                                {record.topic || 'Untitled'}
                                            </h3>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(record.id);
                                                }}
                                                className="text-red-500 hover:text-red-700 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            {new Date(record.timestamp * 1000).toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Record Detail */}
                    <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/50 max-h-[calc(100vh-12rem)] overflow-y-auto">
                        {selectedRecord ? (
                            <div>
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-800">{selectedRecord.topic || 'Untitled'}</h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {new Date(selectedRecord.timestamp * 1000).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => printRecord(selectedRecord)}
                                            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                            title="Print"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => exportAsMarkdown(selectedRecord)}
                                            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                            title="Export as Markdown"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {selectedRecord.original_content && (
                                    <div className="mb-6">
                                        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Original Content
                                        </h3>
                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                            <p className="whitespace-pre-wrap text-gray-700">{selectedRecord.original_content}</p>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                        </svg>
                                        AI Feedback
                                    </h3>
                                    <div
                                        className="prose prose-indigo max-w-none p-4 bg-gray-50 rounded-xl border border-gray-200"
                                        dangerouslySetInnerHTML={{ __html: marked(selectedRecord.feedback) }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-gray-500 text-lg">Select a record to view details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
