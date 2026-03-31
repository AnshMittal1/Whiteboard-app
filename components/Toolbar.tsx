import React from 'react';
import { 
  MousePointer2, 
  Pencil, 
  Eraser, 
  Minus, 
  ArrowRight, 
  Type, 
  Square 
} from 'lucide-react';

import { Tool } from '@/types'; 

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export default function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  return (
    <div className="fixed top-20 left-4 flex flex-col gap-2 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 z-50">
       
       {/* 1. SELECTION */}
       <button 
         onClick={() => onToolChange('selection')}
         className={`p-2 rounded transition ${
           activeTool === 'selection' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <MousePointer2 size={20} />
       </button>

       {/* Separator */}
       <div className="w-full h-px bg-gray-200 my-1"></div>

       {/* 2. DRAWING */}
       <button 
         onClick={() => onToolChange('pencil')}
         className={`p-2 rounded transition ${
           activeTool === 'pencil' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <Pencil size={20} />
       </button>
       
       <button 
         onClick={() => onToolChange('eraser')}
         className={`p-2 rounded transition ${
            activeTool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <Eraser size={20} />
       </button>

       {/* Separator */}
       <div className="w-full h-px bg-gray-200 my-1"></div>

       {/* 3. SHAPES */}
       <button 
         onClick={() => onToolChange('rectangle')}
         className={`p-2 rounded transition ${
            activeTool === 'rectangle' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <Square size={20} />
       </button>

       <button 
         onClick={() => onToolChange('line')}
         className={`p-2 rounded transition ${
            activeTool === 'line' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <Minus size={20} className="transform -rotate-45" />
       </button>

       <button 
         onClick={() => onToolChange('arrow')}
         className={`p-2 rounded transition ${
            activeTool === 'arrow' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <ArrowRight size={20} />
       </button>

       {/* Separator */}
       <div className="w-full h-px bg-gray-200 my-1"></div>

       {/* 4. TEXT */}
       <button 
         onClick={() => onToolChange('text')}
         className={`p-2 rounded transition ${
            activeTool === 'text' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
         }`}
       >
         <Type size={20} />
       </button>

    </div>
  );
}