
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Activity, Command, RotateCcw, RotateCw, Home, ChevronLeft, Cpu, Layers, Maximize2, Image as ImageIcon, Download, Mic, MicOff, Zap, Globe, Key } from 'lucide-react';
import ImageViewer from './components/ImageViewer';
import UploadZone from './components/UploadZone';
import LogPanel from './components/LogPanel';
import { editImage } from './services/geminiService';
import { LiveClient } from './services/liveClient';
import { AppState, ImageHistoryItem, LogEntry, Language } from './types';

const TRANSLATIONS = {
  am: {
    home: "መነሻ",
    undo: "ተመለስ",
    redo: "ወደፊት",
    save: "አስቀምጥ",
    layers: "ንብርብሮች",
    processing: "በማስኬድ ላይ...",
    ready: "ዝግጁ",
    placeholder_empty: "ምስል ይምረጡ...",
    placeholder_active: "ማሻሻያዎችን ይግለጹ...",
    enhance: "አሻሽል",
    working: "እየሰራ ነው",
    suggestions: ["ጥራት ጨምር", "ዳራውን አስወግድ", "ሳይበርፓንክ ቅጥ", "ጥቁር እና ነጭ", "የድሮ ፎቶ"]
  },
  en: {
    home: "Home",
    undo: "Undo",
    redo: "Redo",
    save: "Save",
    layers: "Layers",
    processing: "Processing...",
    ready: "Ready",
    placeholder_empty: "Select an image...",
    placeholder_active: "Describe changes...",
    enhance: "Enhance",
    working: "Working",
    suggestions: ["Enhance Quality", "Remove Background", "Cyberpunk Style", "Black & White", "Retro Photo"]
  }
};

