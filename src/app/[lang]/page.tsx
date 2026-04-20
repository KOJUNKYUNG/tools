import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TOOLS } from "@/lib/constants";
import { ArrowRightIcon } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  pdf: "PDF",
  ppt: "PPT",
  image: "이미지",
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <section className="mb-16 text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
          문서 작업, 브라우저에서 바로
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          PDF 변환·병합·압축부터 PPT 배경 교체, 이미지 압축·리사이즈까지.
          <br className="hidden sm:block" />
          파일이 서버에 저장되지 않아 안전합니다.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.slug} href={tool.href} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <Badge variant="secondary">{CATEGORY_LABEL[tool.category]}</Badge>
                  </div>
                  <CardTitle className="flex items-center gap-1.5">
                    {tool.title}
                    <ArrowRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
