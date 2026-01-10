'use client';

import React, {useEffect, useState} from 'react';

import Header from '@/components/Header';
import Toolbar  from "@/components/Toolbar";
import Whiteboard from "@/components/Whiteboard";

import PropertiesPanel from '@/components/PropertiesPanel';
import { ShapeOptions, defaultOptions } from '@/types'; // Import from your new types file


export type Tool = 'selection' | 'rectangle' | 'pencil' | 'text' | 'eraser' | 'line' | 'arrow';


export default function Home() {

  const [activeTool, setActiveTool] = useState<Tool>('selection');

  // [NEW] Central State for Styles
  const [options, setOptions] = useState<ShapeOptions>(defaultOptions);

  return (
    <main>
      <Header/>
      <Toolbar
        activeTool={activeTool} 
        onToolChange={setActiveTool}
      />

      {/* [NEW] The Properties Panel */}
      <PropertiesPanel 
        activeTool={activeTool}
        options={options}
        onChange={setOptions}
      />


      <Whiteboard 
        activeTool={activeTool}
        onToolChange={setActiveTool}
        options={options} // [NEW] Pass options down to canvas
        onOptionsChange={setOptions} // [NEW] Pass the setter
      />
    </main>

  );
}