const App: React.FC = () => {
  // Init State
  const [hasApiKey, setHasApiKey] = useState(false);

  // App Logic State
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<ImageHistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(true);
  const [language, setLanguage] = useState<Language>('am');
  
  // Live Mode States
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveCaption, setLiveCaption] = useState<{text: string, source: 'user' | 'model'} | null>(null);
  const liveClientRef = useRef<LiveClient | null>(null);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = TRANSLATIONS[language];

  // Check API Key on mount
  useEffect(() => {
      const checkKey = async () => {
          if (window.aistudio && window.aistudio.hasSelectedApiKey) {
              const hasKey = await window.aistudio.hasSelectedApiKey();
              setHasApiKey(hasKey);
          } else {
              // If running outside of specific AI Studio context, assume key is present in env
              setHasApiKey(true);
          }
      };
      checkKey();
  }, []);

  const handleConnectApiKey = async () => {
      if (window.aistudio) {
          await window.aistudio.openSelectKey();
          // Optimistically update, or recheck. For better UX we assume success or the loop repeats.
          setHasApiKey(true);
      }
  };

  // Helper to add log
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        message,
        type,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    };
    setLogs(prev => [entry, ...prev].slice(0, 50)); 
  }, []);

  // Initial boot sequence
  useEffect(() => {
    if (hasApiKey) {
        addLog("System Initialized: በቃል Photo Editor", 'info');
        setTimeout(() => addLog("ግንኙነት ተፈጥሯል: ዝግጁ", 'success'), 800);
    }
    
    // Cleanup on unmount
    return () => {
        if (liveClientRef.current) {
            liveClientRef.current.disconnect();
        }
        if (captionTimeoutRef.current) {
            clearTimeout(captionTimeoutRef.current);
        }
    };
  }, [hasApiKey, addLog]);

  // Update Live Client with new image when image changes
  useEffect(() => {
      if (isLiveMode && currentImage && liveClientRef.current) {
          liveClientRef.current.sendImageFrame(currentImage);
          addLog("Live Context Updated: Image Sent", 'info');
      }
  }, [currentImage, isLiveMode, addLog]);


  const toggleLiveMode = async () => {
    if (isLiveMode) {
        // Stop Live Mode
        if (liveClientRef.current) {
            await liveClientRef.current.disconnect();
            liveClientRef.current = null;
        }
        setIsLiveMode(false);
        setLiveCaption(null);
        addLog("Live Session Ended", 'warning');
    } else {
        // Start Live Mode
        setIsConnecting(true);
        addLog("Connecting to Tigist (Live Agent)...", 'info');
        
        try {
            const client = new LiveClient({
                onOpen: () => {
                    setIsConnecting(false);
                    setIsLiveMode(true);
                    addLog("Tigist Connected: Say 'Eshi' to start", 'success');
                    // Send initial image if exists
                    if (currentImage) {
                        client.sendImageFrame(currentImage);
                    }
                },
                onClose: () => {
                    setIsLiveMode(false);
                    setIsConnecting(false);
                    setLiveCaption(null);
                },
                onError: (err) => {
                    addLog(`Live Error: ${err.message}`, 'error');
                    setIsConnecting(false);
                    setIsLiveMode(false);
                    setLiveCaption(null);
                },
                onTranscription: (text, source, isFinal) => {
                    // Clear any pending hide timeout
                    if (captionTimeoutRef.current) {
                        clearTimeout(captionTimeoutRef.current);
                        captionTimeoutRef.current = null;
                    }

                    if (text) {
                        setLiveCaption({ text, source });
                    }
                    
                    // Set timeout to hide caption after 2s of inactivity
                    captionTimeoutRef.current = setTimeout(() => {
                        setLiveCaption(null);
                    }, 2000);
                },
                onToolCall: async (toolCall) => {
                    if (toolCall.name === 'edit_image') {
                        const args = toolCall.args as any;
                        const editPrompt = args.prompt;
                        addLog(`Live Command: "${editPrompt}"`, 'info');
                        
                        if (currentImage) {
                             return await handleExternalEdit(currentImage, editPrompt);
                        }
                        return "No image to edit";
                    }
                }
            });
            
            await client.connect();
            liveClientRef.current = client;
            
        } catch (e) {
            console.error(e);
            setIsConnecting(false);
            addLog("Failed to start Live Session", 'error');
        }
    }
  };

  const handleImageSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target?.result as string;
        setCurrentImage(result);
        setHistory([{ id: 'original', url: result, prompt: language === 'am' ? 'የመጀመሪያ ምስል' : 'Original Image', timestamp: Date.now() }]);
        setHistoryIndex(0);
        addLog(`ተጭኗል: ${file.name}`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveImage = () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = currentImage;
    link.download = `bekal_enhance_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(language === 'am' ? "ምስሉ ተቀምጧል" : "Image Saved", 'success');
  };

  // Function to handle editing (shared by Text Input and Live Tool)
  const handleExternalEdit = async (img: string, txt: string): Promise<string> => {
      setAppState(AppState.ANALYZING);
      try {
          const enhancedImage = await editImage(img, txt);
          setCurrentImage(enhancedImage);
          
          const newItem = {
            id: Math.random().toString(36).substring(2),
            url: enhancedImage,
            prompt: txt,
            timestamp: Date.now()
          };

          setHistory(prev => {
              // Slice history up to current index to remove any "redo" paths
              const newHistory = prev.slice(0, historyIndex + 1);
              return [...newHistory, newItem];
          });
          setHistoryIndex(prev => prev + 1);

          addLog("ማሻሻያው ተጠናቅቋል", 'success');
          setAppState(AppState.IDLE);
          return "Image edited successfully";
      } catch (error: any) {
          addLog(error.message || "Edit Failed", 'error');
          setAppState(AppState.ERROR);
          setTimeout(() => setAppState(AppState.IDLE), 2000);
          return "Failed to edit image";
      }
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentImage || !prompt.trim() || appState === AppState.ANALYZING) return;

    addLog(`ትእዛዝ: "${prompt}"`, 'info');
    await handleExternalEdit(currentImage, prompt);
    setPrompt('');
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCurrentImage(history[newIndex].url);
          addLog("ወደ ቀድሞው ተመልሷል", 'warning');
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setCurrentImage(history[newIndex].url);
          addLog("ወደ ፊት ተሂዷል", 'success');
      }
  };

  const handleHome = () => {
      if (isLiveMode) toggleLiveMode();
      setCurrentImage(null);
      setHistory([]);
      setHistoryIndex(-1);
      setPrompt('');
      setAppState(AppState.IDLE);
      addLog("ሁሉም ነገር ጸድቷል", 'info');
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'am' ? 'en' : 'am');
  };

  // LANDING SCREEN (No API Key)
  if (!hasApiKey) {
      return (
          <div className="h-screen w-screen flex items-center justify-center bg-black bg-liquid-gradient overflow-hidden relative">
              <div className="absolute inset-0 bg-grid-pattern opacity-20"></div>
              
              {/* Floating Orbs */}
              <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-purple/20 rounded-full blur-[100px] animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-cyan/20 rounded-full blur-[100px] animate-pulse" style={{animationDelay: '2s'}}></div>

              <div className="relative z-10 glass-panel p-12 rounded-[3rem] flex flex-col items-center text-center max-w-md w-full border border-white/10 shadow-[0_0_50px_rgba(0,242,234,0.15)] backdrop-blur-2xl">
                   <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/10 animate-float">
                       <Sparkles size={40} className="text-accent-cyan" />
                   </div>
                   
                   <h1 className="text-4xl font-bold mb-2 tracking-tight">በቃል</h1>
                   <p className="text-sm text-white/40 uppercase tracking-[0.3em] mb-8">Neural Photo Editor</p>
                   
                   <p className="text-white/60 mb-8 leading-relaxed font-light">
                       Initialize connection to Gemini Neural Network to begin your enhancement session.
                   </p>

                   <button 
                       onClick={handleConnectApiKey}
                       className="group relative px-8 py-4 bg-white text-black rounded-full font-medium tracking-wide hover:scale-105 transition-all duration-300 flex items-center gap-3 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(0,242,234,0.5)]"
                   >
                       <Key size={18} />
                       <span>Connect Access Key</span>
                       <div className="absolute inset-0 rounded-full border border-white/50 scale-105 opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"></div>
                   </button>
                   
                   <div className="mt-8 text-[10px] text-white/20 font-mono">
                       SYSTEM STATUS: WAITING FOR AUTH
                   </div>
              </div>
          </div>
      );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-black">
        {/* BACKGROUND DECORATIONS */}
        <div className="absolute inset-0 z-0 pointer-events-none">
            <div className={`absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent-purple/20 blur-[120px] rounded-full opacity-50 animate-float ${isLiveMode ? 'animate-pulse bg-red-500/20' : ''}`}></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent-cyan/20 blur-[120px] rounded-full opacity-50 animate-float" style={{animationDelay: '3s'}}></div>
        </div>

        {/* TOP HEADER - FLOATING GLASS */}
        <header className="absolute top-4 left-0 right-0 z-50 flex justify-between items-start px-4 md:px-8 pointer-events-none">
            {/* Left: Navigation */}
            <div className="flex gap-2 md:gap-4 pointer-events-auto items-center">
                <button 
                    onClick={handleHome}
                    className="glass-button w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 group"
                    title={`${t.home} (Home)`}
                >
                    <Home size={18} className="group-hover:scale-110 transition-transform md:w-5 md:h-5" />
                </button>
                
                <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10 backdrop-blur-md">
                    <button 
                        onClick={handleUndo}
                        disabled={historyIndex <= 0 || isLiveMode} 
                        className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed group"
                        title={`${t.undo} (Undo)`}
                    >
                        <RotateCcw size={16} className="group-hover:-rotate-45 transition-transform md:w-[18px] md:h-[18px]" />
                    </button>
                    <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
                    <button 
                        onClick={handleRedo}
                        disabled={historyIndex >= history.length - 1 || isLiveMode}
                        className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed group"
                        title={`${t.redo} (Redo)`}
                    >
                        <RotateCw size={16} className="group-hover:rotate-45 transition-transform md:w-[18px] md:h-[18px]" />
                    </button>
                </div>
            </div>

            {/* Center: Logo (Visual only, Hidden on Mobile) */}
            <div className={`glass-panel px-6 py-2 rounded-full items-center gap-3 hidden md:flex transition-all duration-500 ${isLiveMode ? 'border-red-500/50 bg-red-900/10' : ''}`}>
                <div className="relative">
                    <Sparkles size={18} className={`${isLiveMode ? 'text-red-500' : 'text-accent-cyan'} animate-pulse`} />
                    <div className={`absolute inset-0 blur-md opacity-50 ${isLiveMode ? 'bg-red-500' : 'bg-accent-cyan'}`}></div>
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-sm font-medium tracking-[0.2em] leading-none font-sans">በቃል</span>
                    <span className="text-[8px] text-white/40 tracking-widest uppercase">
                        {isLiveMode ? 'LIVE: TIGIST ONLINE' : 'Photo Editor'}
                    </span>
                </div>
            </div>

            {/* Right: Status Indicators & Actions */}
            <div className="flex flex-col gap-2 pointer-events-auto items-end">
                <div className="flex gap-2">
                     <button 
                        onClick={toggleLanguage}
                        className="glass-button px-2 py-2 md:px-3 rounded-full flex items-center gap-2 text-xs font-medium transition-all duration-300 text-white/80 hover:bg-white/10"
                        title="Change Language"
                    >
                        <Globe size={14} />
                        <span className="hidden md:inline">{language === 'am' ? 'AM' : 'EN'}</span>
                        <span className="md:hidden">{language === 'am' ? 'አማ' : 'EN'}</span>
                    </button>

                     {currentImage && (
                        <button 
                            onClick={handleSaveImage}
                            className="glass-button px-3 py-2 md:px-4 rounded-full flex items-center gap-2 text-xs font-medium text-accent-cyan hover:bg-accent-cyan/10 transition-all duration-300"
                            title={`${t.save} (Save)`}
                        >
                            <Download size={14} />
                            <span className="hidden md:inline">{t.save}</span>
                        </button>
                     )}
                    <button 
                        onClick={() => setShowHistory(!showHistory)}
                        className={`glass-button px-3 py-2 md:px-4 rounded-full flex items-center gap-2 text-xs font-medium transition-all duration-300 ${showHistory ? 'bg-white/10 text-white' : 'text-white/60'}`}
                    >
                        <Layers size={14} />
                        <span className="hidden md:inline">{t.layers}</span>
                    </button>
                </div>
                <div className="glass-panel px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-white/60 hidden md:flex">
                    <div className={`w-1.5 h-1.5 rounded-full ${appState === AppState.ANALYZING ? 'bg-accent-cyan animate-pulse' : 'bg-green-400'}`}></div>
                    {appState === AppState.ANALYZING ? t.processing : t.ready}
                </div>
            </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 relative z-10 flex items-center justify-center p-0 overflow-hidden">
            
            {/* History: Desktop (Sidebar) vs Mobile (Bottom Strip) */}
            {/* Desktop Sidebar */}
            <div className={`hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-20 flex-col gap-4 transition-all duration-500 z-40 ${showHistory && currentImage ? 'translate-x-0 opacity-100' : '-translate-x-32 opacity-0'}`}>
                <div className="glass-panel p-2 rounded-2xl flex flex-col gap-3 max-h-[60vh] overflow-y-auto no-scrollbar">
                    {history.map((item, idx) => (
                        <div 
                            key={item.id}
                            onClick={() => {
                                if (!isLiveMode) {
                                    setCurrentImage(item.url);
                                    setHistoryIndex(idx);
                                }
                            }}
                            className={`relative w-14 h-14 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border-2 ${currentImage === item.url ? 'border-accent-cyan shadow-[0_0_15px_rgba(0,242,234,0.3)] scale-105' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`}
                        >
                            <img src={item.url} alt="thumb" className="w-full h-full object-cover" />
                            {idx === 0 && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[8px] font-bold tracking-tighter">SRC</div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Mobile History Strip (Above Footer) */}
             <div className={`md:hidden absolute bottom-24 left-0 right-0 z-40 flex justify-center transition-all duration-500 ${showHistory && currentImage ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
                <div className="glass-panel mx-4 p-2 rounded-xl flex gap-3 overflow-x-auto max-w-full no-scrollbar">
                    {history.map((item, idx) => (
                        <div 
                            key={item.id}
                            onClick={() => {
                                if (!isLiveMode) {
                                    setCurrentImage(item.url);
                                    setHistoryIndex(idx);
                                }
                            }}
                            className={`relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 border-2 ${currentImage === item.url ? 'border-accent-cyan shadow-[0_0_15px_rgba(0,242,234,0.3)] scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        >
                            <img src={item.url} alt="thumb" className="w-full h-full object-cover" />
                            {idx === 0 && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[8px] font-bold tracking-tighter">SRC</div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Center - Viewport */}
            <div className="w-full h-full relative flex items-center justify-center">
                {currentImage ? (
                    <ImageViewer imageUrl={currentImage} isProcessing={appState === AppState.ANALYZING} language={language} />
                ) : (
                    <div className="h-full w-full flex items-center justify-center p-4 md:p-12">
                         <div className="w-full max-w-5xl">
                             <UploadZone onImageSelected={handleImageSelected} language={language} />
                         </div>
                    </div>
                )}
            </div>

            {/* Logs: Desktop (Right) vs Mobile (Top Right Condensed) */}
            <div className={`absolute right-4 md:right-6 top-20 md:top-24 bottom-auto md:bottom-32 w-48 md:w-64 pointer-events-none flex flex-col justify-start md:justify-end gap-2 z-30 ${!currentImage ? 'hidden md:flex' : ''}`}>
                <LogPanel logs={logs} />
            </div>
            
            {/* Live Caption Overlay */}
            {isLiveMode && liveCaption && (
                <div className="absolute bottom-32 md:bottom-32 left-4 right-4 md:left-0 md:right-0 flex justify-center pointer-events-none z-50">
                    <div className={`glass-panel px-4 py-3 md:px-6 md:py-4 rounded-2xl md:rounded-3xl w-full md:max-w-2xl text-center backdrop-blur-xl border-2 shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300 animate-in slide-in-from-bottom-4 fade-in ${liveCaption.source === 'user' ? 'border-accent-cyan/20 bg-accent-cyan/5 text-white' : 'border-red-500/20 bg-white/5 text-white'}`}>
                        <p className="text-base md:text-xl font-light leading-relaxed">
                            {liveCaption.source === 'user' && <span className="text-accent-cyan font-bold mr-2">YOU:</span>}
                            {liveCaption.source === 'model' && <span className="text-red-400 font-bold mr-2">TIGIST:</span>}
                            {liveCaption.text}
                            {liveCaption.source === 'model' && <span className="animate-pulse">_</span>}
                        </p>
                    </div>
                </div>
            )}
        </main>

        {/* BOTTOM BAR - FLOATING INPUT */}
        <footer className="absolute bottom-6 md:bottom-8 left-0 right-0 z-50 flex justify-center items-end pointer-events-none px-4">
            <div className="w-full max-w-3xl pointer-events-auto transition-all duration-500 transform translate-y-0">
                <div className={`glass-panel rounded-full p-2 pl-3 md:pl-4 flex items-center gap-2 transition-all duration-300 ${!currentImage ? 'opacity-50 scale-95 grayscale' : 'opacity-100 scale-100'} ${isLiveMode ? 'border-red-500/30 shadow-[0_0_30px_rgba(255,0,0,0.15)]' : ''}`}>
                     
                     {/* LIVE MODE TOGGLE */}
                    <button
                        type="button"
                        onClick={toggleLiveMode}
                        disabled={!currentImage || isConnecting}
                        className={`w-10 h-10 md:w-12 md:h-10 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                            isLiveMode 
                                ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' 
                                : isConnecting
                                    ? 'bg-yellow-500/20 text-yellow-200 animate-pulse'
                                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                        }`}
                        title="Gemini Live Mode"
                    >
                        {isConnecting ? <Activity size={16} className="animate-spin"/> : (
                            isLiveMode ? <div className="flex items-center gap-1"><div className="w-0.5 md:w-1 h-3 md:h-4 bg-white animate-music-bar-1"></div><div className="w-0.5 md:w-1 h-4 md:h-6 bg-white animate-music-bar-2"></div><div className="w-0.5 md:w-1 h-2 md:h-3 bg-white animate-music-bar-3"></div></div> : <Zap size={16} />
                        )}
                    </button>

                    {isLiveMode ? (
                        <div className="flex-1 flex items-center justify-center h-10 relative overflow-hidden">
                             {/* Audio Waveform Visualizer (Fake but effective) */}
                            <div className="flex items-center justify-center gap-1 opacity-50">
                                {[...Array(20)].map((_, i) => (
                                    <div key={i} className="w-1 bg-red-500 rounded-full animate-music-bar-2" style={{height: Math.random() * 20 + 5 + 'px', animationDuration: Math.random() * 0.5 + 0.5 + 's'}}></div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleCommandSubmit} className="flex-1 flex items-center gap-2 min-w-0">
                             <input 
                                type="text" 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={currentImage ? t.placeholder_active : t.placeholder_empty}
                                disabled={!currentImage || appState === AppState.ANALYZING}
                                className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 font-light text-sm h-10 min-w-0"
                            />
                            <button 
                                type="submit"
                                disabled={!currentImage || appState === AppState.ANALYZING || !prompt.trim()}
                                className="relative group overflow-hidden rounded-full px-4 md:px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 disabled:opacity-30 disabled:hover:bg-white/10 flex-shrink-0"
                            >
                                <span className="relative z-10 flex items-center gap-2 text-sm font-medium tracking-wide">
                                    {appState === AppState.ANALYZING ? (
                                        <>
                                            <Activity size={14} className="animate-spin" />
                                            <span className="hidden md:inline">{t.working}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={14} />
                                            <span className="hidden md:inline">{t.enhance}</span>
                                        </>
                                    )}
                                </span>
                            </button>
                        </form>
                    )}
                </div>
                
                {/* Suggestion Pills */}
                {currentImage && !isLiveMode && appState !== AppState.ANALYZING && (
                    <div className="flex justify-center gap-2 mt-3 overflow-x-auto pb-2 no-scrollbar mask-fade px-4">
                        {t.suggestions.map(s => (
                            <button
                                key={s}
                                onClick={() => setPrompt(s)}
                                className="glass-button px-3 py-1 rounded-full text-[10px] text-white/60 hover:text-white hover:bg-white/10 whitespace-nowrap transition-colors flex-shrink-0"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </footer>

        <style>{`
            @keyframes music-bar-1 { 0%, 100% { height: 4px } 50% { height: 16px } }
            @keyframes music-bar-2 { 0%, 100% { height: 10px } 50% { height: 24px } }
            @keyframes music-bar-3 { 0%, 100% { height: 6px } 50% { height: 12px } }
            .animate-music-bar-1 { animation: music-bar-1 1s ease-in-out infinite; }
            .animate-music-bar-2 { animation: music-bar-2 1.2s ease-in-out infinite; }
            .animate-music-bar-3 { animation: music-bar-3 0.8s ease-in-out infinite; }
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
    </div>
  );
};

export default App;
