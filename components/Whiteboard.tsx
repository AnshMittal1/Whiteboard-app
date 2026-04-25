'use client';

import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { Tool } from '@/types';
import RBush from 'rbush';
import { ShapeOptions } from '@/types'; 


interface WhiteboardProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  options: ShapeOptions; 
  onOptionsChange: (options: ShapeOptions) => void; 
}

const Whiteboard = ({ activeTool, onToolChange, options,onOptionsChange }: WhiteboardProps) => {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvasInstance = useRef<fabric.Canvas | null>(null);
  const onToolChangeRef = useRef(onToolChange);

  
  const activeToolRef = useRef(activeTool);

  
  const isDrawing = useRef(false); 
  const startPos = useRef({ x: 0, y: 0 }); 
  const activeShape = useRef<fabric.Object | null>(null); 

  
  const spatialIndex = useRef(new RBush());
  const objectMap = useRef(new Map<fabric.Object, any>());


 
  const undoStack = useRef<any[]>([]);
  const redoStack = useRef<any[]>([]);
  const historyLocked = useRef(false); 


  
  const historyTransaction = useRef<any[]>([]); 
  const isTransactionActive = useRef(false);

  const clipboard = useRef<any>(null);


  const optionsRef = useRef(options);


 
  const guideLineVertical = useRef<fabric.Line | null>(null);
  const guideLineHorizontal = useRef<fabric.Line | null>(null);
  const SNAP_THRESHOLD = 8; // Adjust this number to make the snapping stronger or weaker

  // Replace dragTracker with activeSnaps
  const activeSnaps = useRef({ x: null as number | null, y: null as number | null });
  const snapCache = useRef<{ vertical: number[], horizontal: number[] } | null>(null);

  // Helper to determine which properties apply to a specific Fabric object type
  const getRelevantKeys = (obj: fabric.Object): (keyof ShapeOptions)[] => {
    const type = obj.type;

    // 1. Lines, Arrows, and Pencil drawings (Paths) ONLY use Stroke.
    // They do NOT use Fill, FontFamily, or FontSize.
    if (['line', 'path', 'pencil'].includes(type)) {
      return ['stroke', 'strokeWidth', 'opacity'];
    }

    // 2. Text objects use Fill (for color), FontFamily, and FontSize.
    // We generally ignore Stroke/StrokeWidth for basic text.
    if (['i-text', 'text'].includes(type)) {
      return ['fill', 'opacity', 'fontFamily', 'fontSize'];
    }

    // 3. Rectangles, Circles, etc. use everything (Stroke + Fill).
    // They do NOT use FontFamily or FontSize.
    return ['stroke', 'strokeWidth', 'fill', 'opacity'];
  };


  const hasStateChanged = (obj: fabric.Object, newOptions: ShapeOptions) => {
    // Check the specific properties we care about
    return (
      obj.stroke !== newOptions.stroke ||
      obj.strokeWidth !== newOptions.strokeWidth ||
      obj.fill !== newOptions.fill ||
      obj.opacity !== newOptions.opacity ||
      (obj as any).fontFamily !== newOptions.fontFamily ||
      (obj as any).fontSize !== newOptions.fontSize
    );
  };

  const configureLineControls = (line: fabric.Line) => {
    line.setControlsVisibility({
      tl: false, tr: false, bl: false, br: false,
      ml: false, mt: false, mr: false, mb: false, mtr: false,
    });

    const getWorldPosition = (key: 'p1' | 'p2', fabricObject: fabric.Line) => {
      const points = fabricObject.calcLinePoints();
      const localPoint = key === 'p1' 
        ? new fabric.Point(points.x1, points.y1) 
        : new fabric.Point(points.x2, points.y2);

      return fabric.util.transformPoint(
          localPoint,
          fabricObject.calcTransformMatrix()
      );
    };

    const moveEnd = (key: 'p1' | 'p2', eventData: any, transformData: any, x: number, y: number) => {
      const targetLine = transformData.target as fabric.Line;
      const staticPoint = getWorldPosition(key === 'p1' ? 'p2' : 'p1', targetLine);
      const newPoint = { x, y }; 
      
      const newCoords = key === 'p1' 
        ? { x1: newPoint.x, y1: newPoint.y, x2: staticPoint.x, y2: staticPoint.y }
        : { x1: staticPoint.x, y1: staticPoint.y, x2: newPoint.x, y2: newPoint.y };

      targetLine.set(newCoords);
      targetLine.set({ angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, originX: 'left', originY: 'top' });
      targetLine.setCoords();
      return true;
    };

    
    const drawDot = (ctx: CanvasRenderingContext2D, left: number, top: number, style: any, fabricObject: fabric.Object) => {
        const canvas = fabricObject.canvas;
        if (!canvas) return;

        const point = new fabric.Point(left, top);
        const screenPoint = fabric.util.transformPoint(point, canvas.viewportTransform || [1,0,0,1,0,0]);

        ctx.save();
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };

    line.controls.startPoint = new fabric.Control({
      x: -0.5, y: -0.5, cursorStyle: 'crosshair',
      positionHandler: (dim, finalMatrix, fabricObject) => getWorldPosition('p1', fabricObject as fabric.Line),
      actionHandler: (e, data, x, y) => moveEnd('p1', e, data, x, y),
      render: drawDot, 
    });

    line.controls.endPoint = new fabric.Control({
      x: 0.5, y: 0.5, cursorStyle: 'crosshair',
      positionHandler: (dim, finalMatrix, fabricObject) => getWorldPosition('p2', fabricObject as fabric.Line),
      actionHandler: (e, data, x, y) => moveEnd('p2', e, data, x, y),
      render: drawDot,
    });
  };

  const getArrowPath = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const headLength = 15;
    const arrowAngle = Math.PI / 6; 
    const x1 = end.x - headLength * Math.cos(angle - arrowAngle);
    const y1 = end.y - headLength * Math.sin(angle - arrowAngle);
    const x2 = end.x - headLength * Math.cos(angle + arrowAngle);
    const y2 = end.y - headLength * Math.sin(angle + arrowAngle);
    return `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${end.x} ${end.y} L ${x1} ${y1} M ${end.x} ${end.y} L ${x2} ${y2}`;
  };

  const configureArrowControls = (arrow: fabric.Path) => {
    arrow.setControlsVisibility({
      tl: false, tr: false, bl: false, br: false,
      ml: false, mt: false, mr: false, mb: false, mtr: false,
    });


    type PathCommand = ['M' | 'L', number, number] | ['M' | 'L', number, number, ...any[]];
    const getArrowWorldPosition = (key: 'p1' | 'p2', fabricObject: fabric.Path) => {
        const path = fabricObject.path as PathCommand[];
        const pathOffset = fabricObject.pathOffset; 
        if (!Array.isArray(path) || path.length < 2) return new fabric.Point(0, 0);
        let rawX = 0, rawY = 0;
        if (key === 'p1' && path[0].length >= 3) { rawX = path[0][1]; rawY = path[0][2]; } 
        else if (key === 'p2' && path[1].length >= 3) { rawX = path[1][1]; rawY = path[1][2]; }
        const localPoint = new fabric.Point(rawX - (pathOffset?.x || 0), rawY - (pathOffset?.y || 0));
        return fabric.util.transformPoint(localPoint, fabricObject.calcTransformMatrix());
    };

    const moveArrowEnd = (key: 'p1' | 'p2', eventData: any, transformData: any, x: number, y: number) => {
       const target = transformData.target as fabric.Path;
       if (!transformData.dragAnchor) {
         const staticKey = key === 'p1' ? 'p2' : 'p1';
         transformData.dragAnchor = getArrowWorldPosition(staticKey, target);
       }
       const staticPoint = transformData.dragAnchor;
       const start = key === 'p1' ? { x, y } : staticPoint;
       const end = key === 'p2' ? { x, y } : staticPoint;
       const newPathData = getArrowPath(start, end);
       const tempPath = new fabric.Path(newPathData, { strokeWidth: target.strokeWidth, strokeLineCap: target.strokeLineCap });
       const dims = tempPath.getBoundingRect();
       target.set({
        path: tempPath.path, width: tempPath.width, height: tempPath.height,
        pathOffset: tempPath.pathOffset, left: dims.left, top: dims.top,
        originX: 'left', originY: 'top',
       });
       target.setCoords();
       return true;
    };

    const drawDot = (ctx: CanvasRenderingContext2D, left: number, top: number, style: any, fabricObject: fabric.Object) => {
        const canvas = fabricObject.canvas;
        if (!canvas) return;
        const point = new fabric.Point(left, top);
        const screenPoint = fabric.util.transformPoint(point, canvas.viewportTransform || [1,0,0,1,0,0]);
        
        ctx.save();
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };

    arrow.controls.startPoint = new fabric.Control({
      x: -0.5, y: -0.5, cursorStyle: 'crosshair',
      positionHandler: (dim, finalMatrix, obj) => getArrowWorldPosition('p1', obj as fabric.Path),
      actionHandler: (e, data, x, y) => moveArrowEnd('p1', e, data, x, y),
      render: drawDot,
    });

    arrow.controls.endPoint = new fabric.Control({
      x: 0.5, y: 0.5, cursorStyle: 'crosshair',
      positionHandler: (dim, finalMatrix, obj) => getArrowWorldPosition('p2', obj as fabric.Path),
      actionHandler: (e, data, x, y) => moveArrowEnd('p2', e, data, x, y),
      render: drawDot,
    });
  };

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    onToolChangeRef.current = onToolChange;
  }, [onToolChange]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);


  useEffect(() => {
    const canvas = canvasInstance.current;
    if (!canvas) return;

    if (isDrawing.current && activeShape.current) {
      canvas.remove(activeShape.current); 
      activeShape.current = null; 
      isDrawing.current = false; 
      canvas.requestRenderAll(); 
    }

    canvas.isDrawingMode = false;
    canvas.selection = false;

    canvas.discardActiveObject();

    canvas.getObjects().forEach((obj) => {
      obj.selectable = activeTool === 'selection';
      obj.evented = true; 
    });

    switch (activeTool) {
      case 'selection':
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        break;

      case 'pencil':
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = 5;
        canvas.freeDrawingBrush.color = 'black';
        canvas.defaultCursor = 'crosshair';
        break;

      case 'eraser':
        canvas.selection = false;
        canvas.defaultCursor = 'not-allowed'; 
        break;

      case 'rectangle':
      case 'line':
      case 'arrow':
      case 'text':
       
        canvas.defaultCursor = 'crosshair';
        break;
    }

    canvas.requestRenderAll();
  }, [activeTool]);

 
  const saveAction = (action: any) => {
    if (historyLocked.current) return;

    if (isTransactionActive.current) {
      historyTransaction.current.push(action);
      return;
    }
    
    undoStack.current.push(action);
    if (redoStack.current.length > 0) {
      redoStack.current = [];
    }
  };

  
  useEffect(() => {
    const canvas = canvasInstance.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    // 1. Determine which keys are valid for this specific object (e.g., ignore 'fill' for lines)
    const relevantKeys = getRelevantKeys(activeObject);

    // 2. Check if ANY of the *relevant* keys have actually changed
    const hasChanged = relevantKeys.some((key) => {
      // We assume 'options' contains the new value from the UI
      const newValue = options[key];
      const currentValue = (activeObject as any)[key];
      return currentValue !== newValue;
    });

    // GATEKEEPER: If nothing relevant changed, stop here. Do not save history.
    if (!hasChanged) return;

    // 3. Capture OLD state (only relevant keys)
    const oldState: any = {};
    relevantKeys.forEach(key => {
        oldState[key] = (activeObject as any)[key];
    });

    // 4. Capture NEW state (subset of options)
    const newState: any = {};
    relevantKeys.forEach(key => {
        newState[key] = options[key];
    });

    // 5. Apply changes to the object
    activeObject.set(newState);
    activeObject.setCoords();
    canvas.requestRenderAll();

    // 6. Save valid action to history
    saveAction({
      type: 'modify',
      object: activeObject,
      before: oldState,
      after: newState 
    });

  }, [options]);



  useEffect(() => {
    if (!canvasEl.current) return;

    

    

    
    const applySingleAction = (action: any, isUndo: boolean) => {
      const obj = action.object;
      if (action.type === 'add') {
        if (isUndo) canvas.remove(obj);
        else canvas.add(obj);
      } 
      else if (action.type === 'remove') {
        if (isUndo) canvas.add(obj);
        else canvas.remove(obj);
      } 
      else if (action.type === 'modify') {
        const state = isUndo ? action.before : action.after;
        obj.set(state);
        obj.setCoords();
        updateIndex(obj);
      }
    };

   
    const applyAction = (action: any, isUndo: boolean) => {
      historyLocked.current = true; 

      if (action.type === 'batch') {
        
        const actionsToProcess = isUndo ? [...action.actions].reverse() : action.actions;
        actionsToProcess.forEach((subAction: any) => applySingleAction(subAction, isUndo));
      } else {
        
        applySingleAction(action, isUndo);
      }

      historyLocked.current = false;
      canvas.requestRenderAll();
    };

    const undo = () => {
      if (undoStack.current.length === 0) return;
      const action = undoStack.current.pop();
      redoStack.current.push(action);
      applyAction(action, true);
    };

    const redo = () => {
      if (redoStack.current.length === 0) return;
      const action = redoStack.current.pop();
      undoStack.current.push(action);
      applyAction(action, false);
    };

    

    const addToIndex = (obj: fabric.Object) => {
      if (obj.type === 'activeSelection' || (obj as any).id === 'smart-guide') return;
      const box = obj.getBoundingRect();
      const item = {
        minX: box.left,
        minY: box.top,
        maxX: box.left + box.width,
        maxY: box.top + box.height,
        id: obj, 
      };

      spatialIndex.current.insert(item);
      objectMap.current.set(obj, item);
    };

    const removeFromIndex = (obj: fabric.Object) => {

      if ((obj as any).id === 'smart-guide') return;

      const item = objectMap.current.get(obj);
      if (item) {
        spatialIndex.current.remove(item);
        objectMap.current.delete(obj);
      }
    };

    const updateIndex = (obj: fabric.Object) => {
      
      removeFromIndex(obj);
      addToIndex(obj);
    };

    const canvas = new fabric.Canvas(canvasEl.current, {
      width: window.innerWidth,
      height: window.innerHeight,
      selection: true, 
      enableRetinaScaling: true,
      renderOnAddRemove: false,
    });
    canvasInstance.current = canvas;

    // --- ADD POOLED SMART GUIDES HERE ---
    const vLine = new fabric.Line([0, -999999, 0, 999999], {
      stroke: '#FF007F', 
      strokeWidth: 1.5, 
      strokeDashArray: [5, 5],
      selectable: false, 
      evented: false, 
      objectCaching: false, 
      visible: false,
      originX: 'center',
      originY: 'center'
    });
    (vLine as any).id = 'smart-guide';

    const hLine = new fabric.Line([-999999, 0, 999999, 0], {
      stroke: '#FF007F', 
      strokeWidth: 1.5, 
      strokeDashArray: [5, 5],
      selectable: false, 
      evented: false, 
      objectCaching: false, 
      visible: false,
      originX: 'center',
      originY: 'center'
    });
    (hLine as any).id = 'smart-guide';

    canvas.add(vLine, hLine);
    guideLineVertical.current = vLine as fabric.Line;
    guideLineHorizontal.current = hLine as fabric.Line;
    // ------------------------------------

    
    const gridSize = 50;
    const gridColor = '#e5e5e5';

    canvas.on('before:render', () => {
      const ctx = canvas.getContext();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      const zoom = canvas.getZoom();
      const width = canvas.width;
      const height = canvas.height;

      
      const baseGridSize = 50;

      
      let visualGridSize = baseGridSize * zoom;


      while (visualGridSize < 15) {
        visualGridSize *= 2;
      }

      
      const offsetX = vpt[4] % visualGridSize;
      const offsetY = vpt[5] % visualGridSize;

      ctx.save();
      ctx.beginPath();

      
      for (let x = offsetX; x < width; x += visualGridSize) {
        
        const snapX = Math.round(x) - 0.5;
        ctx.moveTo(snapX, 0);
        ctx.lineTo(snapX, height);
      }

     
      for (let y = offsetY; y < height; y += visualGridSize) {
        const snapY = Math.round(y) - 0.5;
        ctx.moveTo(0, snapY);
        ctx.lineTo(width, snapY);
      }

      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });


    const eraseObjectsInPath = (pointer: { x: number, y: number }) => {
      const canvas = canvasInstance.current;
      if (!canvas) return;


      const eraserSize = 10;
      const searchBox = {
        minX: pointer.x - eraserSize,
        minY: pointer.y - eraserSize,
        maxX: pointer.x + eraserSize,
        maxY: pointer.y + eraserSize
      };

      
      const results = spatialIndex.current.search(searchBox);

      
      results.forEach((item: any) => {
        const obj = item.id;
        

        canvas.remove(obj); 
      });
      
      if (results.length > 0) {
        canvas.requestRenderAll();
      }
    };



    // --- SMART GUIDES & SNAPPING LOGIC (DRIFT-FREE EXCALIDRAW) ---
    canvas.on('object:moving', (e) => {
      const target = e.target;
      if (!target || !snapCache.current) return;

      if (guideLineVertical.current) guideLineVertical.current.set({ visible: false });
      if (guideLineHorizontal.current) guideLineHorizontal.current.set({ visible: false });

      // 1. THE MAGIC BULLET: Double Cache Flush
      // Fabric already set target.left/top to the absolute raw mouse intent.
      // We force update the hitbox so getBoundingRect reads the mouse, NOT the previous frame's snap.
      target.setCoords();
      const activeBBox = target.getBoundingRect();

      const activeAxes = {
        vertical: [
          { value: activeBBox.left, prop: 'left' },
          { value: activeBBox.left + activeBBox.width / 2, prop: 'centerX' },
          { value: activeBBox.left + activeBBox.width, prop: 'right' },
        ],
        horizontal: [
          { value: activeBBox.top, prop: 'top' },
          { value: activeBBox.top + activeBBox.height / 2, prop: 'centerY' },
          { value: activeBBox.top + activeBBox.height, prop: 'bottom' },
        ]
      };

      let minDiffX = Infinity;
      let minDiffY = Infinity;
      let bestSnapX: any = null;
      let bestSnapY: any = null;

      // 2. Evaluate Snaps with Magnetic Hysteresis
      for (const aAxis of activeAxes.vertical) {
        for (const tAxis of snapCache.current.vertical) {
          const isSticky = activeSnaps.current.x === tAxis;
          const threshold = isSticky ? SNAP_THRESHOLD * 1.5 : SNAP_THRESHOLD;
          
          const diff = Math.abs(tAxis - aAxis.value);
          if (diff < threshold && diff < minDiffX) {
            minDiffX = diff;
            bestSnapX = { targetLine: tAxis, activeValue: aAxis.value };
          }
        }
      }

      for (const aAxis of activeAxes.horizontal) {
        for (const tAxis of snapCache.current.horizontal) {
          const isSticky = activeSnaps.current.y === tAxis;
          const threshold = isSticky ? SNAP_THRESHOLD * 1.5 : SNAP_THRESHOLD;

          const diff = Math.abs(tAxis - aAxis.value);
          if (diff < threshold && diff < minDiffY) {
            minDiffY = diff;
            bestSnapY = { targetLine: tAxis, activeValue: aAxis.value };
          }
        }
      }

      let snapped = false;

      // 3. Apply Visual Snaps
      if (bestSnapX) {
        const shiftX = bestSnapX.targetLine - bestSnapX.activeValue;
        target.set({ left: target.left! + shiftX });
        activeSnaps.current.x = bestSnapX.targetLine; // Lock the magnet
        
        if (guideLineVertical.current) {
          guideLineVertical.current.set({ left: bestSnapX.targetLine, visible: true });
          guideLineVertical.current.setCoords(); 
        }
        snapped = true;
      } else {
        activeSnaps.current.x = null; // Break the magnet
      }

      if (bestSnapY) {
        const shiftY = bestSnapY.targetLine - bestSnapY.activeValue;
        target.set({ top: target.top! + shiftY });
        activeSnaps.current.y = bestSnapY.targetLine;

        if (guideLineHorizontal.current) {
          guideLineHorizontal.current.set({ top: bestSnapY.targetLine, visible: true });
          guideLineHorizontal.current.setCoords(); 
        }
        snapped = true;
      } else {
        activeSnaps.current.y = null;
      }

      // 4. Finalize coordinates for rendering
      if (snapped) {
        target.setCoords(); 
      }
    });
    // --- END DRIFT-FREE SMART GUIDES ---

    canvas.on('mouse:down', (options) => {
     

      const tool = activeToolRef.current;
      const pointer = canvas.getScenePoint(options.e);

     
      if (tool === 'eraser') {
        isDrawing.current = true;
        isTransactionActive.current = true; 
        
      
        eraseObjectsInPath(pointer);
        return;
      }

     
      else if (tool === 'rectangle') {
        isDrawing.current = true;
        startPos.current = { x: pointer.x, y: pointer.y };
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          originX: 'left',
          originY: 'top',
          fill: optionsRef.current.fill,
          stroke: optionsRef.current.stroke,
          strokeWidth: optionsRef.current.strokeWidth,
          opacity:optionsRef.current.opacity,
          selectable: false,
          strokeUniform: true,
          objectCaching: false,
        });

        canvas.add(rect);
        activeShape.current = rect;
      }

     
      else if (tool === 'line') {
        isDrawing.current = true;
        const startPoint = { x: pointer.x, y: pointer.y };
        startPos.current = startPoint;

        const line = new fabric.Line(
          [startPoint.x, startPoint.y, startPoint.x, startPoint.y],
          {
            stroke: optionsRef.current.stroke,
            strokeWidth: optionsRef.current.strokeWidth,
            opacity:optionsRef.current.opacity,
            selectable: false,
            evented: false,
            originX: 'left',
            originY: 'top',
            objectCaching: false,
            strokeUniform: true,
            hasControls: true, 
          }
        );

       
        configureLineControls(line);

        canvas.add(line);
        activeShape.current = line;
      } else if (tool === 'arrow') {
        isDrawing.current = true;
        startPos.current = { x: pointer.x, y: pointer.y };

        
        const path = new fabric.Path(
          `M ${pointer.x} ${pointer.y} L ${pointer.x} ${pointer.y}`,
          {
            stroke: optionsRef.current.stroke,
            strokeWidth: optionsRef.current.strokeWidth,
            opacity:optionsRef.current.opacity,
            fill: null,
            selectable: false,
            evented: false,
            strokeLineCap: 'round',
            strokeUniform: true,
            objectCaching: false,
          }
        );

        canvas.add(path);
        activeShape.current = path;
      } else if (tool === 'text') {
        
        const text = new fabric.IText('Type here', {
          left: pointer.x,
          top: pointer.y,
          fontFamily: optionsRef.current.fontFamily,
          fill: optionsRef.current.fill,
          fontSize: optionsRef.current.fontSize,
          selectable: true, 
          evented: true,
          objectCaching: false,
          strokeUniform: true,
        });

        
        canvas.add(text);

       
        canvas.setActiveObject(text);
        text.enterEditing(); 
        text.selectAll(); 

        
        onToolChangeRef.current('selection');

        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:move', (options) => {
     
      if (!isDrawing.current) return;
      const tool = activeToolRef.current;
      const shape = activeShape.current;

      const pointer = canvas.getScenePoint(options.e);

      if (tool === 'eraser') {
        eraseObjectsInPath(pointer);
        return; 
      }

      else if (tool === 'rectangle' && shape) {
        const start = startPos.current;

       
        const left = Math.min(pointer.x, start.x);
        const top = Math.min(pointer.y, start.y);

        
        const width = Math.abs(pointer.x - start.x);
        const height = Math.abs(pointer.y - start.y);

       
        shape.set({
          left: left,
          top: top,
          width: width,
          height: height,
          
          originX: 'left',
          originY: 'top',
        });

       
        canvas.requestRenderAll();
      } else if (tool === 'line' && shape) {
        
        const line = shape as fabric.Line;

        
        line.set({
          x2: pointer.x,
          y2: pointer.y,
        });

       
        line.setCoords();

        canvas.requestRenderAll();
      } else if (tool === 'arrow' && shape) {
        const start = startPos.current;

        
        const pathData = getArrowPath(start, { x: pointer.x, y: pointer.y });

        
        const tempPath = new fabric.Path(pathData, {
          strokeWidth: shape.strokeWidth,
          strokeLineCap: shape.strokeLineCap,
        });

       
        const dims = tempPath.getBoundingRect();

       
        (shape as fabric.Path).set({
          path: tempPath.path, 
          width: tempPath.width, 
          height: tempPath.height,
          left: dims.left, 
          top: dims.top,
          pathOffset: tempPath.pathOffset, 
          originX: 'left',
          originY: 'top',
        });

        (shape as fabric.Path).setCoords();

        
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:up', () => {

      // --- ADD THIS CLEANUP BLOCK ---
      let needsRender = false;

      // --- ADD THIS: Wipe cache memory ---
      snapCache.current = null;
      activeSnaps.current = { x: null, y: null }; // <--- Add this
      // ----------------------------------

      if (guideLineVertical.current && guideLineVertical.current.visible) {
        guideLineVertical.current.set({ visible: false });
        needsRender = true;
      }
      if (guideLineHorizontal.current && guideLineHorizontal.current.visible) {
        guideLineHorizontal.current.set({ visible: false });
        needsRender = true;
      }

      // Force canvas to clear the hidden lines immediately
      if (needsRender) {
        canvas.requestRenderAll();
      }
      // ------------------------------

      if (isDrawing.current) {
        isDrawing.current = false;

        
        if (activeToolRef.current === 'eraser') {
          isTransactionActive.current = false; 

          
          if (historyTransaction.current.length > 0) {
            undoStack.current.push({
              type: 'batch',
              actions: [...historyTransaction.current]
            });
            
            
            historyTransaction.current = [];
            
            redoStack.current = [];
          }
          return;
        }


        if (activeShape.current) {
          activeShape.current.set({ selectable: true, evented: true });

         
          if (activeShape.current.type === 'line') {
            configureLineControls(activeShape.current as fabric.Line);
          } else if (activeShape.current.type === 'path') {
           
            configureArrowControls(activeShape.current as fabric.Path);
          }

          activeShape.current.setCoords();

          updateIndex(activeShape.current);

          canvas.setActiveObject(activeShape.current);
          onToolChangeRef.current('selection');
        }

        activeShape.current = null;
        canvas.requestRenderAll();
      }
    });

  
    canvas.on('object:added', (e) => {
      if (e.target) addToIndex(e.target);
    });
    canvas.on('object:removed', (e) => {
      if (e.target) removeFromIndex(e.target);
    });
    canvas.on('object:modified', (e) => {
      if (e.target) updateIndex(e.target);
    });



    
    const handleSelection = (obj: fabric.Object) => {
      if (!obj) return;

      const isText = obj.type === 'i-text' || obj.type === 'text';

      const newOptions = {
        
        stroke: isText ? '#000000' : ((obj.stroke as string) || '#000000'),
        
        
        strokeWidth: isText ? 0 : (obj.strokeWidth || 2),

       
        fill: (obj.fill as string) || '#000000',
        
        opacity: obj.opacity || 1,
        fontFamily: (obj as any).fontFamily || 'Arial',
        fontSize: (obj as any).fontSize || 24,
      };

      onOptionsChange(newOptions);
    };

    canvas.on('selection:created', (e) => {
      if (e.selected && e.selected[0]) {
        handleSelection(e.selected[0]);
      }
    });

    canvas.on('selection:updated', (e) => {
      if (e.selected && e.selected[0]) {
        handleSelection(e.selected[0]);
      }
    });




    
    canvas.on('object:added', (e) => {
      if (e.target && (e.target as any).id === 'smart-guide') return;
      if (e.target && !historyLocked.current) {
        saveAction({ type: 'add', object: e.target });
      }
    });

    canvas.on('object:removed', (e) => {
      if (e.target && (e.target as any).id === 'smart-guide') return;
      if (e.target && !historyLocked.current) {
        saveAction({ type: 'remove', object: e.target });
      }
    });

    
    let transformStartProps: any = {};

    canvas.on('before:transform', (e) => {
      const t = e.transform;
      if (!t || !t.target) return;
      
      transformStartProps = {
        left: t.target.left,
        top: t.target.top,
        scaleX: t.target.scaleX,
        scaleY: t.target.scaleY,
        angle: t.target.angle,
        width: t.target.width,
        height: t.target.height,
        path: (t.target as fabric.Path).path,
        pathOffset: (t.target as fabric.Path).pathOffset,
      };

      
      // --- ADD THIS: POPULATE SNAP CACHE ---
      const targets = canvas.getObjects().filter(
        obj => obj !== t.target && (obj as any).id !== 'smart-guide' && obj.visible
      );
      
      // Use Sets to automatically remove duplicate overlapping coordinate lines
      const vAxes = new Set<number>();
      const hAxes = new Set<number>();
      
      targets.forEach(obj => {
        const bbox = obj.getBoundingRect();
        vAxes.add(bbox.left);
        vAxes.add(bbox.left + bbox.width / 2);
        vAxes.add(bbox.left + bbox.width);
        
        hAxes.add(bbox.top);
        hAxes.add(bbox.top + bbox.height / 2);
        hAxes.add(bbox.top + bbox.height);
      });

      snapCache.current = { vertical: Array.from(vAxes), horizontal: Array.from(hAxes) };
      activeSnaps.current = { x: null, y: null };
      // ------------------------------------

    });

    canvas.on('object:modified', (e) => {
      const obj = e.target;
      if (!obj || historyLocked.current) return;

      
      if (obj.type === 'activeSelection' && (obj as fabric.ActiveSelection).getObjects) {
        (obj as fabric.ActiveSelection).getObjects().forEach((child) => {
          updateIndex(child);
        });
      } else {
        updateIndex(obj);
      }

      
      
       const currentProps = {
        left: obj.left,
        top: obj.top,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        width: obj.width,
        height: obj.height,
        path: (obj as fabric.Path).path,
        pathOffset: (obj as fabric.Path).pathOffset,
      };


      if (JSON.stringify(transformStartProps) === JSON.stringify(currentProps)) {
        return;
      }

      saveAction({
        type: 'modify',
        object: obj,
        before: transformStartProps,
        after: currentProps
      });
    });

    canvas.on('selection:cleared', (e) => {
      if (e.deselected) {
        e.deselected.forEach((obj) => {
          updateIndex(obj);
        });
      }
    });

    
    const cloneFabricObject = async (obj: fabric.Object): Promise<fabric.Object> => {
      
      try {
        
        const maybePromise = (obj as any).clone();
       
        if (maybePromise && typeof maybePromise.then === 'function') {
          const cloned = await maybePromise;
          if (cloned) return cloned;
        }
      } catch (e) {
        
      }

      
      return await new Promise<fabric.Object>((resolve) => {
        (obj as any).clone((cloned: fabric.Object) => {
          resolve(cloned);
        });
      });
    };

    
    const addAndIndex = (obj: fabric.Object) => {
     
      obj.set({
        evented: true,
        selectable: true,
      });

      
      if (typeof obj.left === 'number' && typeof obj.top === 'number') {
        obj.set({
          left: obj.left + 20,
          top: obj.top + 20,
        });
      }

      
      canvas.add(obj);

      
      if (obj.type === 'line') configureLineControls(obj as fabric.Line);
      else if (obj.type === 'path') configureArrowControls(obj as fabric.Path);

      
      obj.setCoords();

      
      updateIndex(obj);
    };



    

    const copy = async () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      
      const cloned = await activeObject.clone(['id']);
      clipboard.current = cloned;
    };

    const paste = async () => {
      if (!clipboard.current) return;

      
      const isActiveSelection =
        clipboard.current.type === 'activeSelection' ||
        (clipboard.current.getObjects && typeof clipboard.current.getObjects === 'function');

      
      if (isActiveSelection) {
        
        const sourceObjects = clipboard.current.getObjects
          ? clipboard.current.getObjects()
          : (clipboard.current._objects || []);

        const pastedObjects: fabric.Object[] = [];

        
        for (const src of sourceObjects) {
          const cloned = await cloneFabricObject(src);

          
          try {
            const bbox = src.getBoundingRect(true); 
            cloned.set({
              left: (typeof bbox.left === 'number' ? bbox.left : (src.left ?? 0)) + 20,
              top:  (typeof bbox.top === 'number'  ? bbox.top  : (src.top  ?? 0)) + 20,
            });
          } catch {
            
            cloned.set({
              left: (src.left ?? 0) + 20,
              top:  (src.top  ?? 0) + 20,
            });
          }

          
          cloned.canvas = undefined as unknown as fabric.Canvas;

          pastedObjects.push(cloned);
        }

        
        pastedObjects.forEach((p) => addAndIndex(p));

        
        const newSelection = new fabric.ActiveSelection(pastedObjects, { canvas: canvas });
        canvas.setActiveObject(newSelection);

        
        updateVisibleObjects();
        canvas.requestRenderAll();
        return;
      }

      
      const clonedObj = await clipboard.current.clone(['id']);
      canvas.discardActiveObject();
      clonedObj.set({
        left: clonedObj.left + 20,
        top: clonedObj.top + 20,
        evented: true,
      });

      if (clonedObj.type === 'activeSelection') {
        
        clonedObj.canvas = canvas;
        clonedObj.forEachObject((obj: any) => {
          canvas.add(obj);
          if (obj.type === 'line') configureLineControls(obj);
          else if (obj.type === 'path') configureArrowControls(obj);
          obj.setCoords();
          updateIndex(obj);
        });

        const newSelection = new fabric.ActiveSelection(clonedObj.getObjects(), {
          canvas: canvas,
        });
        canvas.setActiveObject(newSelection);
      } else {
        canvas.add(clonedObj);
        if (clonedObj.type === 'line') configureLineControls(clonedObj);
        else if (clonedObj.type === 'path') configureArrowControls(clonedObj);
        clonedObj.setCoords();
        updateIndex(clonedObj);
        canvas.setActiveObject(clonedObj);
      }

      canvas.requestRenderAll();
    };



    
    const handleKeyDown = async (e: KeyboardEvent) => {
      
      const isCmd = e.ctrlKey || e.metaKey;

      
      if (isCmd && e.key === 'z') {
        e.preventDefault(); 
        undo();
      }
      
      
      if (isCmd && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      
      if (isCmd && e.key === 'c') {
        e.preventDefault();
        await copy();
      }

      
      if (isCmd && e.key === 'v') {
        e.preventDefault();
        await paste();
      }
    };

    window.addEventListener('keydown', handleKeyDown);




    
    const updateVisibleObjects = () => {



      const canvas = canvasInstance.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      
      const inv = fabric.util.invertTransform(vpt);
      const tl = fabric.util.transformPoint({ x: 0, y: 0 }, inv);
      const br = fabric.util.transformPoint(
        { x: canvas.width, y: canvas.height },
        inv
      );

      
      const results = spatialIndex.current.search({
        minX: tl.x,
        minY: tl.y,
        maxX: br.x,
        maxY: br.y,
      });

     
      const visibleObjects = new Set(results.map((item: any) => item.id));
      const objects = canvas.getObjects();

      let hasChanges = false;

      objects.forEach((obj) => {
        
        
        // ADD THIS LINE: Exempt smart guides from visibility culling
        if ((obj as any).id === 'smart-guide') return;

        const shouldBeVisible = visibleObjects.has(obj);

        if (obj.visible !== shouldBeVisible) {
          obj.visible = shouldBeVisible;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        canvas.requestRenderAll();
      }
    };

    canvas.on('mouse:wheel', function (opt) {
      const evt = opt.e as WheelEvent;
      evt.preventDefault();
      evt.stopPropagation();

      
      if (evt.ctrlKey || evt.metaKey) {
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** evt.deltaY;
        
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);
      } else {
        const vpt = canvas.viewportTransform;
        if (!vpt) return;
        vpt[5] -= evt.deltaY;
        vpt[4] -= evt.deltaX;
      }

      
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        activeObject.setCoords();
      }

      
      canvas.requestRenderAll();

      
      updateVisibleObjects();
    });

    const handleResize = () => {
      canvas.setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      updateVisibleObjects();
      canvas.requestRenderAll();
    };
    window.addEventListener('resize', handleResize);

   
    updateVisibleObjects();
    canvas.requestRenderAll();

    return () => {
      canvas.dispose();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#f3f3f3]">
      <canvas ref={canvasEl} className="block" />
    </div>
  );
};

export default Whiteboard;