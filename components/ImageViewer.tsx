
import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize, Crosshair } from 'lucide-react';
import { ZoomState, Language } from '../types';

interface ImageViewerProps {
  imageUrl: string | null;
  isProcessing: boolean;
  language: Language;
}

const TRANSLATIONS = {
  am: {
    zoomIn: "አጉላ",
    zoomOut: "አርቅ",
    reset: "መደበኛ እይታ",
    scale: "%"
  },
  en: {
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    reset: "Reset View",
    scale: "%"
  }
};

const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl, isProcessing, language }) => {
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const t = TRANSLATIONS[language];

  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
  }, [imageUrl]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!imageUrl) return;
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.5, zoom.scale + scaleAmount), 8);
    setZoom(prev => ({ ...prev, scale: newScale }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageUrl) return;
    setIsDragging(true);
    setStartPan({ x: e.clientX - zoom.x, y: e.clientY - zoom.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setZoom(prev => ({
      ...prev,
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!imageUrl) return null;

  return (
    <div 
      className="relative w-full h-full cursor-move select-none overflow-hidden group rounded-none md:rounded-3xl mx-auto my-auto"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      // Touch events for basic mobile support (dragging)
      onTouchStart={(e) => {
         const touch = e.touches[0];
         setIsDragging(true);
         setStartPan({ x: touch.clientX - zoom.x, y: touch.clientY - zoom.y });
      }}
      onTouchMove={(e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        setZoom(prev => ({
            ...prev,
            x: touch.clientX - startPan.x,
            y: touch.clientY - startPan.y
        }));
      }}
      onTouchEnd={() => setIsDragging(false)}
    >
      {/* Clean Image Layer - Transforms to blurred background during processing */}
      <div 
        className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out will-change-transform"
        style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            transformOrigin: 'center center'
        }}
      >
        <img 
            src={imageUrl} 
            alt="Target" 
            className={`max-w-[95vw] md:max-w-none max-h-[70vh] md:max-h-[85vh] object-contain shadow-2xl rounded-lg transition-all duration-1000 ease-in-out ${isProcessing ? 'blur-2xl scale-105 opacity-60 saturate-150' : ''}`}
            draggable={false}
        />
      </div>

      {/* Glassy Diffusion Overlay (Only when processing) */}
      {isProcessing && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden animate-in fade-in duration-1000">
             {/* Frosted Glass Layer */}
             <div className="absolute inset-0 backdrop-blur-3xl bg-white/5 mix-blend-overlay"></div>
             
             {/* Rotating Light Source Effect */}
             <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] animate-spin-slow bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-30"></div>
             
             {/* Shimmering Wave */}
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer"></div>

             {/* Floating Particles/Reflections (Abstract Ambient Lights) */}
             <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-cyan/30 rounded-full blur-[120px] animate-pulse mix-blend-screen"></div>
             <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-purple/30 rounded-full blur-[120px] animate-pulse mix-blend-screen" style={{animationDelay: '1s'}}></div>
        </div>
      )}

      {/* Floating HUD Controls (Responsive Positioning) */}
      <div className="absolute top-20 right-4 md:top-auto md:bottom-32 md:right-8 z-30 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
         <div className="glass-panel rounded-2xl p-2 flex flex-col gap-2">
            <button 
                onClick={() => setZoom(prev => ({ ...prev, scale: prev.scale + 0.5 }))}
                className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-colors"
                title={`${t.zoomIn} (Zoom In)`}
            >
                <ZoomIn size={18} />
            </button>
            <button 
                onClick={() => setZoom(prev => ({ ...prev, scale: Math.max(0.5, prev.scale - 0.5) }))}
                className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-colors"
                title={`${t.zoomOut} (Zoom Out)`}
            >
                <ZoomOut size={18} />
            </button>
            <div className="h-[1px] bg-white/10 mx-2"></div>
            <button 
                onClick={() => setZoom({ scale: 1, x: 0, y: 0 })}
                className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-colors"
                title={`${t.reset} (Reset)`}
            >
                <Maximize size={18} />
            </button>
         </div>
         
         {/* Zoom Indicator */}
         <div className="glass-panel rounded-full px-3 py-1 text-xs font-medium text-center text-white/60 backdrop-blur-md">
            {Math.round(zoom.scale * 100)}{t.scale}
         </div>
      </div>

      {/* Subtle Grid Overlay (Only visible on hover) */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent bg-[length:40px_40px]"></div>
      
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .animate-shimmer {
          animation: shimmer 2.5s infinite linear;
        }
        .animate-spin-slow {
            animation: spin 12s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default ImageViewer;
