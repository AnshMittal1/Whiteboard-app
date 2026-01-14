// src/page.tsx

'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import Toolbar  from "@/components/Toolbar";
import Whiteboard from "@/components/Whiteboard";
import PropertiesPanel from '@/components/PropertiesPanel';

// Import the new types and defaults
import { ShapeOptions, Tool, defaultToolConfigs, ToolConfig } from '@/types'; 

export default function Home() {
  const [activeTool, setActiveTool] = useState<Tool>('selection');

  // CHANGE 1: Store a map of configs, not just one single config
  const [toolConfigs, setToolConfigs] = useState<ToolConfig>(defaultToolConfigs);

  // CHANGE 2: Helper to update ONLY the current tool's settings
  const handleOptionsChange = (newOptions: ShapeOptions) => {
    setToolConfigs((prev) => ({
      ...prev,
      [activeTool]: newOptions, // Update only the active tool (e.g., 'line' or 'selection')
    }));
  };

  // CHANGE 3: Retrieve the specific options for the current tool
  const currentOptions = toolConfigs[activeTool];

  return (
    <main>
      <Header/>
      <Toolbar
        activeTool={activeTool} 
        onToolChange={setActiveTool}
      />
      
      <PropertiesPanel 
        activeTool={activeTool}
        options={currentOptions}     // Pass the specific tool's options
        onChange={handleOptionsChange} // Use our new specific handler
      />

      <Whiteboard 
        activeTool={activeTool}
        onToolChange={setActiveTool}
        options={currentOptions}     // Pass the specific tool's options
        onOptionsChange={handleOptionsChange}
      />
    </main>
  );
}