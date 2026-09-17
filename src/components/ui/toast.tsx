"use client"

import { Toast } from "@base-ui/react/toast"
import { XIcon } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"

/** One manager for the whole app, so toasts can be raised outside React components. */
const toastManager = Toast.createToastManager()

type ToastOptions = {
  /** Reusing an id updates that toast instead of adding a second one. */
  id?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it closes by itself (0: never). Default: never with an action (closed with its button), else 8 s. */
  timeout?: number
}

function toast({ id, title, description, action, timeout }: ToastOptions): string {
  return toastManager.add({
    id,
    title,
    description,
    timeout: timeout ?? (action ? 0 : 8000),
    actionProps: action ? { children: action.label, onClick: action.onClick } : undefined,
  })
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      data-slot="toast"
      className="pointer-events-auto w-full rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg transition-all duration-200 data-ending-style:opacity-0 data-limited:hidden data-starting-style:-translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none"
    >
      <Toast.Content className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Toast.Title className="text-sm font-medium leading-snug" />
          <Toast.Description className="text-xs text-muted-foreground" />
        </div>
        <Toast.Action className={cn(buttonVariants({ variant: "outline", size: "sm" }))} />
        <Toast.Close aria-label="Fermer" className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}>
          <XIcon />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}

/** Mounted once in the root layout. Top-right: the chat panel sits bottom-right. */
function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed top-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

export { Toaster, toast, toastManager, type ToastOptions }
