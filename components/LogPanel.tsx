import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
}

const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  // Only show last 8 logs to keep it clean
  const visibleLogs = logs.slice(0, 8);

  return (
    <div className="flex flex-col gap-2 w-full items-end">
        {visibleLogs.map((log, index) => (
            <div 
                key={log.id} 
                className={`
                    glass-panel px-4 py-2 rounded-xl text-xs flex items-center gap-3 max-w-[280px]
                    animate-in slide-in-from-right-10 fade-in duration-500
                `}
                style={{ 
                    opacity: Math.max(0.2, 1 - (index * 0.15)),
                    transform: `scale(${1 - (index * 0.02)})` 
                }}
            >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.type === 'error' ? 'bg-red-500 shadow-[0_0_8px_red]' : 
                    log.type === 'warning' ? 'bg-yellow-500' : 
                    log.type === 'success' ? 'bg-accent-cyan shadow-[0_0_8px_cyan]' : 'bg-white/50'
                }`}></div>
                <div className="flex flex-col">
                    <span className="font-light tracking-wide text-white/90">{log.message}</span>
                    <span className="text-[9px] text-white/30 font-mono mt-0.5">{log.timestamp}</span>
                </div>
            </div>
        ))}
    </div>
  );
};

export default LogPanel;