"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { locales } from "@/i18n/config";

interface Props {
  currentLocale: string;
}

export function LanguageToggle({ currentLocale }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = (target: string) => {
    const segments = pathname.split("/");
    // segments: ["", "ko", "tools", ...]
    if (locales.includes(segments[1] as (typeof locales)[number])) {
      segments[1] = target;
    } else {
      segments.splice(1, 0, target);
    }
    router.push(segments.join("/") || `/${target}`);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-wood-200 p-0.5">
      {locales.map((loc) => (
        <Button
          key={loc}
          variant={loc === currentLocale ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs uppercase"
          onClick={() => switchTo(loc)}
        >
          {loc}
        </Button>
      ))}
    </div>
  );
}
