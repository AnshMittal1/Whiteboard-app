'use client';

import React, {useEffect, useState} from 'react';

import Header from '@/components/Header';
import Toolbar  from "@/components/Toolbar";
import Whiteboard from "@/components/Whiteboard";

export type Tool = 'selection' | 'rectangle' | 'pencil' | 'text' | 'eraser' | 'line' | 'arrow';


export default function Home() {

  const [activeTool, setActiveTool] = useState<Tool>('selection');

  return (
    <main>
      <Header/>
      <Toolbar
        activeTool={activeTool} 
        onToolChange={setActiveTool}
      />
      <Whiteboard 
        activeTool={activeTool}
        onToolChange={setActiveTool}
      />
    </main>

  );
}
