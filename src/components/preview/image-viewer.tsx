'use client';

import { Maximize, Maximize2, Minimize2, Minus, Plus, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFullscreen } from './use-fullscreen';

/** Image preview with zoom and rotate. */
export function ImageViewer({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
  return (
    <div
      ref={fsRef}
      className={
        isFullscreen
          ? 'grid h-screen grid-rows-[auto_minmax(0,1fr)] gap-2 bg-surface p-3'
          : 'grid gap-2'
      }
      data-testid="image-viewer"
    >
      <div
        role="toolbar"
        aria-label="Image tools"
        className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px]"
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))}
        >
          <Minus />
        </Button>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
        >
          <Plus />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
          <Maximize /> Fit
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw /> Rotate
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={toggleFullscreen} aria-pressed={isFullscreen}>
          {isFullscreen ? <Minimize2 /> : <Maximize2 />}{' '}
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </Button>
      </div>
      <div
        className={`grid place-items-center overflow-auto rounded-md border border-line bg-surface-2 ${isFullscreen ? 'h-full' : 'h-[72vh]'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Preview of ${name}`}
          referrerPolicy="no-referrer"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            maxWidth: zoom === 1 ? '100%' : 'none',
            maxHeight: zoom === 1 ? (isFullscreen ? '90vh' : '70vh') : 'none',
          }}
          className="object-contain transition-transform"
        />
      </div>
    </div>
  );
}
