
import React, { useCallback } from 'react';
import { Upload, ImageIcon, Aperture } from 'lucide-react';
import { Language } from '../types';

interface UploadZoneProps {
  onImageSelected: (file: File) => void;
  language: Language;
}

const TRANSLATIONS = {
  am: {
    title: "ምስል ይስቀሉ",
    subtitle: "ምስልዎን እዚህ ይጎትቱ ወይም ከፋይል ለመምረጥ ይጫኑ"
  },
  en: {
    title: "Upload Image",
    subtitle: "Drag your image here or click to browse"
  }
};

const UploadZone: React.FC<UploadZoneProps> = ({ onImageSelected, language }) => {
  const t = TRANSLATIONS[language];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageSelected(file);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImageSelected(file);
    }
  }, [onImageSelected]);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <div 
      className="group relative w-full h-full min-h-[300px] md:aspect-video flex flex-col items-center justify-center glass-panel rounded-3xl overflow-hidden transition-all duration-500 hover:bg-white/5 hover:border-white/20 hover:shadow-[0_0_50px_rgba(0,242,234,0.1)]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleFileChange} 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
      />
      
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-accent-cyan/5 to-accent-purple/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

      <div className="relative z-10 flex flex-col items-center space-y-4 md:space-y-6 text-center pointer-events-none p-6">
        <div className="relative">
            <div className="absolute inset-0 bg-accent-cyan blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
            <div className="relative p-4 md:p-8 rounded-full bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500">
                {/* Responsive Icon Size using Tailwind classes instead of fixed size prop */}
                <div className="w-24 h-24 md:w-48 md:h-48 text-white/80 group-hover:text-accent-cyan transition-colors duration-300">
                    <Aperture className="w-full h-full" strokeWidth={1} />
                </div>
            </div>
        </div>
        
        <div className="space-y-2">
            <h3 className="text-2xl md:text-3xl font-light tracking-tight">{t.title}</h3>
            <p className="text-sm md:text-base text-white/40 max-w-[200px] md:max-w-xs mx-auto leading-relaxed font-light">
                {t.subtitle}
            </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 md:gap-4 mt-4">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-white/30 uppercase tracking-wider">JPG</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-white/30 uppercase tracking-wider">PNG</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-white/30 uppercase tracking-wider">WEBP</span>
        </div>
      </div>
    </div>
  );
};

export default UploadZone;
