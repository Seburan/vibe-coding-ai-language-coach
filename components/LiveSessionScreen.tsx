import React, { useState, useRef, useEffect, useCallback } from 'react';
// FIX: The 'LiveSession' type is not exported from '@google/genai'. It has been removed
// from this import and replaced with a local interface. The 'Blob' type has been
// added for use in that interface.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { UserSettings, ChatMessage, Speaker } from '../types';
import { PlayIcon, StopIcon, RepeatIcon, SubtitlesIcon, EndSessionIcon, PauseIcon } from './Icons';
import { decode, decodeAudioData, createBlob } from '../services/audioUtils';

interface LiveSessionScreenProps {
    userSettings: UserSettings;
    history: ChatMessage[];
    onSessionEnd: (finalHistory: ChatMessage[]) => void;
}

// FIX: Define a local LiveSession interface as it's not exported from the library.
// This interface is based on the usage of the session object within this component.
interface LiveSession {
    close: () => void;
    sendRealtimeInput: (input: { media: Blob }) => void;
}

interface ConversationSegment {
    id: number;
    messages: ChatMessage[];
    feedback?: string;
    isLoadingFeedback?: boolean;
}

const CONVERSATION_SEGMENT_LENGTH = 4; // 2 user + 2 coach turns

const LiveSessionScreen: React.FC<LiveSessionScreenProps> = ({ userSettings, history, onSessionEnd }) => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Click Start to begin');
    
    const [conversationSegments, setConversationSegments] = useState<ConversationSegment[]>(() => {
        if (!history || history.length === 0) {
            return [{ id: Date.now(), messages: [] }];
        }

        const segments: ConversationSegment[] = [];
        let currentSegment: ConversationSegment = { id: 0, messages: [] };

        history.forEach((msg, index) => {
            if (msg.isFeedback) {
                currentSegment.feedback = msg.text;
                segments.push(currentSegment);
                currentSegment = { id: index + 1, messages: [] };
            } else {
                currentSegment.messages.push(msg);
            }
        });

        if (currentSegment.messages.length > 0) {
            segments.push(currentSegment);
        }
        
        segments.push({ id: Date.now(), messages: [] });
        return segments;
    });

    const [showSubtitles, setShowSubtitles] = useState(true);

    const sessionRef = useRef<LiveSession | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const lastSpokenAudioBuffer = useRef<AudioBuffer | null>(null);

    const currentInputTranscriptionRef = useRef('');
    const userSegmentResponses = useRef<string[]>([]);
    const turnCounter = useRef(0);
    const chatViewRef = useRef<HTMLDivElement>(null);
    
    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    const isLoadingFeedback = conversationSegments[conversationSegments.length - 1]?.isLoadingFeedback || false;
    const isLoadingFeedbackRef = useRef(isLoadingFeedback);
    useEffect(() => { isLoadingFeedbackRef.current = isLoadingFeedback; }, [isLoadingFeedback]);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    useEffect(() => {
        if (chatViewRef.current) {
            chatViewRef.current.scrollTop = chatViewRef.current.scrollHeight;
        }
    }, [conversationSegments]);

    const handleMessage = async (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setConversationSegments(prev => {
                const newSegments = [...prev];
                const lastSegment = newSegments[newSegments.length - 1];
                const lastMessage = lastSegment.messages[lastSegment.messages.length - 1];

                if (lastMessage && lastMessage.speaker === Speaker.Coach && !lastMessage.isFeedback) {
                    lastMessage.text += text;
                } else {
                    lastSegment.messages.push({ speaker: Speaker.Coach, text });
                }
                return newSegments;
            });
        }

        if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            currentInputTranscriptionRef.current += text;
        }

        if (message.serverContent?.turnComplete) {
            const userText = currentInputTranscriptionRef.current.trim();
            if (userText) {
                setConversationSegments(prev => {
                    const newSegments = [...prev];
                    const lastSegment = newSegments[newSegments.length - 1];
                    lastSegment.messages.push({ speaker: Speaker.User, text: userText });
                    return newSegments;
                });
                userSegmentResponses.current.push(userText);
            }
            currentInputTranscriptionRef.current = '';
            turnCounter.current += 1;
            if (turnCounter.current >= CONVERSATION_SEGMENT_LENGTH) {
                await getFeedback();
            }
        }

        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio && outputAudioContextRef.current) {
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                lastSpokenAudioBuffer.current = audioBuffer;
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            } catch(e) { console.error("Error playing audio: ", e) }
        }
    };

    const getFeedback = useCallback(async () => {
        if (userSegmentResponses.current.length === 0 || isLoadingFeedbackRef.current) return;
        
        setStatusMessage("Coach is preparing feedback...");
        const segmentIdToUpdate = conversationSegments[conversationSegments.length - 1].id;
        
        setConversationSegments(prev => prev.map(seg => 
            seg.id === segmentIdToUpdate ? { ...seg, isLoadingFeedback: true } : seg
        ));

        const responsesToReview = [...userSegmentResponses.current];
        userSegmentResponses.current = [];
        turnCounter.current = 0;

        const prompt = `As a language coach, review the following responses from a ${userSettings.skillLevel} ${userSettings.targetLanguage} learner whose native language is ${userSettings.nativeLanguage}. The user said: "${responsesToReview.join('", "')}". Provide concise, actionable feedback on grammar, phrasing, and word choice in a friendly and encouraging tone. Focus on the most important corrections. Present the feedback in clear bullet points.`;
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            const feedbackText = response.text;
             setConversationSegments(prev => {
                const updatedSegments = prev.map(seg =>
                    seg.id === segmentIdToUpdate ? { ...seg, feedback: feedbackText, isLoadingFeedback: false } : seg
                );
                return [...updatedSegments, { id: Date.now(), messages: [] }];
            });
        } catch (error) {
            console.error("Error getting feedback:", error);
            const errorMessage = "Sorry, I couldn't generate feedback right now.";
             setConversationSegments(prev => {
                const updatedSegments = prev.map(seg =>
                    seg.id === segmentIdToUpdate ? { ...seg, feedback: errorMessage, isLoadingFeedback: false } : seg
                );
                return [...updatedSegments, { id: Date.now(), messages: [] }];
            });
        } finally {
            setStatusMessage("Ready for next segment.");
        }
    }, [ai.models, conversationSegments, userSettings]);

    const startSession = async () => {
        if (isSessionActive) return;

        try {
            setStatusMessage('Connecting...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            if (isPausedRef.current || isLoadingFeedbackRef.current) return;

                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                        setIsSessionActive(true);
                        setStatusMessage('Connected. Start speaking!');
                    },
                    onmessage: handleMessage,
                    onerror: (e) => {
                        console.error('Session error:', e);
                        setStatusMessage('Session error. Please try again.');
                        stopSession(false);
                    },
                    onclose: () => {
                       stream.getTracks().forEach(track => track.stop());
                       inputAudioContext.close();
                       if (outputAudioContextRef.current) {
                           outputAudioContextRef.current.close();
                       }
                       setIsSessionActive(false);
                       setStatusMessage('Session closed.');
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                    systemInstruction: `You are a friendly and patient ${userSettings.targetLanguage} language coach. Your student is a ${userSettings.skillLevel} speaker whose native language is ${userSettings.nativeLanguage}. Start a simple conversation and ask questions. Keep your responses short and clear.`,
                },
            });
            
            const session = await sessionPromise;
            sessionRef.current = session;
        } catch (error) {
            console.error('Failed to start session:', error);
            setStatusMessage('Could not start session. Check microphone permissions.');
        }
    };

    const stopSession = useCallback(async (shouldGetFinalFeedback = true) => {
        if (shouldGetFinalFeedback && userSegmentResponses.current.length > 0) {
            await getFeedback();
        }
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        setIsSessionActive(false);
        setIsPaused(false);
    }, [getFeedback]);

    const handleEndSessionClick = async () => {
        await stopSession(true);
        const finalHistory: ChatMessage[] = conversationSegments.reduce((acc, segment) => {
            acc.push(...segment.messages);
            if (segment.feedback) {
                acc.push({ speaker: Speaker.System, text: segment.feedback, isFeedback: true });
            }
            return acc;
        }, [] as ChatMessage[]).filter(m => m.text); // Filter out empty messages
        onSessionEnd(finalHistory);
    };

    const handlePauseToggle = () => {
        if (!isSessionActive) return;
        const newPausedState = !isPaused;
        setIsPaused(newPausedState);
        setStatusMessage(newPausedState ? 'Session paused.' : 'Resumed. Speak now!');
    };

    const repeatLastAudio = () => {
        if (lastSpokenAudioBuffer.current && outputAudioContextRef.current) {
            const ctx = outputAudioContextRef.current;
            const source = ctx.createBufferSource();
            source.buffer = lastSpokenAudioBuffer.current;
            source.connect(ctx.destination);
            source.start(0);
        }
    };
    
    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-800 rounded-2xl shadow-2xl p-6">
            <div className="flex-shrink-0 flex justify-between items-center mb-4 border-b border-gray-700 pb-4">
                <h2 className="text-2xl font-bold text-cyan-400">Live Practice Session</h2>
                <div className="flex items-center space-x-2">
                    <button onClick={() => setShowSubtitles(!showSubtitles)} className={`p-2 rounded-full transition ${showSubtitles ? 'bg-cyan-500' : 'bg-gray-600 hover:bg-gray-500'}`} title={showSubtitles ? "Hide Subtitles" : "Show Subtitles"}><SubtitlesIcon /></button>
                    <button onClick={repeatLastAudio} disabled={!isSessionActive} className="p-2 bg-gray-600 hover:bg-gray-500 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed" title="Repeat Last Question"><RepeatIcon /></button>
                </div>
            </div>

            {/* Chat View */}
            <div ref={chatViewRef} className="flex-grow overflow-y-auto mb-4 pr-2 space-y-8">
                {conversationSegments.map((segment) => (
                    (segment.messages.length > 0 || segment.feedback || segment.isLoadingFeedback) && (
                        <div key={segment.id} className="flex gap-6">
                            {/* Messages Column */}
                            <div className="w-2/3 space-y-4">
                                {segment.messages.map((msg, index) => {
                                    const isCoach = msg.speaker === Speaker.Coach;
                                    const showText = isCoach ? showSubtitles : true;

                                    return (
                                        <div key={index} className={`flex items-end gap-3 ${isCoach ? 'justify-start' : 'justify-end'}`}>
                                            <div className={`max-w-xl p-3 rounded-2xl ${isCoach ? 'bg-gray-600 rounded-bl-none' : 'bg-cyan-600 rounded-br-none'}`}>
                                                {showText && <p className="text-base">{msg.text}</p>}
                                                {!showText && <p className="text-base italic text-gray-400">[Audio only]</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Feedback Column */}
                            <div className="w-1/3">
                                {segment.feedback && (
                                    <div className="bg-gray-700 p-4 rounded-lg border-l-4 border-yellow-400 h-full">
                                        <h4 className="font-bold text-yellow-400 mb-2">Feedback</h4>
                                        <div className="text-gray-200 whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: segment.feedback.replace(/\n/g, '<br />') }} />
                                    </div>
                                )}
                                {segment.isLoadingFeedback && (
                                    <div className="flex justify-center items-center h-full p-4">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                ))}
            </div>


            {/* Controls */}
            <div className="flex-shrink-0 text-center">
                <p className="text-gray-400 mb-4 h-6">{statusMessage}</p>
                <div className="flex justify-center items-center space-x-4">
                     <button onClick={handleEndSessionClick} className="flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105" title="End Session">
                        <EndSessionIcon className="w-6 h-6 mr-2" />
                        End
                    </button>
                    
                    {!isSessionActive ? (
                        <button onClick={startSession} className="flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-xl transition-transform transform hover:scale-105" title="Start Session">
                           <PlayIcon className="w-8 h-8 mr-2"/> Start
                        </button>
                    ) : (
                        <button onClick={handlePauseToggle} className={`flex items-center justify-center font-bold py-4 px-8 rounded-full text-xl transition-transform transform hover:scale-105 ${isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`} title={isPaused ? "Resume Session" : "Pause Session"}>
                           {isPaused ? <PlayIcon className="w-8 h-8 mr-2"/> : <PauseIcon className="w-8 h-8 mr-2"/>}
                           {isPaused ? 'Resume' : 'Pause'}
                        </button>
                    )}

                     <button onClick={getFeedback} disabled={!isSessionActive || isLoadingFeedback} className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" title="Get Feedback Now">
                        <StopIcon className="w-6 h-6 mr-2" />
                        Feedback
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LiveSessionScreen;