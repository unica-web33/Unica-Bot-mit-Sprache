
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, LiveSession, LiveServerMessage, Modality } from '@google/genai';
import { Header } from './components/Header';
import { ChatInput } from './components/ChatInput';
import { ChatMessage } from './components/ChatMessage';
import { Message, Role } from './types';
import { SYSTEM_INSTRUCTION, QUICK_REPLIES, CTA_MESSAGE, CONTACT_DETAILS } from './constants';
import { QuickReplyButtons } from './components/QuickReplyButtons';
import { MicrophoneIcon } from './components/icons/MicrophoneIcon';
import { SendIcon } from './components/icons/SendIcon';
import { LoadingSpinner } from './components/icons/LoadingSpinner';

// --- Audio Utility Functions ---
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface MediaBlob {
  data: string;
  mimeType: string;
}

function createBlob(data: Float32Array): MediaBlob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}
// --- End Audio Utility Functions ---


const App: React.FC = () => {
  const [mode, setMode] = useState<'start' | 'text' | 'voice'>('start');
  const [messages, setMessages] = useState<Message[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [ctaSent, setCtaSent] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);

  // Text mode state
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  
  // Voice mode state
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const chatRef = useRef<Chat | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Audio refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const resetChatState = () => {
    setMessages([
      { role: Role.Model, content: "Willkommen bei UNICA! 👋" },
      { role: Role.Model, content: "Ich bin deine KI-Assistentin. Du kannst dich mit mir auf Deutsch und vielen weiteren Sprachen unterhalten. Wie kann ich dir helfen?" }
    ]);
    setTurnCount(0);
    setCtaSent(false);
    setIsLoading(false);
    setShowQuickReplies(true);
    setIsConnecting(false);
    setIsConnected(false);
    setIsBotSpeaking(false);
  };
  
  const handleSelectMode = (selectedMode: 'text' | 'voice') => {
    resetChatState();
    if (selectedMode === 'text') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
    }
    setMode(selectedMode);
  };

  const handleGoBack = () => {
    stopConversation();
    setMode('start');
  };

  const sendCtaMessage = useCallback(() => {
    if (!ctaSent) {
      setTimeout(() => {
        setMessages(prev => [...prev, 
          { role: Role.Model, content: CTA_MESSAGE },
          { role: Role.Model, content: CONTACT_DETAILS }
        ]);
        setCtaSent(true);
      }, 500);
    }
  }, [ctaSent]);

  // --- Text Chat Logic ---
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    setShowQuickReplies(false);
    setIsLoading(true);
    const newUserMessage: Message = { role: Role.User, content: text };
    setMessages(prev => [...prev, newUserMessage]);
    
    const newTurnCount = turnCount + 1;
    setTurnCount(newTurnCount);

    try {
      if (chatRef.current) {
        const result = await chatRef.current.sendMessage({ message: text });
        const responseText = result.text;
        if (responseText) {
            setMessages(prev => [...prev, { role: Role.Model, content: responseText }]);
        }
        if (newTurnCount >= 4) {
          sendCtaMessage();
        }
      }
    } catch (error)
{
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, { role: Role.Model, content: "Entschuldigung, da ist etwas schiefgelaufen. Bitte versuche es erneut." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Voice Chat Logic ---
  const stopMicrophone = () => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamSourceRef.current = null;
    mediaStreamRef.current = null;
  };

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);
    stopMicrophone();
    for (const source of outputSourcesRef.current.values()) {
        source.stop();
    }
    outputSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    sessionPromiseRef.current = null;
  }, []);

  const startConversation = async () => {
    setIsConnecting(true);
    resetChatState();

    try {
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {} },
        callbacks: {
          onopen: () => {
            if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
            setIsConnecting(false);
            setIsConnected(true);
            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current.onaudioprocess = (e) => sessionPromiseRef.current?.then((s) => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsBotSpeaking(true);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              source.addEventListener('ended', () => {
                outputSourcesRef.current.delete(source);
                if (outputSourcesRef.current.size === 0) {
                    setIsBotSpeaking(false);
                }
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              outputSourcesRef.current.add(source);
            }
            if (message.serverContent?.inputTranscription) {
                currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
                currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.turnComplete) {
                const userInput = currentInputTranscriptionRef.current.trim();
                const modelOutput = currentOutputTranscriptionRef.current.trim();
                
                const newMessages: Message[] = [];
                if (userInput) {
                    newMessages.push({ role: Role.User, content: userInput });
                }
                if (modelOutput) {
                    newMessages.push({ role: Role.Model, content: modelOutput });
                }
                
                if (newMessages.length > 0) {
                    setMessages(prev => [...prev, ...newMessages]);
                }
                
                if (userInput) {
                    setTurnCount(prevTurnCount => {
                        const newTurnCount = prevTurnCount + 1;
                        if (newTurnCount >= 4) {
                            sendCtaMessage();
                        }
                        return newTurnCount;
                    });
                }
                
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            }
          },
          onerror: (e: Error) => { console.error('Session error:', e); handleDisconnect(); },
          onclose: () => handleDisconnect(),
        },
      });
    } catch (error) {
      console.error("Error starting conversation:", error);
      setIsConnecting(false);
    }
  };

  const stopConversation = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close());
    }
    handleDisconnect();
  };

  const handleToggleConversation = () => {
    if (isConnected) stopConversation();
    else if (!isConnecting) startConversation();
  };

  // --- Download Chat ---
  const handleDownload = () => {
    const formattedChat = messages
      .map(msg => `${msg.role === Role.User ? 'Du' : 'UNICA'}: ${msg.content}`)
      .join('\n\n');
    const blob = new Blob([formattedChat], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unica-chat-verlauf.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // --- Render Logic ---
  if (mode === 'start') {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center font-sans">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Wie möchtest du kommunizieren?</h2>
            <p className="text-gray-600 mb-8">Wähle deine bevorzugte Methode, um mit unserem KI-Support zu interagieren.</p>
            <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => handleSelectMode('text')} className="flex items-center justify-center gap-3 px-6 py-3 bg-[#343541] text-white rounded-lg shadow-md hover:bg-black transition-colors">
                    <SendIcon className="h-5 w-5" />
                    Per Text schreiben
                </button>
                <button onClick={() => handleSelectMode('voice')} className="flex items-center justify-center gap-3 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg shadow-md hover:bg-gray-300 transition-colors">
                    <MicrophoneIcon className="h-5 w-5" />
                    Per Sprache sprechen
                </button>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen bg-white font-sans antialiased">
      <Header onBack={handleGoBack} onDownload={handleDownload} />
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} isBotSpeaking={isBotSpeaking && msg.role === Role.Model} />
        ))}
        {mode === 'text' && showQuickReplies && (
            <QuickReplyButtons replies={QUICK_REPLIES} onSelect={handleSendMessage} />
        )}
        {mode === 'text' && isLoading && (
            <div className="flex justify-start"><div className="bg-gray-200 rounded-lg p-4 text-gray-800 animate-pulse">...</div></div>
        )}
      </div>
      <div className="p-4 bg-white border-t border-gray-200">
        {mode === 'text' ? (
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
        ) : (
          <div className="flex flex-col items-center">
            <button onClick={handleToggleConversation} disabled={isConnecting} className="p-4 rounded-full transition-all duration-200" aria-label={isConnected ? "Gespräch beenden" : "Gespräch starten"}>
              {isConnecting ? <LoadingSpinner className="h-8 w-8 text-gray-500" /> : <MicrophoneIcon className={`h-8 w-8 ${isConnected ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} />}
            </button>
          </div>
        )}
         <p className="text-center text-xs text-gray-400 mt-3">
          <a href="https://unica-marketing.de/datenschutzerklaerung" target="_blank" rel="noopener noreferrer" className="hover:underline">Datenschutzerklärung</a>
        </p>
      </div>
    </div>
  );
};

export default App;
