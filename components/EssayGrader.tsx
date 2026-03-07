import React, { useState, useMemo } from 'react';
import { EssayType, InputMethod, EssaySubmission } from '../types';
import { gradeEssay } from '../services/geminiService';
import { marked } from 'marked';

interface EssayGraderProps {
  onNavigateToHistory?: () => void;
  onNavigateToListen?: () => void;
  onLogout?: () => void;
}

// Curated icon paths for random selection
const ICON_PATHS = [
  // Document with check
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  // Academic cap
  "M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222",
  // Beaker / science
  "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  // Lightbulb
  "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  // Star / award
  "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  // Globe
  "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
];

export const EssayGrader: React.FC<EssayGraderProps> = ({ onNavigateToHistory, onNavigateToListen, onLogout }) => {
  const displayName = localStorage.getItem('auth_username') || localStorage.getItem('user_uuid')?.slice(0, 8) || 'there';
  const iconPath = useMemo(() => ICON_PATHS[Math.floor(Math.random() * ICON_PATHS.length)], []);

  const [essayType, setEssayType] = useState<EssayType>(EssayType.PRACTICAL);
  const [inputMethod, setInputMethod] = useState<InputMethod>(InputMethod.TEXT);
  const [questionText, setQuestionText] = useState('');
  const [essayContent, setEssayContent] = useState('');

  const [questionImages, setQuestionImages] = useState<File[]>([]);
  const [essayImages, setEssayImages] = useState<File[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    // Validation
    if (inputMethod === InputMethod.TEXT) {
      if (!questionText.trim() || !essayContent.trim()) {
        setError("Please fill in both the Question and Essay content.");
        setIsLoading(false);
        return;
      }
    } else {
      if (questionImages.length === 0 || essayImages.length === 0) {
        setError("Please upload both the Question image(s) and Essay image(s).");
        setIsLoading(false);
        return;
      }
    }

    const submission: EssaySubmission = {
      type: essayType,
      method: inputMethod,
      questionText,
      essayContent,
      questionImages,
      essayImages
    };

    try {
      const response = await gradeEssay(submission);
      setResult(response.feedback);
      setTranscription(null);
      if (response.transcription) {
        setTranscription(response.transcription);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (setter: React.Dispatch<React.SetStateAction<File[]>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setter(Array.from(e.target.files));
    }
  };

  // Download raw markdown function
  const handleDownloadMD = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `essay-feedback-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render markdown securely
  const getMarkdownText = (text: string) => {
    const rawMarkup = marked.parse(text);
    return { __html: rawMarkup };
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-0 sm:pb-12">
      {/* Header - Hidden when printing */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 sticky top-0 z-20 no-print transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-default">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">AI Grader</h1>
              <p className="text-xs text-gray-400 font-medium -mt-0.5">Hi, {displayName} 👋</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onNavigateToHistory && (
              <button
                onClick={onNavigateToHistory}
                title="History"
                className="p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-purple-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            {onNavigateToListen && (
              <button
                onClick={onNavigateToListen}
                title="Listening Tool"
                className="p-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                title="Logout"
                className="p-2.5 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              Gemini 3.0
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-8 animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 sm:gap-8 lg:gap-10">

          {/* LEFT COLUMN: INPUTS - Hidden when printing */}
          <div className="space-y-0 sm:space-y-8 input-section no-print">

            {/* Configuration Card */}
            <div className="bg-white sm:rounded-3xl shadow-none sm:shadow-lg sm:shadow-gray-200/50 border-b sm:border border-gray-100 p-6 sm:p-8 transition-all hover:shadow-xl hover:shadow-gray-200/50">
              <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full mr-3"></span>
                Task Configuration
              </h2>

              {/* Essay Type Selection */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-600 mb-3 ml-1">Essay Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setEssayType(EssayType.PRACTICAL)}
                    className={`relative overflow-hidden flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300 ${essayType === EssayType.PRACTICAL
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md transform scale-[1.02]'
                      : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <span className="font-bold text-sm sm:text-base z-10">Practical Writing</span>
                    <span className="text-xs mt-1 opacity-75 font-medium z-10">应用文 (15分)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEssayType(EssayType.CONTINUATION)}
                    className={`relative overflow-hidden flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300 ${essayType === EssayType.CONTINUATION
                      ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md transform scale-[1.02]'
                      : 'border-gray-100 bg-white hover:border-purple-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <span className="font-bold text-sm sm:text-base z-10">Continuation</span>
                    <span className="text-xs mt-1 opacity-75 font-medium z-10">读后续写 (25分)</span>
                  </button>
                </div>
              </div>

              {/* Input Method Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-3 ml-1">Input Method</label>
                <div className="flex space-x-1 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-100">
                  <button
                    onClick={() => setInputMethod(InputMethod.TEXT)}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${inputMethod === InputMethod.TEXT
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Manual Input
                  </button>
                  <button
                    onClick={() => setInputMethod(InputMethod.IMAGE)}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${inputMethod === InputMethod.IMAGE
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Upload Images
                  </button>
                </div>
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="bg-white sm:rounded-3xl shadow-none sm:shadow-lg sm:shadow-gray-200/50 border-b sm:border border-gray-100 p-6 sm:p-8 transition-all hover:shadow-xl hover:shadow-gray-200/50">
              <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
                <span className="w-1.5 h-6 bg-indigo-500 rounded-full mr-3"></span>
                Submission Content
              </h2>

              {inputMethod === InputMethod.TEXT ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">
                      Task Requirements
                    </label>
                    <textarea
                      rows={4}
                      className="w-full rounded-2xl border-gray-200 bg-gray-50/30 shadow-sm focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 border p-4 transition-all duration-300 resize-none"
                      placeholder="Paste the writing prompt here..."
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">
                      Your Essay
                    </label>
                    <textarea
                      rows={12}
                      className="w-full rounded-2xl border-gray-200 bg-gray-50/30 shadow-sm focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 border p-4 font-mono text-sm transition-all duration-300 resize-y"
                      placeholder="Type or paste your essay here..."
                      value={essayContent}
                      onChange={(e) => setEssayContent(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">
                      1. Task/Question Images
                    </label>
                    <div className="group mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-200 border-dashed rounded-2xl hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-300 cursor-pointer relative overflow-hidden">
                      <div className="space-y-2 text-center relative z-10">
                        <div className="mx-auto h-12 w-12 text-gray-300 group-hover:text-blue-500 transition-colors duration-300 flex items-center justify-center bg-gray-50 group-hover:bg-white rounded-full">
                          <svg className="h-8 w-8" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div className="flex text-sm text-gray-600 justify-center">
                          <label className="relative cursor-pointer rounded-md font-semibold text-blue-600 hover:text-blue-500 focus-within:outline-none">
                            <span>Upload files</span>
                            <input type="file" className="sr-only" accept="image/*" multiple onChange={handleFileChange(setQuestionImages)} />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        {questionImages.length > 0 && (
                          <div className="mt-2 text-center animate-fade-in">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {questionImages.length} files selected
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2 ml-1">
                      2. Essay Images
                    </label>
                    <div className="group mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-200 border-dashed rounded-2xl hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-300 cursor-pointer relative overflow-hidden">
                      <div className="space-y-2 text-center relative z-10">
                        <div className="mx-auto h-12 w-12 text-gray-300 group-hover:text-blue-500 transition-colors duration-300 flex items-center justify-center bg-gray-50 group-hover:bg-white rounded-full">
                          <svg className="h-8 w-8" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div className="flex text-sm text-gray-600 justify-center">
                          <label className="relative cursor-pointer rounded-md font-semibold text-blue-600 hover:text-blue-500 focus-within:outline-none">
                            <span>Upload files</span>
                            <input type="file" className="sr-only" accept="image/*" multiple onChange={handleFileChange(setEssayImages)} />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        {essayImages.length > 0 && (
                          <div className="mt-2 text-center animate-fade-in">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {essayImages.length} files selected
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {error}
                </div>
              )}

              <div className="mt-8">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full flex items-center justify-center py-4 px-6 border border-transparent rounded-2xl shadow-lg text-base font-bold text-white transition-all duration-300 transform ${isLoading
                    ? 'bg-blue-400 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/40 hover:-translate-y-1 active:scale-[0.98]'
                    }`}
                >
                  {isLoading ? 'Analyzing Essay...' : 'Start AI Grading'}
                </button>
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN: RESULTS */}
          <div className="space-y-0 sm:space-y-6 mt-4 sm:mt-0 pb-12 sm:pb-0">
            {/* The result container needs 'print-only-content' class for CSS filtering during print */}
            <div className={`print-only-content bg-white sm:rounded-3xl shadow-none sm:shadow-lg sm:shadow-gray-200/50 border-t sm:border border-gray-100 h-full min-h-[500px] flex flex-col result-container transition-all ${!result && !isLoading ? 'justify-center items-center' : ''}`}>

              {!result && !isLoading && (
                <div className="text-center p-10 animate-fade-in">
                  <div className="bg-gray-50 h-28 w-28 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-800">Ready to Grade</h3>
                  <p className="text-gray-400 max-w-xs mt-3 px-4 mx-auto leading-relaxed">
                    Enter details in the left panel and click start to receive comprehensive AI feedback.
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center p-12 animate-fade-in">
                  <div className="relative w-24 h-24 mb-8">
                    <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-blue-50 rounded-full"></div>
                    <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-blue-600 rounded-full animate-spin border-t-transparent shadow-lg shadow-blue-500/30"></div>
                  </div>
                  <h3 className="text-xl font-bold text-gray-800">Analyzing Essay...</h3>
                  <p className="text-gray-500 mt-2">Connecting to Gemini 3.0</p>
                </div>
              )}

              {result && (
                <div className="flex flex-col h-full animate-slide-up">
                  <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 sm:rounded-t-3xl flex flex-wrap gap-3 justify-between items-center no-print">
                    <h3 className="font-bold text-green-800 flex items-center">
                      <span className="bg-green-100 p-1.5 rounded-lg mr-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                      Grading Complete
                    </h3>
                    <div className="flex space-x-3">
                      <button
                        onClick={handleDownloadMD}
                        className="text-xs font-bold bg-white text-blue-600 px-4 py-2 rounded-xl border border-blue-100 hover:bg-blue-50 hover:border-blue-200 shadow-sm transition-all flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Save .md
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="text-xs font-bold bg-white text-green-600 px-4 py-2 rounded-xl border border-green-100 hover:bg-green-50 hover:border-green-200 shadow-sm transition-all flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        PDF
                      </button>
                    </div>
                  </div>
                  {/* Markdown Display Area */}
                  <div className="p-6 sm:p-10 overflow-y-auto max-h-[800px] prose prose-slate prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-blue-600 prose-strong:text-slate-900 prose-sm sm:prose-base max-w-none result-content scroll-smooth">
                    <div dangerouslySetInnerHTML={getMarkdownText(result)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Transcription Floating Button */}
      {transcription && (
        <>
          <button
            onClick={() => setShowTranscription(!showTranscription)}
            className="fixed bottom-8 right-8 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white p-4 rounded-full shadow-2xl hover:shadow-amber-500/50 transform hover:scale-110 active:scale-95 transition-all duration-300 z-30 no-print"
            title="View Transcription"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>

          {/* Transcription Modal */}
          {showTranscription && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40 animate-fade-in no-print">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-slide-up">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800">Original Text Transcription</h3>
                    <p className="text-sm text-gray-500 mt-1">Transcribed from uploaded images</p>
                  </div>
                  <button
                    onClick={() => setShowTranscription(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <pre className="whitespace-pre-wrap text-gray-700 font-mono text-sm leading-relaxed">{transcription}</pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};