'use client';

import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { Tool } from '@/app/page';
import RBush from 'rbush';

interface WhiteboardProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

const Whiteboard = ({ activeTool, onToolChange }: WhiteboardProps) => {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvasInstance = useRef<fabric.Canvas | null>(null);
  const onToolChangeRef = useRef(onToolChange);

  // 1. STATE SYNC REF
  // We use this to access the current tool inside Fabric event listeners
  // without re-binding the listeners on every render.
  const activeToolRef = useRef(activeTool);

  // --- NEW REFS FOR SHAPE DRAWING ---
  const isDrawing = useRef(false); // Are we currently dragging?
  const startPos = useRef({ x: 0, y: 0 }); // Where did we click?
  const activeShape = useRef<fabric.Object | null>(null); // The shape being resized

  // SPATIAL INDEX REFS
  const spatialIndex = useRef(new RBush());
  const objectMap = useRef(new Map<fabric.Object, any>());


  // --- HISTORY REFS ---
  const undoStack = useRef<any[]>([]);
  const redoStack = useRef<any[]>([]);
  const historyLocked = useRef(false); // Prevents "Undo" from recording itself


  // --- [NEW] BATCH TRANSACTION REFS ---
  // Stores actions temporarily while the user is dragging the eraser
  const historyTransaction = useRef<any[]>([]); 
  // Flag to tell saveAction: "Don't save to main stack yet, save to transaction buffer"
  const isTransactionActive = useRef(false);

  // --- NEW REF FOR CLIPBOARD ---
  const clipboard = useRef<any>(null);


  // CUSTOM LINE CONTROLS HELPER
  // CUSTOM LINE CONTROLS HELPER
  const configureLineControls = (line: fabric.Line) => {
    line.setControlsVisibility({
      tl: false, tr: false, bl: false, br: false,
      ml: false, mt: false, mr: false, mb: false, mtr: false,
    });

    // 1. Logic Helper: World Coordinates (Grid)
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

    // 2. Update Handler (Logic uses World Coordinates)
    const moveEnd = (key: 'p1' | 'p2', eventData: any, transformData: any, x: number, y: number) => {
      const targetLine = transformData.target as fabric.Line;
      const staticPoint = getWorldPosition(key === 'p1' ? 'p2' : 'p1', targetLine);
      const newPoint = { x, y }; // These x,y come from mouse event (World Coords)
      
      const newCoords = key === 'p1' 
        ? { x1: newPoint.x, y1: newPoint.y, x2: staticPoint.x, y2: staticPoint.y }
        : { x1: staticPoint.x, y1: staticPoint.y, x2: newPoint.x, y2: newPoint.y };

      targetLine.set(newCoords);
      targetLine.set({ angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, originX: 'left', originY: 'top' });
      targetLine.setCoords();
      return true;
    };

    // 3. Render Helper (Visuals)
    // We move the "Screen" conversion inside the render function where it belongs
    const drawDot = (ctx: CanvasRenderingContext2D, left: number, top: number, style: any, fabricObject: fabric.Object) => {
        // We calculate the screen position JUST IN TIME for drawing
        const canvas = fabricObject.canvas;
        if (!canvas) return;

        // "left" and "top" passed here are World Coordinates because positionHandler returns World
        const point = new fabric.Point(left, top);
        const screenPoint = fabric.util.transformPoint(point, canvas.viewportTransform || [1,0,0,1,0,0]);

        ctx.save();
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        // Use the calculated screen point
        ctx.arc(screenPoint.x, screenPoint.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };

    // 4. Assign Controls
    line.controls.startPoint = new fabric.Control({
      x: -0.5, y: -0.5, cursorStyle: 'crosshair',
      // FIX: Return WORLD position, not Screen position
      positionHandler: (dim, finalMatrix, fabricObject) => getWorldPosition('p1', fabricObject as fabric.Line),
      actionHandler: (e, data, x, y) => moveEnd('p1', e, data, x, y),
      render: drawDot, // Use our updated renderer
    });

    line.controls.endPoint = new fabric.Control({
      x: 0.5, y: 0.5, cursorStyle: 'crosshair',
      // FIX: Return WORLD position
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
    const arrowAngle = Math.PI / 6; // 30 degrees
    // Calculate Wing Tips
    const x1 = end.x - headLength * Math.cos(angle - arrowAngle);
    const y1 = end.y - headLength * Math.sin(angle - arrowAngle);
    const x2 = end.x - headLength * Math.cos(angle + arrowAngle);
    const y2 = end.y - headLength * Math.sin(angle + arrowAngle);
    // Path Data: Start -> Shaft -> Tip -> Wing 1 -> Tip -> Wing 2
    return `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${end.x} ${end.y} L ${x1} ${y1} M ${end.x} ${end.y} L ${x2} ${y2}`;
  };

  const configureArrowControls = (arrow: fabric.Path) => {
    arrow.setControlsVisibility({
      tl: false, tr: false, bl: false, br: false,
      ml: false, mt: false, mr: false, mb: false, mtr: false,
    });

    // ... (Keep type PathCommand and getArrowWorldPosition exactly as they are) ...
    // ... (They are already correct) ...

    type PathCommand = ['M' | 'L', number, number] | ['M' | 'L', number, number, ...any[]];
    const getArrowWorldPosition = (key: 'p1' | 'p2', fabricObject: fabric.Path) => {
        // ... (Keep your existing code for this function) ...
        const path = fabricObject.path as PathCommand[];
        const pathOffset = fabricObject.pathOffset; 
        if (!Array.isArray(path) || path.length < 2) return new fabric.Point(0, 0);
        let rawX = 0, rawY = 0;
        if (key === 'p1' && path[0].length >= 3) { rawX = path[0][1]; rawY = path[0][2]; } 
        else if (key === 'p2' && path[1].length >= 3) { rawX = path[1][1]; rawY = path[1][2]; }
        const localPoint = new fabric.Point(rawX - (pathOffset?.x || 0), rawY - (pathOffset?.y || 0));
        return fabric.util.transformPoint(localPoint, fabricObject.calcTransformMatrix());
    };

    // ❌ DELETED: const getScreenPosition = ... (We don't need it)

    // ... (Keep moveArrowEnd exactly as is) ...
    const moveArrowEnd = (key: 'p1' | 'p2', eventData: any, transformData: any, x: number, y: number) => {
       // ... (Your existing logic is fine here) ...
       // ... Just paste your existing moveArrowEnd code ...
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

    // UPDATE RENDERER
    const drawDot = (ctx: CanvasRenderingContext2D, left: number, top: number, style: any, fabricObject: fabric.Object) => {
        const canvas = fabricObject.canvas;
        if (!canvas) return;
        // Transform World -> Screen just for drawing
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

    // ASSIGN CONTROLS
    arrow.controls.startPoint = new fabric.Control({
      x: -0.5, y: -0.5, cursorStyle: 'crosshair',
      // FIX: Return WORLD position
      positionHandler: (dim, finalMatrix, obj) => getArrowWorldPosition('p1', obj as fabric.Path),
      actionHandler: (e, data, x, y) => moveArrowEnd('p1', e, data, x, y),
      render: drawDot,
    });

    arrow.controls.endPoint = new fabric.Control({
      x: 0.5, y: 0.5, cursorStyle: 'crosshair',
      // FIX: Return WORLD position
      positionHandler: (dim, finalMatrix, obj) => getArrowWorldPosition('p2', obj as fabric.Path),
      actionHandler: (e, data, x, y) => moveArrowEnd('p2', e, data, x, y),
      render: drawDot,
    });
  };

  // Sync the Ref whenever the Prop changes
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    onToolChangeRef.current = onToolChange;
  }, [onToolChange]);

  // --- TOOL SWITCHING LOGIC ---
  useEffect(() => {
    const canvas = canvasInstance.current;
    if (!canvas) return;

    if (isDrawing.current && activeShape.current) {
      canvas.remove(activeShape.current); // Delete the ghost shape
      activeShape.current = null; // Clear the ref
      isDrawing.current = false; // Reset the flag
      canvas.requestRenderAll(); // Clear the screen immediately
    }

    // Reset defaults first
    canvas.isDrawingMode = false;
    canvas.selection = false;

    canvas.discardActiveObject();

    // Iterate over all objects to reset their selectability
    // (We lock objects when using Pencil/Eraser so you don't accidentally drag them)
    canvas.getObjects().forEach((obj) => {
      obj.selectable = activeTool === 'selection';
      obj.evented = true; // Always let them receive events (so we can click to erase)
    });

    switch (activeTool) {
      case 'selection':
        canvas.selection = true; // Enable the blue drag-selection box
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
        canvas.defaultCursor = 'not-allowed'; // Visual cue that you are in delete mode
        break;

      case 'rectangle':
      case 'line':
      case 'arrow':
      case 'text':
        // (Placeholder for next steps)
        canvas.defaultCursor = 'crosshair';
        break;
    }

    canvas.requestRenderAll();
  }, [activeTool]);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!canvasEl.current) return;

    

    // --- HISTORY HELPERS ---

    const saveAction = (action: any) => {
      if (historyLocked.current) return;

      // [NEW LOGIC] Check if we are in the middle of a batch (drag) operation
      if (isTransactionActive.current) {
        historyTransaction.current.push(action);
        return;
      }
      
      // [EXISTING LOGIC]
      undoStack.current.push(action);
      if (redoStack.current.length > 0) {
        redoStack.current = [];
      }
    };

    // --- UNDO / REDO LOGIC ---

    // [NEW HELPER] Handles the logic for a single item
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

    // [UPDATED] Main Apply Action
    const applyAction = (action: any, isUndo: boolean) => {
      historyLocked.current = true; // Lock history

      if (action.type === 'batch') {
        // [NEW] Handle Batch
        // If undoing, reverse the array to undo the last deletion first
        const actionsToProcess = isUndo ? [...action.actions].reverse() : action.actions;
        actionsToProcess.forEach((subAction: any) => applySingleAction(subAction, isUndo));
      } else {
        // Handle Standard Single Action
        applySingleAction(action, isUndo);
      }

      historyLocked.current = false; // Unlock
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

    // --- SPATIAL INDEX HELPERS ---

    const addToIndex = (obj: fabric.Object) => {
      const box = obj.getBoundingRect();
      const item = {
        minX: box.left,
        minY: box.top,
        maxX: box.left + box.width,
        maxY: box.top + box.height,
        id: obj, // Store reference to actual object
      };

      spatialIndex.current.insert(item);
      objectMap.current.set(obj, item);
    };

    const removeFromIndex = (obj: fabric.Object) => {
      const item = objectMap.current.get(obj);
      if (item) {
        spatialIndex.current.remove(item);
        objectMap.current.delete(obj);
      }
    };

    const updateIndex = (obj: fabric.Object) => {
      // Fabric objects change size/position, so we must remove old and add new
      removeFromIndex(obj);
      addToIndex(obj);
    };

    const canvas = new fabric.Canvas(canvasEl.current, {
      width: window.innerWidth,
      height: window.innerHeight,
      selection: true, // Default
      enableRetinaScaling: true,
      renderOnAddRemove: false,
    });
    canvasInstance.current = canvas;

    // --- PROCEDURAL INFINITE GRID (Method 3) ---
    const gridSize = 50;
    const gridColor = '#e5e5e5';

    canvas.on('before:render', () => {
      const ctx = canvas.getContext();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      const zoom = canvas.getZoom();
      const width = canvas.width;
      const height = canvas.height;

      // 1. Define base size
      const baseGridSize = 50;

      // 2. Adaptive Sizing (The Fix)
      // Calculate how big the grid square looks on the actual screen
      let visualGridSize = baseGridSize * zoom;

      // If the grid gets too tiny (zoomed out), double the spacing until it's readable.
      // This prevents the loop from running 5000+ times per frame at low zoom.
      // 15px is a good threshold for "too small to see".
      while (visualGridSize < 15) {
        visualGridSize *= 2;
      }

      // 3. Calculate Pan Offset
      // We use the NEW visual size to align the grid
      const offsetX = vpt[4] % visualGridSize;
      const offsetY = vpt[5] % visualGridSize;

      ctx.save();
      ctx.beginPath();

      // 4. Draw Vertical Lines
      // Start slightly off-screen to ensure continuous lines during pan
      for (let x = offsetX; x < width; x += visualGridSize) {
        // "Math.round - 0.5" aligns the line to the pixel grid for crisp 1px lines
        // preventing the "blurry line" effect common in canvas.
        const snapX = Math.round(x) - 0.5;
        ctx.moveTo(snapX, 0);
        ctx.lineTo(snapX, height);
      }

      // 5. Draw Horizontal Lines
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

      // Define a small "Eraser Hitbox" (e.g., 10x10 pixels around cursor)
      const eraserSize = 10;
      const searchBox = {
        minX: pointer.x - eraserSize,
        minY: pointer.y - eraserSize,
        maxX: pointer.x + eraserSize,
        maxY: pointer.y + eraserSize
      };

      // 1. Efficiently find candidates using RBush
      const results = spatialIndex.current.search(searchBox);

      // 2. Iterate and remove
      results.forEach((item: any) => {
        const obj = item.id; // The actual Fabric object
        
        // Optional: Add a precise check (e.g., obj.containsPoint) 
        // For now, the bounding box check from RBush is fast and feels good for a "Block Eraser"
        
        // This will trigger 'object:removed', which calls 'saveAction'
        // Because 'isTransactionActive' is true, it saves to the batch buffer!
        canvas.remove(obj); 
      });
      
      if (results.length > 0) {
        canvas.requestRenderAll();
      }
    };



    // --- MOUSE EVENT LISTENERS (The "Brain" of the tools) ---

    canvas.on('mouse:down', (options) => {
      // if (!isDrawing.current) return;

      const tool = activeToolRef.current; // Get the current tool safely
      const pointer = canvas.getScenePoint(options.e); // Get absolute world coordinates

      // ERASER LOGIC
      if (tool === 'eraser') {
        isDrawing.current = true; // Flag that we are "dragging"
        isTransactionActive.current = true; // START BATCH TRANSACTION
        
        // Perform one erase immediately (for simple clicks)
        eraseObjectsInPath(pointer);
        return;
      }

      // SELECTION LOGIC
      // (Handled automatically by Fabric if isDrawingMode is false)

      // Rectangle logic
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
          fill: 'transparent',
          stroke: 'black',
          strokeWidth: 2,
          selectable: false,
          strokeUniform: true,
          objectCaching: false,
        });

        canvas.add(rect);
        activeShape.current = rect;
      }

      // Line Tool Logic
      else if (tool === 'line') {
        isDrawing.current = true;
        const startPoint = { x: pointer.x, y: pointer.y };
        startPos.current = startPoint;

        const line = new fabric.Line(
          [startPoint.x, startPoint.y, startPoint.x, startPoint.y],
          {
            stroke: 'black',
            strokeWidth: 2,
            selectable: false,
            evented: false,
            originX: 'left',
            originY: 'top',
            objectCaching: false,
            strokeUniform: true,
            hasControls: true, // CHANGED: Enable controls
          }
        );

        // Apply custom controls immediately
        configureLineControls(line);

        canvas.add(line);
        activeShape.current = line;
      } else if (tool === 'arrow') {
        isDrawing.current = true;
        startPos.current = { x: pointer.x, y: pointer.y };

        // Create initial "dot" arrow
        // We use absolute coordinates directly because we are going to recreate it anyway
        const path = new fabric.Path(
          `M ${pointer.x} ${pointer.y} L ${pointer.x} ${pointer.y}`,
          {
            stroke: 'black',
            strokeWidth: 2,
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
        // 1. Create Interactive Text Object
        const text = new fabric.IText('Type here', {
          left: pointer.x,
          top: pointer.y,
          fontFamily: 'sans-serif',
          fill: '#000000',
          fontSize: 20,
          selectable: true, // Needs to be true so we can type
          evented: true,
          objectCaching: false,
          strokeUniform: true,
        });

        // 2. Add to Canvas
        canvas.add(text);

        // 3. Enter Editing Mode Immediately
        canvas.setActiveObject(text);
        text.enterEditing(); // Enters "Type Mode"
        text.selectAll(); // Selects "Type here" so the first keypress overwrites it

        // 4. Auto-Switch back to Selection
        // This allows the user to click outside the box to finish editing
        // without creating a new text object.
        onToolChangeRef.current('selection');

        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:move', (options) => {
      // 1. Safety Checks
      if (!isDrawing.current) return;
      const tool = activeToolRef.current;
      const shape = activeShape.current;

      const pointer = canvas.getScenePoint(options.e);

      if (tool === 'eraser') {
        eraseObjectsInPath(pointer);
        return; // Stop here, don't run shape logic
      }

      else if (tool === 'rectangle' && shape) {
        const start = startPos.current;

        // 2. Calculate Geometry
        // "Math.min" ensures 'left' is always the top-left-most coordinate
        const left = Math.min(pointer.x, start.x);
        const top = Math.min(pointer.y, start.y);

        // "Math.abs" ensures width is always positive
        const width = Math.abs(pointer.x - start.x);
        const height = Math.abs(pointer.y - start.y);

        // 3. Update Shape
        shape.set({
          left: left,
          top: top,
          width: width,
          height: height,
          // explicit origin ensures coordinates are strictly respected
          originX: 'left',
          originY: 'top',
        });

        // 4. Force Update
        canvas.requestRenderAll();
      } else if (tool === 'line' && shape) {
        // Cast shape to Line so TypeScript knows about .set({ x2, y2 })
        const line = shape as fabric.Line;

        // Standard Fabric Line update
        line.set({
          x2: pointer.x,
          y2: pointer.y,
        });

        // Recalculate dimensions so selection box matches visual line
        line.setCoords();

        canvas.requestRenderAll();
      } else if (tool === 'arrow' && shape) {
        const start = startPos.current;

        // 1. Calculate the new Path Data string
        const pathData = getArrowPath(start, { x: pointer.x, y: pointer.y });

        // 2. Create a lightweight "Ghost" path to calculate geometry
        // We do not add this to the canvas. It exists only in memory for a microsecond.
        // We pass strokeWidth to ensure the bounding box calculation matches the real object.
        const tempPath = new fabric.Path(pathData, {
          strokeWidth: shape.strokeWidth,
          strokeLineCap: shape.strokeLineCap,
        });

        // 3. Calculate the new Bounding Box
        const dims = tempPath.getBoundingRect();

        // 4. Mutate the EXISTING object (The Fix)
        // Instead of removing/adding, we update the properties of the living object.
        // We must manually update width/height/left/top/pathOffset to match the new geometry.
        (shape as fabric.Path).set({
          path: tempPath.path, // Update the drawing instructions
          width: tempPath.width, // Update the width
          height: tempPath.height, // Update the height
          left: dims.left, // Update world position X
          top: dims.top, // Update world position Y
          pathOffset: tempPath.pathOffset, // Update internal center offset
          originX: 'left', // Ensure anchor is top-left
          originY: 'top',
        });

        (shape as fabric.Path).setCoords();

        // 5. Render
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:up', () => {
      if (isDrawing.current) {
        isDrawing.current = false;

        // [NEW] COMMIT ERASER BATCH
        if (activeToolRef.current === 'eraser') {
          isTransactionActive.current = false; // END BATCH

          // If we actually deleted something, save the batch to Undo Stack
          if (historyTransaction.current.length > 0) {
            undoStack.current.push({
              type: 'batch',
              actions: [...historyTransaction.current] // Create a copy
            });
            
            // Clear the buffer for next time
            historyTransaction.current = [];
            // Clear Redo stack since we made a new change
            redoStack.current = [];
          }
          return;
        }


        if (activeShape.current) {
          activeShape.current.set({ selectable: true, evented: true });

          // If it's a line, reapply custom controls
          if (activeShape.current.type === 'line') {
            configureLineControls(activeShape.current as fabric.Line);
          } else if (activeShape.current.type === 'path') {
            // Note: fabric.Path usually has type 'path'
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

    // --- SYNC INDEX WITH CANVAS ---
    canvas.on('object:added', (e) => {
      if (e.target) addToIndex(e.target);
    });
    canvas.on('object:removed', (e) => {
      if (e.target) removeFromIndex(e.target);
    });
    canvas.on('object:modified', (e) => {
      if (e.target) updateIndex(e.target);
    });



    // --- HISTORY RECORDERS ---
    
    // 1. ADD / REMOVE
    canvas.on('object:added', (e) => {
      if (e.target && !historyLocked.current) {
        saveAction({ type: 'add', object: e.target });
      }
    });

    canvas.on('object:removed', (e) => {
      if (e.target && !historyLocked.current) {
        saveAction({ type: 'remove', object: e.target });
      }
    });

    // 2. MODIFICATION SNAPSHOTS
    // We need to capture state BEFORE the drag starts
    let transformStartProps: any = {};

    canvas.on('before:transform', (e) => {
      const t = e.transform;
      if (!t || !t.target) return;
      // Capture the essential properties
      transformStartProps = {
        left: t.target.left,
        top: t.target.top,
        scaleX: t.target.scaleX,
        scaleY: t.target.scaleY,
        angle: t.target.angle,
        width: t.target.width,
        height: t.target.height,
        path: (t.target as fabric.Path).path, // Capture path for arrows
        pathOffset: (t.target as fabric.Path).pathOffset,
      };
    });

    canvas.on('object:modified', (e) => {
      const obj = e.target;
      if (!obj || historyLocked.current) return;

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

      saveAction({
        type: 'modify',
        object: obj,
        before: transformStartProps,
        after: currentProps
      });
    });


    // Helper: clone a Fabric object robustly (works with callback-style and Promise-style clone APIs)
    const cloneFabricObject = async (obj: fabric.Object): Promise<fabric.Object> => {
      // Try Promise-style clone (Fabric v6+ may return a Promise)
      try {
        // Some Fabric versions return a Promise from clone()
        const maybePromise = (obj as any).clone();
        // If it returned a thenable / Promise, await it:
        if (maybePromise && typeof maybePromise.then === 'function') {
          const cloned = await maybePromise;
          if (cloned) return cloned;
        }
      } catch (e) {
        // ignore - we'll try the callback fallback
      }

      // Callback-style fallback: obj.clone(cb)
      return await new Promise<fabric.Object>((resolve) => {
        (obj as any).clone((cloned: fabric.Object) => {
          resolve(cloned);
        });
      });
    };

    // Helper: add an object to canvas, reapply controls, set coords, and ensure RBush index is updated
    const addAndIndex = (obj: fabric.Object) => {
      // Make sure the object is interactive and visible
      obj.set({
        evented: true,
        selectable: true,
      });

      // Small visual offset so paste is visible as a duplicate
      if (typeof obj.left === 'number' && typeof obj.top === 'number') {
        obj.set({
          left: obj.left + 20,
          top: obj.top + 20,
        });
      }

      // Add to canvas (this will ensure object belongs to the canvas)
      canvas.add(obj);

      // Re-apply any custom controls for special object types
      if (obj.type === 'line') configureLineControls(obj as fabric.Line);
      else if (obj.type === 'path') configureArrowControls(obj as fabric.Path);

      // Force geometry recalculation
      obj.setCoords();

      // Immediately update our RBush index (prevents culling race)
      updateIndex(obj);
    };



    // --- COPY & PASTE LOGIC ---

    const copy = async () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      // Clone the object. In Fabric v6+, this is async.
      // We explicitly ask to include specific properties if needed.
      const cloned = await activeObject.clone(['id']);
      clipboard.current = cloned;
    };

    const paste = async () => {
      if (!clipboard.current) return;

      // If clipboard is an ActiveSelection (multi-object)
      const isActiveSelection =
        clipboard.current.type === 'activeSelection' ||
        (clipboard.current.getObjects && typeof clipboard.current.getObjects === 'function');

      // NEW: if it's a multi-object selection, clone each object individually
      if (isActiveSelection) {
        // Get the source objects from the clipboard group/selection
        const sourceObjects = clipboard.current.getObjects
          ? clipboard.current.getObjects()
          : (clipboard.current._objects || []);

        const pastedObjects: fabric.Object[] = [];

        // Clone each object individually (avoids group-relative transform bugs)
        for (const src of sourceObjects) {
          const cloned = await cloneFabricObject(src);

          // Try to base pasted position on the source object's bounding rect (world coords)
          // getBoundingRect(true) uses object's transform; works when src was on canvas
          try {
            const bbox = src.getBoundingRect(true); // true = absolute coords
            cloned.set({
              left: (typeof bbox.left === 'number' ? bbox.left : (src.left ?? 0)) + 20,
              top:  (typeof bbox.top === 'number'  ? bbox.top  : (src.top  ?? 0)) + 20,
            });
          } catch {
            // fallback - use src.left/top if bbox fails
            cloned.set({
              left: (src.left ?? 0) + 20,
              top:  (src.top  ?? 0) + 20,
            });
          }

          // Disconnect cloned from any original group/canvas
          cloned.canvas = undefined as unknown as fabric.Canvas;

          pastedObjects.push(cloned);
        }

        // Add each cloned object to the canvas and update index synchronously
        pastedObjects.forEach((p) => addAndIndex(p));

        // Create a new ActiveSelection from the freshly added objects and select them
        const newSelection = new fabric.ActiveSelection(pastedObjects, { canvas: canvas });
        canvas.setActiveObject(newSelection);

        // Make sure culling/visibility is correct now that RBush is up-to-date
        updateVisibleObjects();
        canvas.requestRenderAll();
        return;
      }

      // --- SINGLE-OBJECT paste (unchanged, but included for completeness) ---
      const clonedObj = await clipboard.current.clone(['id']);
      canvas.discardActiveObject();
      clonedObj.set({
        left: clonedObj.left + 20,
        top: clonedObj.top + 20,
        evented: true,
      });

      if (clonedObj.type === 'activeSelection') {
        // If Fabric returned an activeSelection, add each object individually
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



    // --- KEYBOARD LISTENERS ---
    // --- KEYBOARD LISTENERS ---
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check for Ctrl (Windows) or Meta (Mac)
      const isCmd = e.ctrlKey || e.metaKey;

      // UNDO
      if (isCmd && e.key === 'z') {
        e.preventDefault(); 
        undo();
      }
      
      // REDO
      if (isCmd && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      // COPY
      if (isCmd && e.key === 'c') {
        e.preventDefault();
        await copy();
      }

      // PASTE
      if (isCmd && e.key === 'v') {
        e.preventDefault();
        await paste();
      }
    };

    window.addEventListener('keydown', handleKeyDown);




    // --- STANDARD CANVAS FEATURES (Zoom, Pan, Cull) ---

    // --- OPTIMIZED CULLING (RBUSH) ---
    const updateVisibleObjects = () => {
      const canvas = canvasInstance.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      // 1. Calculate World Viewport
      // Invert the transform to find coordinates in "World Space"
      const inv = fabric.util.invertTransform(vpt);
      const tl = fabric.util.transformPoint({ x: 0, y: 0 }, inv);
      const br = fabric.util.transformPoint(
        { x: canvas.width, y: canvas.height },
        inv
      );

      // 2. Query the Index (Fast!)
      const results = spatialIndex.current.search({
        minX: tl.x,
        minY: tl.y,
        maxX: br.x,
        maxY: br.y,
      });

      // 3. Update Visibility
      // Use a Set for O(1) lookups
      const visibleObjects = new Set(results.map((item: any) => item.id));
      const objects = canvas.getObjects();

      let hasChanges = false;

      objects.forEach((obj) => {
        // Fast boolean check instead of heavy matrix math
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

      // 1. Update Camera (Fast)
      if (evt.ctrlKey || evt.metaKey) {
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** evt.deltaY;
        // Clamp zoom
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);
      } else {
        const vpt = canvas.viewportTransform;
        if (!vpt) return;
        vpt[5] -= evt.deltaY;
        vpt[4] -= evt.deltaX;
      }

      // 2. Fix Control Glitch (The previous fix)
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        activeObject.setCoords();
      }

      // 3. Render the Camera Movement
      canvas.requestRenderAll();

      // 4. Heavy Logic: Update Culling (Throttled)
      // Instead of running this 100x a second, we run it once the scroll settles
      // or simply rely on the fact that requestRenderAll handles the visual update.
      // For standard usage, calling this on every frame is overkill.
      // We can actually skip calling updateVisibleObjects() here for pure performance
      // if your shapes aren't massive images.
      // If you MUST cull, keep it, but the previous snippet optimizes it.
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

    // Initial render
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