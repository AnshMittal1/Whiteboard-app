// src/components/PropertiesPanel.tsx

import React from 'react';
import { Minus, Type, Droplet, Square, AlignLeft } from 'lucide-react';
import { Tool } from '@/app/page';
import { ShapeOptions, getVisibleProperties } from '@/types';

interface PropertiesPanelProps {
  activeTool: Tool;
  options: ShapeOptions;
  onChange: (newOptions: ShapeOptions) => void;
}

export default function PropertiesPanel({ activeTool, options, onChange }: PropertiesPanelProps) {
  const visible = getVisibleProperties(activeTool);

  
  const update = (key: keyof ShapeOptions, value: any) => {
    onChange({ ...options, [key]: value });
  };

  
  if (activeTool === 'eraser') return null;

  return (
    <div className="fixed top-20 right-4 flex flex-col gap-4 bg-white p-4 rounded-lg shadow-xl border border-gray-200 z-50 w-64">
      
      
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        {activeTool === 'selection' ? 'Properties' : `${activeTool} Options`}
      </h3>

      
      {visible.hasStroke && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Minus size={16} /> Stroke
          </label>
          
          <div className="flex items-center gap-2">
            {/* Color Picker Wrapper */}
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-300 shadow-sm cursor-pointer">
              <input 
                type="color" 
                value={options.stroke}
                onChange={(e) => update('stroke', e.target.value)}
                className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0 border-0"
              />
            </div>
            {/* Width Slider */}
            <input 
              type="range" 
              min="1" 
              max="20" 
              value={options.strokeWidth}
              onChange={(e) => update('strokeWidth', parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-gray-500 w-6 text-right">{options.strokeWidth}px</span>
          </div>
        </div>
      )}

      {/* 2. FILL SECTION (Background / Text Color) */}
      {visible.hasFill && (
        <div className="flex flex-col gap-2">
           <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            {/* If tool is text, call it "Color", otherwise "Fill" */}
            {activeTool === 'text' ? <Type size={16}/> : <Square size={16} fill="currentColor" className="text-gray-400"/>}
            {activeTool === 'text' ? 'Text Color' : 'Fill'}
          </label>
          
          <div className="flex items-center gap-3">
             {/* Color Picker */}
             <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-300 shadow-sm cursor-pointer">
              <input 
                type="color" 
                value={options.fill === 'transparent' ? '#ffffff' : options.fill}
                disabled={options.fill === 'transparent'}
                onChange={(e) => update('fill', e.target.value)}
                className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0 border-0"
              />
            </div>

            {/* Transparent Checkbox (Not needed for Text) */}
            {activeTool !== 'text' && (
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={options.fill === 'transparent'}
                  onChange={(e) => update('fill', e.target.checked ? 'transparent' : '#cccccc')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Transparent
              </label>
            )}
          </div>
        </div>
      )}

      {/* 3. TEXT OPTIONS (Only for Text) */}
      {visible.hasText && (
         <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
           <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
             <AlignLeft size={16} /> Typography
           </label>
           
           <div className="flex gap-2">
             <select 
               value={options.fontFamily}
               onChange={(e) => update('fontFamily', e.target.value)}
               className="flex-1 text-sm border border-gray-300 rounded p-1 focus:outline-none focus:border-blue-500"
             >
               <option value="Arial">Arial</option>
               <option value="Times New Roman">Times</option>
               <option value="Courier New">Courier</option>
               <option value="Georgia">Georgia</option>
               <option value="Verdana">Verdana</option>
             </select>

             <input 
               type="number" 
               min="8" 
               max="96" 
               value={options.fontSize}
               onChange={(e) => update('fontSize', parseInt(e.target.value))}
               className="w-16 text-sm border border-gray-300 rounded p-1 focus:outline-none focus:border-blue-500"
             />
           </div>
         </div>
      )}
      
      {/* 4. OPACITY (Global) */}
       <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Droplet size={16} /> Opacity
          </label>
          <div className="flex items-center gap-2">
             <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1"
                value={options.opacity}
                onChange={(e) => update('opacity', parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-gray-500 w-8 text-right">{Math.round(options.opacity * 100)}%</span>
          </div>
       </div>

    </div>
  );
}