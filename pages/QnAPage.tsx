import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { answerQuestionFromPdf, generateSpeech } from '../services/geminiService';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import ResultDisplay from '../components/ResultDisplay';
import { MicrophoneIcon, PlayIcon, PauseIcon } from '../components/Icons';
import { decode, decodeAudioData } from '../utils/audio';

// @ts-ignore
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
}

const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const QnAPage: React.FC = () => {
    const { pdfText, pdfFileName } = useAnalysis();
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Audio Player State
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const playbackRates = [1, 1.25, 1.5, 1.75, 2];

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const wasPlayingBeforeSeekRef = useRef(false);
    const startTimeRef = useRef(0); // Position within the audio buffer
    const contextStartTimeRef = useRef(0); // Start time from the AudioContext's clock

    // Effect for handling speech recognition events
    useEffect(() => {
        if (!recognition) return;
        
        const handleResult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setQuestion(transcript);
        };
        const handleError = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech') setError(STRINGS.speechRecognitionNoSpeech);
            else setError(STRINGS.speechRecognitionGenericError);
            setIsListening(false);
        };
        const handleEnd = () => setIsListening(false);
        const handleStart = () => setIsListening(true);
        
        recognition.addEventListener('result', handleResult);
        recognition.addEventListener('error', handleError);
        recognition.addEventListener('start', handleStart);
        recognition.addEventListener('end', handleEnd);

        return () => {
            recognition.removeEventListener('result', handleResult);
            recognition.removeEventListener('error', handleError);
            recognition.removeEventListener('start', handleStart);
            recognition.removeEventListener('end', handleEnd);
        };
    }, []);

    const cleanupAudio = useCallback(() => {
        if (audioSourceRef.current) {
            audioSourceRef.current.onended = null;
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    // Cleanup audio resources on component unmount
    useEffect(() => {
        return cleanupAudio;
    }, [cleanupAudio]);

    const play = useCallback((resumeTime: number) => {
        if (!audioBuffer || !audioContextRef.current) return;
        
        if (audioSourceRef.current) cleanupAudio();

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;
        source.connect(audioContextRef.current.destination);
        
        startTimeRef.current = resumeTime;
        contextStartTimeRef.current = audioContextRef.current.currentTime;
        
        source.start(0, resumeTime);
        audioSourceRef.current = source;
        setIsPlaying(true);
        
        source.onended = () => {
            if (isPlaying) { // Only if it ended naturally
                cleanupAudio();
                setCurrentTime(duration);
                startTimeRef.current = 0;
            }
        };

        const updateProgress = () => {
            if (!isPlaying || isSeeking || !audioSourceRef.current || !audioContextRef.current) return;
            
            const elapsed = (audioContextRef.current.currentTime - contextStartTimeRef.current) * playbackRate;
            const newCurrentTime = Math.min(startTimeRef.current + elapsed, duration);
            setCurrentTime(newCurrentTime);
            
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        };
        
        animationFrameRef.current = requestAnimationFrame(updateProgress);

    }, [audioBuffer, cleanupAudio, duration, isPlaying, isSeeking, playbackRate]);

    const pause = useCallback(() => {
        if (!isPlaying || !audioContextRef.current) return;
        const elapsed = (audioContextRef.current.currentTime - contextStartTimeRef.current) * playbackRate;
        startTimeRef.current = Math.min(startTimeRef.current + elapsed, duration);
        cleanupAudio();
    }, [cleanupAudio, duration, isPlaying, playbackRate]);

    const handleMicClick = () => {
        if (!recognition) {
            setError("Speech recognition is not supported by your browser.");
            return;
        }
        if (isListening) {
            recognition.stop();
        } else {
            setQuestion('');
            setAnswer(null);
            setAudioBuffer(null);
            setError(null);
            recognition.start();
        }
    };
    
    const handleAsk = async () => {
        if (!pdfText || !question) return;

        setIsLoading(true);
        setError(null);
        setAnswer(null);
        setAudioBuffer(null);
        cleanupAudio();
        setCurrentTime(0);
        setDuration(0);
        startTimeRef.current = 0;

        try {
            const textAnswer = await answerQuestionFromPdf(pdfText, question);
            setAnswer(textAnswer);
            setIsLoading(false);

            if (textAnswer && textAnswer.trim() && !textAnswer.includes("not available in the provided document")) {
                setIsGeneratingAudio(true);
                const audioData = await generateSpeech(textAnswer);

                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                }
                const audioCtx = audioContextRef.current;
                 if (audioCtx.state === 'suspended') await audioCtx.resume();
                
                const decodedBytes = decode(audioData);
                const buffer = await decodeAudioData(decodedBytes, audioCtx, 24000, 1);
                setAudioBuffer(buffer);
                setDuration(buffer.duration);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : STRINGS.errorOccurred);
            setIsLoading(false);
        } finally {
            setIsGeneratingAudio(false);
        }
    };
    
    const togglePlayPause = () => {
        if (isPlaying) {
            pause();
        } else {
            const resumeTime = currentTime >= duration - 0.1 ? 0 : currentTime;
            play(resumeTime);
        }
    };

    const handleSeekMouseDown = () => {
        wasPlayingBeforeSeekRef.current = isPlaying;
        setIsSeeking(true);
        if (isPlaying) pause();
    };

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        setCurrentTime(newTime);
    };

    const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
        const newTime = parseFloat((e.target as HTMLInputElement).value);
        startTimeRef.current = newTime;
        if (wasPlayingBeforeSeekRef.current) {
            play(newTime);
        }
        setIsSeeking(false);
    };
    
    const toggleSpeed = () => {
        const currentIndex = playbackRates.indexOf(playbackRate);
        const nextIndex = (currentIndex + 1) % playbackRates.length;
        const newRate = playbackRates[nextIndex];
        setPlaybackRate(newRate);
        if (isPlaying) {
            // Re-start playback with new rate to take effect immediately
            pause();
            play(startTimeRef.current);
        }
    };

    if (!pdfText) {
        return (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
                <svg className="w-16 h-16 mb-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="text-lg font-semibold text-slate-200">{STRINGS.pleaseAnalyzeFirst}</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-2xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-center mb-4 text-slate-200">{STRINGS.qnaPage}</h2>
                <p className="text-center text-sm text-slate-400 mb-6">{STRINGS.comparedWith} <span className="font-semibold">{pdfFileName}</span></p>

                <div className="relative">
                    <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder={isListening ? STRINGS.listening : STRINGS.askAnything}
                        className="w-full h-32 p-3 pr-12 border border-slate-600 rounded-lg bg-slate-700/50 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors text-slate-200 resize-none"
                        aria-label="Ask a question"
                        disabled={isListening}
                    />
                    <button
                        onClick={handleMicClick}
                        title={STRINGS.speakButtonTitle}
                        className={`absolute top-3 right-3 p-2 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-800 ${isListening ? 'bg-red-500/50 text-red-300 animate-pulse' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        disabled={!recognition}
                    >
                        <MicrophoneIcon className="w-5 h-5" />
                    </button>
                </div>

                <button
                    onClick={handleAsk}
                    disabled={!question || isLoading || isListening}
                    className="mt-6 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-900"
                >
                    {isLoading ? STRINGS.asking : STRINGS.askButton}
                </button>
                
                {error && <p className="mt-4 text-center text-red-400">{error}</p>}
            </div>
            
            {isLoading && !answer && <div className="mt-8"><Loader text={STRINGS.asking} /></div>}

            <ResultDisplay title={STRINGS.answerTitle} content={answer}>
                {isGeneratingAudio && (
                     <div className="flex items-center gap-2 mt-4 px-3 py-1.5 text-xs font-medium text-slate-400">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Generating audio...</span>
                    </div>
                )}
                 {audioBuffer && !isGeneratingAudio && (
                    <div className="mt-4 p-3 bg-slate-700/50 rounded-lg flex items-center gap-4 w-full max-w-md">
                        <button 
                            onClick={togglePlayPause} 
                            className="p-2 rounded-full bg-sky-600 text-white hover:bg-sky-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-800"
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                        </button>
                        <div className="flex-grow flex items-center gap-2">
                            <span className="text-xs text-slate-400 w-10 text-center">{formatTime(currentTime)}</span>
                            <input
                                type="range"
                                min="0"
                                max={duration || 1}
                                step="0.1"
                                value={currentTime}
                                onMouseDown={handleSeekMouseDown}
                                onChange={handleSeekChange}
                                onMouseUp={handleSeekMouseUp}
                                className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-sky-500 [&::-webkit-slider-thumb]:rounded-full"
                                aria-label="Audio progress"
                            />
                            <span className="text-xs text-slate-400 w-10 text-center">{formatTime(duration)}</span>
                        </div>
                         <button
                            onClick={toggleSpeed}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-600 text-slate-200 rounded-full hover:bg-slate-500 transition-colors w-14 text-center"
                            aria-label={`Change playback speed. Current speed: ${playbackRate}x`}
                         >
                            {playbackRate}x
                        </button>
                    </div>
                )}
            </ResultDisplay>
        </div>
    );
};

export default QnAPage;