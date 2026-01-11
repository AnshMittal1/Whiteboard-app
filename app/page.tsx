'use client';

import React, {useEffect, useState} from 'react';

import Header from '@/components/Header';
import Toolbar  from "@/components/Toolbar";
import Whiteboard from "@/components/Whiteboard";

import PropertiesPanel from '@/components/PropertiesPanel';
import { ShapeOptions, defaultOptions } from '@/types'; 


export type Tool = 'selection' | 'rectangle' | 'pencil' | 'text' | 'eraser' | 'line' | 'arrow';


export default function Home() {

  const [activeTool, setActiveTool] = useState<Tool>('selection');

  
  const [options, setOptions] = useState<ShapeOptions>(defaultOptions);

  return (
    <main>
      <Header/>
      <Toolbar
        activeTool={activeTool} 
        onToolChange={setActiveTool}
      />

      
      <PropertiesPanel 
        activeTool={activeTool}
        options={options}
        onChange={setOptions}
      />


      <Whiteboard 
        activeTool={activeTool}
        onToolChange={setActiveTool}
        options={options}
        onOptionsChange={setOptions} 
      />
    </main>

  );
}
