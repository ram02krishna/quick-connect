"use client";

import * as React from "react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Loader2, X } from "lucide-react";
import { downloadFile } from "@lib/download";

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: "IMAGE" | "VIDEO" | "PDF";
  fileName?: string;
}

export function MediaLightbox({ isOpen, onClose, mediaUrl, mediaType, fileName = "File" }: MediaLightboxProps) {
  const [frameLoading, setFrameLoading] = useState(true);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] animate-fade bg-black/90" />
        <Dialog.Content
          className="fixed inset-0 z-[71] flex flex-col focus:outline-none"
          onClick={onClose}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{fileName}</Dialog.Title>

          <div className="flex h-14 shrink-0 items-center justify-between px-4 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="truncate pr-4 text-sm font-medium">{fileName}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void downloadFile(mediaUrl, fileName)}
                aria-label="Download"
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/15"
              >
                <Download size={18} />
              </button>
              <Dialog.Close aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/15">
                <X size={20} />
              </Dialog.Close>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
            {mediaType === "IMAGE" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt={fileName} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded object-contain" />
            )}
            {mediaType === "VIDEO" && (
              <video src={mediaUrl} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded" />
            )}
            {mediaType === "PDF" && (
              <div className="relative h-full w-full max-w-5xl overflow-hidden rounded bg-white" onClick={(e) => e.stopPropagation()}>
                {frameLoading && (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                    <Loader2 className="animate-spin" size={26} />
                  </div>
                )}
                <iframe src={mediaUrl} title={fileName} onLoad={() => setFrameLoading(false)} className="h-full w-full border-0" />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
