"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  /** Hide the visible title but keep it for screen readers. */
  hideTitle?: boolean;
}

/** Accessible modal (focus trap, Esc to close, scroll lock) built on Radix. */
export function Modal({ open, onOpenChange, title, description, children, className, hideTitle }: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[60] animate-fade bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[61] flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-rise flex-col",
            "rounded-lg border border-line bg-surface text-ink focus:outline-none",
            className
          )}
        >
          <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", hideTitle && "sr-only")}>
            <div>
              <RadixDialog.Title className="font-display text-xl leading-tight">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
          </div>
          <RadixDialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
          >
            <X size={16} />
          </RadixDialog.Close>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Replaces window.confirm(), which blocks the page and can't be styled or tested. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, destructive, loading, onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-6">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={() => void onConfirm()} disabled={loading}>
          {loading ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
