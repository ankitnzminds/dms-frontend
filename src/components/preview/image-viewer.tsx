'use client';

import { Maximize, Minus, Plus, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Image preview with zoom and rotate. */
export function ImageViewer({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  return (
    <div className="grid gap-2" data-testid="image-viewer">
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
      </div>
      <div className="grid h-[72vh] place-items-center overflow-auto rounded-md border border-line bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Preview of ${name}`}
          referrerPolicy="no-referrer"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            maxWidth: zoom === 1 ? '100%' : 'none',
            maxHeight: zoom === 1 ? '70vh' : 'none',
          }}
          className="object-contain transition-transform"
        />
      </div>
    </div>
  );
}
