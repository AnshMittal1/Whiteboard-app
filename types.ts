// src/types.ts

// 1. Move Tool type here to prevent circular dependency issues
export type Tool = 'selection' | 'rectangle' | 'pencil' | 'text' | 'eraser' | 'line' | 'arrow';

export interface ShapeOptions {
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  fontFamily: string;
  fontSize: number;
}

// 2. Define a type for our new "State Registry"
// This maps every Tool string to a specific ShapeOptions object
export type ToolConfig = Record<Tool, ShapeOptions>;

const commonDefaults = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent',
  opacity: 1,
  fontFamily: 'Arial',
  fontSize: 24,
};

// 3. Create specific defaults for each tool
// This ensures 'line' starts with different settings than 'rectangle'
export const defaultToolConfigs: ToolConfig = {
  selection: { ...commonDefaults },
  eraser: { ...commonDefaults }, // Eraser doesn't use options, but needs a placeholder
  rectangle: { 
    ...commonDefaults, 
    fill: 'transparent', 
    strokeWidth: 2 
  },
  line: { 
    ...commonDefaults, 
    fill: 'transparent', 
    strokeWidth: 2 
  },
  arrow: { 
    ...commonDefaults, 
    fill: 'transparent', 
    strokeWidth: 2 
  },
  pencil: { 
    ...commonDefaults, 
    strokeWidth: 5 
  },
  text: { 
    ...commonDefaults, 
    fill: '#000000', // Text usually needs a solid fill by default
    strokeWidth: 0 
  },
};

export const getVisibleProperties = (tool: Tool) => {
  switch (tool) {
    case 'selection': 
      return { hasStroke: true, hasFill: true, hasText: true };
    case 'text':
      return { hasStroke: false, hasFill: true, hasText: true }; 
    case 'line':
    case 'arrow':
    case 'pencil':
      return { hasStroke: true, hasFill: false, hasText: false };
    case 'rectangle':
    default:
      return { hasStroke: true, hasFill: true, hasText: false };
  }
};