import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api'; // Correct import path from components/
import { useNavigate } from 'react-router-dom';

interface Segment {
    id: number;
    startTime: number; // in seconds
    label: string;
}

export function ListeningPage() {
    const [file, setFile] = useState<File | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [batchIndex, setBatchIndex] = useState<number>(-1);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0); // 0-100
    const [status, setStatus] = useState<string>('');
    const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);

    // History State
    const [historyFiles, setHistoryFiles] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [currentFileId, setCurrentFileId] = useState<number | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const files = await api.getAudioFiles();
            setHistoryFiles(files);
        } catch (e) {
            console.error("Failed to load history", e);
        }
    };

    const handleSelectHistory = async (fileRecord: any) => {
        setFile(null); // Clear local file selection
        setPendingFiles([]);
        setStatus(`Loading audio: ${fileRecord.filename}...`);
        setShowHistory(false);
        setAudioUrl(null);
        setSegments([]);
        setCurrentFileId(null);

        try {
            const url = await api.getAudioBlobUrl(fileRecord.file_key);
            setAudioUrl(url);

            // Parse segments if available
            if (fileRecord.segments_json) {
                setSegments(JSON.parse(fileRecord.segments_json));
            }

            setCurrentFileId(fileRecord.id);
            setStatus(`Loaded: ${fileRecord.filename}`);
        } catch (e) {
            setStatus('Failed to load audio from history');
        }
    };

    const handleDeleteHistory = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this file?')) return;

        try {
            await api.deleteAudio(id);
            setHistoryFiles(prev => prev.filter(f => f.id !== id));
            if (currentFileId === id) {
                setAudioUrl(null);
                setSegments([]);
                setCurrentFileId(null);
            }
        } catch (e) {
            alert('Failed to delete file');
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            if (segments.length === 0) return;

            // Find current segment
            const currentTime = audio.currentTime;
            let currentId = null;

            for (let i = 0; i < segments.length; i++) {
                if (currentTime >= segments[i].startTime) {
                    // Check if it's before the next segment
                    if (i === segments.length - 1 || currentTime < segments[i + 1].startTime) {
                        currentId = segments[i].id;
                        break;
                    }
                }
            }
            setActiveSegmentId(currentId);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
    }, [segments]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = Array.from(e.target.files) as File[];

            if (selectedFiles.length === 1) {
                const selectedFile = selectedFiles[0];
                setFile(selectedFile);
                setPendingFiles([]);
                setBatchIndex(-1);
                setAudioUrl(URL.createObjectURL(selectedFile));
                setSegments([]);
                setActiveSegmentId(null);
                setCurrentFileId(null);
                setStatus('');
            } else {
                setPendingFiles(selectedFiles);
                setFile(null);
                setAudioUrl(null);
                setSegments([]);
                setActiveSegmentId(null);
                setCurrentFileId(null);
                setBatchIndex(-1);
                setStatus(`Selected ${selectedFiles.length} files. Ready to process batch.`);
            }
        }
    };

    const processBatch = async () => {
        if (pendingFiles.length === 0) return;

        setLoading(true);
        let successCount = 0;

        for (let i = 0; i < pendingFiles.length; i++) {
            setBatchIndex(i);
            const currentFile = pendingFiles[i];
            setStatus(`Processing file ${i + 1}/${pendingFiles.length}: ${currentFile.name}...`);
            setProgress(20);

            try {
                const uploadResult = await api.uploadAudio(currentFile);

                setStatus(`AI is listening to ${currentFile.name}... (This may take ~30s)`);
                setProgress(50);

                await api.segmentAudio(uploadResult.key);
                successCount++;
                await loadHistory(); // Reload history incrementally

                setStatus(`Completed: ${currentFile.name}`);
                setProgress(100);
            } catch (error: any) {
                console.error(`Error processing ${currentFile.name}:`, error);
                setStatus(`Error on ${currentFile.name}: ${error.message}`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        setLoading(false);
        if (successCount === pendingFiles.length) {
            setStatus(`Batch complete! Successfully processed ${successCount} files.`);
            setPendingFiles([]);
            setBatchIndex(-1);
        } else {
            setStatus(`Batch complete with errors! Processed ${successCount}/${pendingFiles.length} files.`);
        }
    };

    const processAudio = async () => {
        if (!file) return;

        setLoading(true);
        setStatus('Uploading audio file...');
        setProgress(20);

        try {
            const uploadResult = await api.uploadAudio(file);

            setStatus('AI is listening and segmenting... (This may take ~30s)');
            setProgress(50);

            // Add artificial progress for UX while waiting
            const progressInterval = setInterval(() => {
                setProgress(p => (p < 90 ? p + 5 : p));
            }, 2000);

            const segmentResult = await api.segmentAudio(uploadResult.key);

            clearInterval(progressInterval);
            setSegments(segmentResult.segments);
            setStatus('Segmentation Complete!');
            setProgress(100);

            // Reload history to show new file
            loadHistory();

        } catch (error: any) {
            console.error('Error processing audio:', error);
            setStatus(`Error: ${error.message || 'Failed to process audio'}`);
        } finally {
            setLoading(false);
        }
    };

    const jumpToSegment = (startTime: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = startTime;
            audioRef.current.play();
        }
    };

    const exportCueSheet = () => {
        if ((!file && !currentFileId) || segments.length === 0) return;

        // Determine filename
        let filename = file ? file.name : "audio_export";
        if (currentFileId) {
            const historyFile = historyFiles.find(f => f.id === currentFileId);
            if (historyFile) filename = historyFile.filename;
        }

        let content = `FILE "${filename}" MP3\n`;
        segments.forEach((seg, index) => {
            const minutes = Math.floor(seg.startTime / 60);
            const seconds = Math.floor(seg.startTime % 60);
            const frames = Math.floor((seg.startTime % 1) * 75);

            const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;

            content += `  TRACK ${String(index + 1).padStart(2, '0')} AUDIO\n`;
            content += `    TITLE "${seg.label}"\n`;
            content += `    INDEX 01 ${timeStr}\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename.replace(/\.[^/.]+$/, "")}.cue`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white p-2.5 rounded-xl shadow-lg shadow-teal-500/20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Listening Segmentation</h1>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex items-center"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            History ({historyFiles.length})
                        </button>
                        <button
                            onClick={() => navigate('/grader')}
                            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Back to Grader
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl w-full mx-auto py-8 px-4 sm:px-6 lg:px-8 animate-fade-in flex gap-6">

                {/* History Sidebar (Conditional) */}
                {showHistory && (
                    <div className="w-full max-w-xs bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-8rem)] sticky top-24">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800">Your Uploads</h3>
                            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {historyFiles.length === 0 ? (
                                <div className="text-center text-gray-400 py-10 text-sm">No history yet</div>
                            ) : (
                                historyFiles.map(file => (
                                    <div
                                        key={file.id}
                                        onClick={() => handleSelectHistory(file)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all group relative ${currentFileId === file.id ? 'bg-teal-50 border-teal-200 ring-1 ring-teal-200' : 'bg-white border-gray-100 hover:border-teal-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="pr-6">
                                            <div className={`font-semibold text-sm truncate mb-1 ${currentFileId === file.id ? 'text-teal-800' : 'text-gray-700'}`}>
                                                {file.filename}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {new Date(file.created_at * 1000).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => handleDeleteHistory(e, file.id)}
                                            className="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Delete"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Main Card */}
                <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden min-h-[500px]">
                    <div className="p-8 sm:p-10">

                        {/* Upload & Controls */}
                        <div className="mb-10 text-center">
                            {!file && !currentFileId && pendingFiles.length === 0 ? (
                                <div
                                    className="group border-2 border-dashed border-gray-300 hover:border-teal-500 rounded-3xl p-10 transition-all cursor-pointer bg-gray-50/50 hover:bg-teal-50/20"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    <input
                                        type="file"
                                        accept="audio/*,.mp3,.wav,.m4a,.aac,.m4r"
                                        multiple
                                        onChange={handleFileChange}
                                        className="hidden"
                                        id="audio-upload"
                                    />
                                    <label htmlFor="audio-upload" className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                                        <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                            <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                        </div>
                                        <div className="text-lg font-semibold text-gray-700 mb-1">Upload Listening File(s)</div>
                                        <div className="text-sm text-gray-400">MP3, WAV, or M4A supported</div>
                                    </label>
                                </div>
                            ) : pendingFiles.length > 0 ? (
                                <div className="flex flex-col items-center animate-slide-up">
                                    <div className="flex items-center space-x-4 mb-8 bg-blue-50 px-6 py-3 rounded-2xl border border-blue-100 text-blue-800 w-full max-w-md justify-between">
                                        <div className="flex items-center font-bold">
                                            <svg className="w-5 h-5 mr-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                                            {pendingFiles.length} Files Selected
                                        </div>
                                        {batchIndex === -1 && (
                                            <button
                                                onClick={() => { setPendingFiles([]); setStatus(''); }}
                                                className="text-blue-400 hover:text-blue-600 p-1"
                                                title="Clear Batch"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                            </button>
                                        )}
                                    </div>

                                    <div className="w-full max-w-md bg-white border border-gray-100 rounded-xl max-h-48 overflow-y-auto mb-8 shadow-inner p-2 space-y-1 text-left">
                                        {pendingFiles.map((f, i) => (
                                            <div key={i} className={`flex items-center p-2 rounded-lg ${batchIndex === i ? 'bg-teal-50 text-teal-700 font-medium border border-teal-100' : 'text-gray-600 hover:bg-gray-50 border border-transparent'}`}>
                                                <div className="flex-1 truncate text-sm flex items-center pr-2">
                                                    {batchIndex === i && loading ? (
                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    ) : (batchIndex > i || (batchIndex === -1 && status.includes('Successfully processed'))) ? (
                                                        <svg className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                    ) : (
                                                        <span className="w-4 h-4 mr-2 block flex-shrink-0"></span> // Placeholder
                                                    )}
                                                    <span className="truncate">{f.name}</span>
                                                </div>
                                                <div className="text-xs text-gray-400 flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</div>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={processBatch}
                                        disabled={loading || batchIndex !== -1}
                                        className={`px-8 py-3 rounded-xl text-white font-bold text-lg shadow-lg transition-all transform flex items-center
                                            ${loading || batchIndex !== -1
                                                ? 'bg-gray-400 cursor-not-allowed shadow-none hover:translate-y-0'
                                                : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-105 hover:shadow-xl active:scale-95'}
                                        `}
                                    >
                                        {loading ? 'Processing Batch...' : 'Start Batch Processing'}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center animate-slide-up">
                                    <div className="flex items-center space-x-4 mb-8 bg-blue-50 px-6 py-3 rounded-2xl border border-blue-100 text-blue-800">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                                        <span className="font-medium truncate max-w-xs">
                                            {file ? file.name : (historyFiles.find(f => f.id === currentFileId)?.filename || 'Audio File')}
                                        </span>
                                        <button
                                            onClick={() => { setFile(null); setSegments([]); setAudioUrl(null); setCurrentFileId(null); }}
                                            className="text-blue-400 hover:text-blue-600"
                                            title="Close File"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>
                                    </div>

                                    {!audioUrl ? null : (
                                        !currentFileId ? (
                                            <button
                                                onClick={processAudio}
                                                disabled={loading || segments.length > 0}
                                                className={`px-8 py-3 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 flex items-center
                                            ${loading || segments.length > 0
                                                        ? 'bg-gray-400 cursor-not-allowed shadow-none hover:translate-y-0'
                                                        : 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700'}
                                        `}
                                            >
                                                {loading ? (
                                                    <>
                                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        Processing...
                                                    </>
                                                ) : segments.length > 0 ? (
                                                    'Segmented Successfully'
                                                ) : (
                                                    'Start AI Segmentation'
                                                )}
                                            </button>
                                        ) : (
                                            <div className="flex space-x-4">
                                                <a
                                                    href={audioUrl}
                                                    download={historyFiles.find(f => f.id === currentFileId)?.filename || 'download.mp3'}
                                                    className="px-6 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl shadow-sm hover:shadow transition-all flex items-center"
                                                >
                                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                                    Download Audio
                                                </a>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Status Bar */}
                        {status && (
                            <div className="max-w-xl mx-auto mb-10 text-center animate-fade-in">
                                <p className={`text-base font-medium mb-3 ${status.startsWith('Error') ? 'text-red-600' : 'text-gray-600'}`}>
                                    {status}
                                </p>
                                {loading && (
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div className="bg-gradient-to-r from-teal-400 to-emerald-500 h-2 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Player & Segments */}
                        {audioUrl && (segments.length > 0 || currentFileId) && (
                            <div className="opacity-100 translate-y-0 transition-all duration-700">
                                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-8">
                                    <audio
                                        ref={audioRef}
                                        src={audioUrl}
                                        controls
                                        className="w-full h-12 outline-none"
                                    />
                                </div>

                                {segments.length > 0 && (
                                    <div className="animate-slide-up">
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-xl font-bold text-gray-800">Listening Segments</h2>
                                            <button
                                                onClick={exportCueSheet}
                                                className="inline-flex items-center px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                                            >
                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                                Export .CUE
                                            </button>
                                        </div>

                                        {/* Part 1 */}
                                        <div className="mb-6">
                                            <h3 className="text-sm uppercase tracking-wider text-gray-500 font-bold mb-3 pl-1">Part 1 (Short Conversations)</h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                                {segments.filter(s => s.id <= 5).map((seg) => (
                                                    <button
                                                        key={seg.id}
                                                        onClick={() => jumpToSegment(Number(seg.startTime))}
                                                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group
                                                    ${activeSegmentId === seg.id
                                                                ? 'bg-teal-500 border-teal-600 text-white shadow-md scale-105 ring-2 ring-teal-200'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:shadow-md hover:-translate-y-0.5'
                                                            }
                                                `}
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className={`text-xs font-bold uppercase tracking-wider ${activeSegmentId === seg.id ? 'text-teal-100' : 'text-gray-400 group-hover:text-teal-500'}`}>Q{seg.id}</span>
                                                            <span className={`text-xs font-mono ${activeSegmentId === seg.id ? 'text-teal-100 opacity-80' : 'text-gray-400'}`}>
                                                                {Math.floor(Number(seg.startTime) / 60)}:{(Number(seg.startTime) % 60).toFixed(0).padStart(2, '0')}
                                                            </span>
                                                        </div>
                                                        <div className={`text-sm font-bold truncate ${activeSegmentId === seg.id ? 'text-white' : 'text-gray-800'}`}>
                                                            Conversation {seg.id}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Part 2 */}
                                        <div>
                                            <h3 className="text-sm uppercase tracking-wider text-gray-500 font-bold mb-3 pl-1">Part 2 (Long Conversations)</h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                                {segments.filter(s => s.id > 5).map((seg) => (
                                                    <button
                                                        key={seg.id}
                                                        onClick={() => jumpToSegment(Number(seg.startTime))}
                                                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group
                                                    ${activeSegmentId === seg.id
                                                                ? 'bg-indigo-500 border-indigo-600 text-white shadow-md scale-105 ring-2 ring-indigo-200'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5'
                                                            }
                                                `}
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className={`text-xs font-bold uppercase tracking-wider ${activeSegmentId === seg.id ? 'text-indigo-100' : 'text-gray-400 group-hover:text-indigo-500'}`}>Q{seg.id}</span>
                                                            <span className={`text-xs font-mono ${activeSegmentId === seg.id ? 'text-indigo-100 opacity-80' : 'text-gray-400'}`}>
                                                                {Math.floor(Number(seg.startTime) / 60)}:{(Number(seg.startTime) % 60).toFixed(0).padStart(2, '0')}
                                                            </span>
                                                        </div>
                                                        <div className={`text-sm font-bold truncate ${activeSegmentId === seg.id ? 'text-white' : 'text-gray-800'}`}>
                                                            Conversation {seg.id}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
