import { FileTextIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <FileTextIcon className="size-4" />
          <span>DocuFlow</span>
        </div>
        <p>&copy; {new Date().getFullYear()} DocuFlow. All rights reserved.</p>
      </div>
    </footer>
  );
}
