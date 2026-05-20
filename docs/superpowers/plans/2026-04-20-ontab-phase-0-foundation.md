# Ontab Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ontab 브랜드·i18n·디자인 시스템·랜딩의 공통 인프라를 구축해 Phase 1(도구별 마이그레이션)을 시작할 수 있는 상태로 만든다.

**Architecture:** Next.js 16 App Router의 네이티브 `[lang]` 세그먼트 기반 i18n(Next 공식 문서 패턴), Tailwind 4 테마 토큰 확장으로 우드톤 디자인 시스템, 3축 네비 + 선반 메타포 랜딩. 신규 의존성 최소화(ko/en JSON 딕셔너리 + `@formatjs/intl-localematcher` + `negotiator`만 도입, next-intl 미사용).

**Tech Stack:** Next.js 16.2.4 + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui + lucide-react

**Scope 제외:** 기존 10개 `/tools/*` 페이지 내부는 이 Phase에서 건드리지 않는다. 그 페이지들은 `[lang]` 세그먼트 아래로 이동만 하고, 리디자인·번역은 Phase 1에서 도구별로 처리.

**Spec:** `docs/superpowers/specs/2026-04-20-ontab-redesign-design.md`

---

## 파일 구조 맵

### 생성
- `src/i18n/config.ts` — locale 상수, getDictionary
- `src/i18n/dictionaries/ko.json` — 한국어 메시지
- `src/i18n/dictionaries/en.json` — 영어 메시지
- `src/proxy.ts` — Next.js 16 proxy (locale 리다이렉트)
- `src/app/[lang]/layout.tsx` — 기존 `src/app/layout.tsx`에서 이동·확장
- `src/app/[lang]/page.tsx` — 기존 `src/app/page.tsx`에서 이동·랜딩 리디자인
- `src/app/[lang]/tools/` — 기존 `src/app/tools/*`를 전부 이 아래로 이동
- `src/components/brand/Logo.tsx` — Ontab 로고 컴포넌트
- `src/components/brand/DeskHero.tsx` — 책상 히어로 일러스트(SVG 인라인)
- `src/components/brand/ToolCard.tsx` — 선반 위 도구 카드
- `src/components/brand/ToolShelf.tsx` — 카테고리 선반 섹션
- `src/components/layout/LanguageToggle.tsx` — 한/영 전환
- `src/components/common/ResetButton.tsx` — 공통 "다시 작업하기"/"Start over"
- `public/brand/desk-hero.svg` — 책상·선반 일러스트 자산(플레이스홀더)

### 수정
- `src/app/layout.tsx` → `src/app/[lang]/layout.tsx`로 이동·i18n 적용
- `src/app/page.tsx` → `src/app/[lang]/page.tsx`로 이동·3-선반 랜딩으로 전면 교체
- `src/app/globals.css` — 우드톤 CSS 변수(tailwind theme 토큰) 확장
- `src/components/layout/Header.tsx` — 3축 네비(프레젠테이션/문서/이미지) + Logo + LanguageToggle
- `src/components/layout/Footer.tsx` — 번역 키 적용, 카피 갱신
- `src/lib/constants.ts` — `ToolInfo`에 `i18nKey` 필드 추가, 카테고리 라벨 번역키화

### 삭제
- `src/app/layout.tsx`, `src/app/page.tsx` (이동 완료 후)
- `src/app/tools/` 디렉토리 전체 (이동 완료 후)
- `src/app/gallery/` (현재 `/tools/ppt-background`로 리다이렉트만 하는 placeholder → `[lang]` 아래로 이동)

---

## Task 1: 새 브랜치 & baseline 확인

**Files:** 없음 (환경 확인)

- [ ] **Step 1: 새 브랜치 생성**

```bash
cd "C:/Users/prbl/Desktop/03_dev/demodev/tools"
git checkout -b feat/ontab-phase-0
```

- [ ] **Step 2: 현재 상태 빌드·타입체크 확인 (baseline)**

```bash
pnpm build
```

기대: 에러 없이 성공. (이후 변경 비교용 baseline)

- [ ] **Step 3: dev 서버 확인**

```bash
pnpm dev
```

기대: `http://localhost:3000` 에서 기존 DocuFlow 랜딩이 정상 표시.

`Ctrl+C`로 종료.

---

## Task 2: i18n 의존성 설치 & 설정

**Files:**
- Create: `src/i18n/config.ts`
- Create: `src/i18n/dictionaries/ko.json`
- Create: `src/i18n/dictionaries/en.json`

- [ ] **Step 1: 의존성 설치**

```bash
pnpm add @formatjs/intl-localematcher negotiator
pnpm add -D @types/negotiator
```

- [ ] **Step 2: `src/i18n/config.ts` 생성**

```typescript
import "server-only";

export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";

const dictionaries = {
  ko: () => import("./dictionaries/ko.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<typeof dictionaries.ko>>;

export const getDictionary = async (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();
```

- [ ] **Step 3: `src/i18n/dictionaries/ko.json` 생성 (초기 메시지)**

```json
{
  "brand": {
    "name": "Ontab",
    "tagline": "브라우저 탭 위, 언제든 꺼내 쓰는 문서 도구 책상"
  },
  "nav": {
    "presentation": "프레젠테이션",
    "document": "문서",
    "image": "이미지"
  },
  "landing": {
    "heroTitle": "Ontab",
    "heroSubtitle": "브라우저 탭 위, 책상 위 문구처럼 언제든 꺼내 쓰는 문서 도구 모음.",
    "heroCtaPrimary": "도구 둘러보기",
    "valueProps": {
      "private": "서버 전송 없음 — 모든 처리는 브라우저에서",
      "unlimited": "일일 제한 없음 · 무료 · 로그인 불필요",
      "fast": "즉시 실행 · 바로 다운로드"
    },
    "shelfHeading": {
      "presentation": "프레젠테이션 도구",
      "document": "문서 도구",
      "image": "이미지 도구"
    }
  },
  "common": {
    "reset": "다시 작업하기",
    "loading": "처리 중…",
    "download": "다운로드"
  },
  "footer": {
    "copyright": "© {year} Ontab. 브라우저에서 완결되는 문서 도구."
  },
  "tools": {
    "image-to-pdf": {
      "title": "이미지 → PDF",
      "description": "JPG/PNG 이미지를 하나의 PDF 파일로 변환합니다."
    },
    "pdf-to-image": {
      "title": "PDF → 이미지",
      "description": "PDF 페이지를 JPG/PNG 이미지로 추출합니다."
    },
    "pdf-merge": {
      "title": "PDF 합치기",
      "description": "여러 PDF 파일을 하나로 병합합니다."
    },
    "pdf-compress": {
      "title": "PDF 압축",
      "description": "PDF 파일 용량을 줄입니다."
    },
    "pdf-split": {
      "title": "PDF 분할",
      "description": "페이지 범위 추출 또는 전체 페이지 개별 분리."
    },
    "pdf-pages": {
      "title": "PDF 페이지 관리",
      "description": "페이지 순서 변경·회전·삭제 후 새 PDF로 저장."
    },
    "ppt-extract": {
      "title": "PPT 이미지 추출",
      "description": "PPT/PPTX에서 모든 이미지를 ZIP으로 추출."
    },
    "ppt-background": {
      "title": "PPT 배경 변경",
      "description": "PPTX 슬라이드 배경을 일괄 교체."
    },
    "image-compress": {
      "title": "이미지 압축 · 변환",
      "description": "JPG/PNG/WebP 이미지 압축 및 포맷 변환."
    },
    "image-resize": {
      "title": "이미지 크기 변경",
      "description": "픽셀·비율·프리셋으로 해상도 조정."
    }
  }
}
```

- [ ] **Step 4: `src/i18n/dictionaries/en.json` 생성 (영어 번역)**

```json
{
  "brand": {
    "name": "Ontab",
    "tagline": "Your toolbox on a browser tab, always within reach"
  },
  "nav": {
    "presentation": "Presentation",
    "document": "Document",
    "image": "Image"
  },
  "landing": {
    "heroTitle": "Ontab",
    "heroSubtitle": "The toolbox that lives in your browser tab — as handy as stationery on a desk.",
    "heroCtaPrimary": "Browse tools",
    "valueProps": {
      "private": "No uploads — everything runs in your browser",
      "unlimited": "No daily limits · Free · No sign-in",
      "fast": "Instant processing · Download right away"
    },
    "shelfHeading": {
      "presentation": "Presentation tools",
      "document": "Document tools",
      "image": "Image tools"
    }
  },
  "common": {
    "reset": "Start over",
    "loading": "Processing…",
    "download": "Download"
  },
  "footer": {
    "copyright": "© {year} Ontab. Document tools that run entirely in your browser."
  },
  "tools": {
    "image-to-pdf": {
      "title": "Image → PDF",
      "description": "Convert JPG/PNG images into a single PDF file."
    },
    "pdf-to-image": {
      "title": "PDF → Image",
      "description": "Export each PDF page as a JPG or PNG image."
    },
    "pdf-merge": {
      "title": "Merge PDFs",
      "description": "Combine multiple PDF files into one."
    },
    "pdf-compress": {
      "title": "Compress PDF",
      "description": "Reduce PDF file size in your browser."
    },
    "pdf-split": {
      "title": "Split PDF",
      "description": "Extract page ranges or split every page individually."
    },
    "pdf-pages": {
      "title": "Manage PDF pages",
      "description": "Reorder, rotate, and delete pages, then save a new PDF."
    },
    "ppt-extract": {
      "title": "Extract PPT images",
      "description": "Pull every embedded image from a PPT/PPTX into a ZIP."
    },
    "ppt-background": {
      "title": "Change PPT background",
      "description": "Replace every slide background in a PPTX at once."
    },
    "image-compress": {
      "title": "Compress & convert images",
      "description": "Compress or convert JPG/PNG/WebP images."
    },
    "image-resize": {
      "title": "Resize images",
      "description": "Adjust resolution by pixel, percent, or preset."
    }
  }
}
```

- [ ] **Step 5: 타입체크**

```bash
pnpm exec tsc --noEmit
```

기대: 에러 없음. (dictionaries는 아직 사용되지 않음.)

- [ ] **Step 6: 커밋**

```bash
git add package.json pnpm-lock.yaml src/i18n
git commit -m "feat(i18n): add ko/en dictionaries and locale config"
```

---

## Task 3: Proxy (locale 리다이렉트) 작성

**Files:**
- Create: `src/proxy.ts`

> Next.js 16은 `middleware.ts`를 `proxy.ts`로 재명명했다. 반드시 `src/proxy.ts`에 작성.

- [ ] **Step 1: `src/proxy.ts` 생성**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { locales, defaultLocale } from "@/i18n/config";

function getLocale(request: NextRequest): string {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const languages = new Negotiator({ headers }).languages();
  try {
    return match(languages, locales as unknown as string[], defaultLocale);
  } catch {
    return defaultLocale;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );
  if (pathnameHasLocale) return;

  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
```

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

기대: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/proxy.ts
git commit -m "feat(i18n): add locale-routing proxy"
```

---

## Task 4: `app/[lang]` 세그먼트로 라우트 이동

**Files:**
- Move: `src/app/layout.tsx` → `src/app/[lang]/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/[lang]/page.tsx`
- Move: `src/app/tools/*` → `src/app/[lang]/tools/*`
- Move: `src/app/gallery/*` → `src/app/[lang]/gallery/*`

- [ ] **Step 1: 디렉토리 이동 (git mv)**

```bash
cd "C:/Users/prbl/Desktop/03_dev/demodev/tools"
mkdir -p src/app/[lang]
git mv src/app/layout.tsx "src/app/[lang]/layout.tsx"
git mv src/app/page.tsx "src/app/[lang]/page.tsx"
git mv src/app/tools "src/app/[lang]/tools"
git mv src/app/gallery "src/app/[lang]/gallery"
```

(`globals.css`, `favicon.ico`는 `src/app/` 최상위에 그대로 둔다 — 이들은 세그먼트가 아니다.)

- [ ] **Step 2: `[lang]/layout.tsx`에 params prop 추가**

`src/app/[lang]/layout.tsx`의 기존 `RootLayout` 함수 시그니처를 다음과 같이 수정한다:

```tsx
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <html lang={lang} suppressHydrationWarning>
      {/* 기존 body 내용 유지 */}
    </html>
  );
}
```

> 기존 파일의 `<html lang="ko">` 하드코딩을 `lang={lang}` 으로 교체만 하면 되고, Header/Footer/ThemeProvider/Toaster 등 나머지 구조는 그대로 둔다.

- [ ] **Step 3: dev 서버로 리다이렉트 동작 확인**

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000/` 접속 → `http://localhost:3000/ko` 또는 `/en`으로 리다이렉트되는지 확인. 기존 도구 페이지들도 `/ko/tools/pdf-merge` 등으로 접근 가능해야 함.

- [ ] **Step 4: 타입체크**

```bash
pnpm exec tsc --noEmit
```

기대: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor(routing): move app routes under [lang] segment"
```

---

## Task 5: Tailwind 우드톤 테마 토큰

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 현재 `globals.css` 파일을 먼저 읽어 기존 `@theme` 또는 `:root` 변수 블록 구조 확인**

```bash
cat src/app/globals.css | head -80
```

- [ ] **Step 2: 우드톤 팔레트 CSS 변수를 `:root`에 추가**

`src/app/globals.css`의 라이트 테마(`:root`) 블록 안에 다음 변수들을 추가:

```css
--wood-50: oklch(0.97 0.012 75);    /* 아주 연한 크림 */
--wood-100: oklch(0.94 0.02 70);    /* 오프화이트 우드 */
--wood-200: oklch(0.88 0.03 65);    /* 연베이지 */
--wood-300: oklch(0.78 0.05 60);    /* 라이트 오크 */
--wood-400: oklch(0.65 0.07 55);    /* 미디엄 오크 */
--wood-500: oklch(0.52 0.08 50);    /* 월넛 */
--wood-600: oklch(0.42 0.07 45);    /* 다크 우드 */
--wood-700: oklch(0.32 0.05 40);    /* 에스프레소 */
--accent-mustard: oklch(0.72 0.13 85);
--accent-forest: oklch(0.48 0.08 155);
```

- [ ] **Step 3: 다크 테마(`.dark`) 블록에도 동일 토큰 오버라이드 추가**

```css
.dark {
  --wood-50: oklch(0.18 0.02 40);
  --wood-100: oklch(0.22 0.025 42);
  --wood-200: oklch(0.28 0.03 45);
  --wood-300: oklch(0.38 0.04 48);
  --wood-400: oklch(0.5 0.06 52);
  --wood-500: oklch(0.62 0.07 55);
  --wood-600: oklch(0.75 0.05 60);
  --wood-700: oklch(0.88 0.03 65);
  --accent-mustard: oklch(0.78 0.14 82);
  --accent-forest: oklch(0.62 0.09 155);
}
```

- [ ] **Step 4: Tailwind 4 `@theme inline` 블록에 매핑 추가**

기존 `@theme inline { ... }` 블록 끝에 다음을 추가:

```css
--color-wood-50: var(--wood-50);
--color-wood-100: var(--wood-100);
--color-wood-200: var(--wood-200);
--color-wood-300: var(--wood-300);
--color-wood-400: var(--wood-400);
--color-wood-500: var(--wood-500);
--color-wood-600: var(--wood-600);
--color-wood-700: var(--wood-700);
--color-accent-mustard: var(--accent-mustard);
--color-accent-forest: var(--accent-forest);
```

- [ ] **Step 5: dev 서버에서 시각 확인**

```bash
pnpm dev
```

DevTools → Elements → `<html>` 선택 → Computed에 `--wood-*` 변수가 보이는지 확인.

- [ ] **Step 6: 타입체크 + lint**

```bash
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 7: 커밋**

```bash
git add src/app/globals.css
git commit -m "feat(design): add wood-tone palette tokens (light/dark)"
```

---

## Task 6: Ontab 로고 컴포넌트

**Files:**
- Create: `src/components/brand/Logo.tsx`

- [ ] **Step 1: `src/components/brand/Logo.tsx` 생성**

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  locale: string;
  className?: string;
  withText?: boolean;
}

export function Logo({ locale, className, withText = true }: LogoProps) {
  return (
    <Link
      href={`/${locale}`}
      className={cn("flex items-center gap-2 font-semibold", className)}
      aria-label="Ontab"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        {/* 책상 상판 */}
        <rect x="2" y="18" width="24" height="4" rx="1" fill="var(--wood-400)" />
        {/* 책상 다리 */}
        <rect x="4" y="22" width="2" height="4" fill="var(--wood-500)" />
        <rect x="22" y="22" width="2" height="4" fill="var(--wood-500)" />
        {/* 브라우저 탭 */}
        <path
          d="M6 18 L8 10 L20 10 L22 18 Z"
          fill="var(--wood-200)"
          stroke="var(--wood-600)"
          strokeWidth="1.2"
        />
        {/* 탭 위 도구 점 */}
        <circle cx="11" cy="14" r="1.2" fill="var(--accent-mustard)" />
        <circle cx="14" cy="14" r="1.2" fill="var(--accent-forest)" />
        <circle cx="17" cy="14" r="1.2" fill="var(--wood-600)" />
      </svg>
      {withText && <span className="text-lg tracking-tight">Ontab</span>}
    </Link>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/brand/Logo.tsx
git commit -m "feat(brand): add Ontab logo component (SVG, wood palette)"
```

---

## Task 7: LanguageToggle 컴포넌트

**Files:**
- Create: `src/components/layout/LanguageToggle.tsx`

- [ ] **Step 1: `src/components/layout/LanguageToggle.tsx` 생성**

```tsx
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
```

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/layout/LanguageToggle.tsx
git commit -m "feat(i18n): add language toggle component"
```

---

## Task 8: Header를 3축 네비 + Logo + LanguageToggle로 교체

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/app/[lang]/layout.tsx` (Header에 `lang` prop 전달)

- [ ] **Step 1: `src/components/layout/Header.tsx` 전면 교체**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { LanguageToggle } from "@/components/layout/LanguageToggle";

interface HeaderProps {
  locale: string;
  labels: {
    presentation: string;
    document: string;
    image: string;
  };
}

export function Header({ locale, labels }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: `/${locale}#shelf-presentation`, label: labels.presentation },
    { href: `/${locale}#shelf-document`, label: labels.document },
    { href: `/${locale}#shelf-image`, label: labels.image },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-wood-200 bg-wood-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo locale={locale} />

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Button key={link.href} variant="ghost" size="sm" asChild>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle currentLocale={locale} />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="menu"
          >
            {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-wood-200 px-4 py-3 md:hidden">
          {navLinks.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              className="justify-start"
              asChild
              onClick={() => setMobileOpen(false)}
            >
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>
      )}
    </header>
  );
}
```

- [ ] **Step 2: `src/app/[lang]/layout.tsx`에서 dictionary 로드 & Header에 전달**

`layout.tsx`의 함수 본문 상단(await params 직후)에 추가:

```tsx
import { getDictionary, type Locale } from "@/i18n/config";

// ...
const { lang } = await params;
const dict = await getDictionary(lang as Locale);
```

그리고 기존 `<Header />` 호출을 다음으로 교체:

```tsx
<Header locale={lang} labels={dict.nav} />
```

- [ ] **Step 3: dev 서버에서 Header 시각 확인**

```bash
pnpm dev
```

`http://localhost:3000/ko` 접속 → 새 Logo, 3축 네비(프레젠테이션/문서/이미지), 한/영 토글 확인. `en` 토글 클릭 시 `http://localhost:3000/en`으로 전환 + 네비 라벨 영어 전환 확인.

- [ ] **Step 4: 타입체크 + lint**

```bash
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/layout/Header.tsx src/app/[lang]/layout.tsx
git commit -m "feat(layout): rebuild Header with 3-axis nav, Ontab logo, language toggle"
```

---

## Task 9: Footer 번역 키 적용

**Files:**
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/app/[lang]/layout.tsx` (Footer에 prop 전달)

- [ ] **Step 1: `src/components/layout/Footer.tsx` 읽고 현재 구조 확인**

```bash
cat src/components/layout/Footer.tsx
```

- [ ] **Step 2: Footer를 props 기반으로 변경**

```tsx
interface FooterProps {
  copyright: string;
}

export function Footer({ copyright }: FooterProps) {
  return (
    <footer className="border-t border-wood-200 bg-wood-50/50 py-6 text-center text-sm text-wood-600">
      <p>{copyright}</p>
    </footer>
  );
}
```

(기존 Footer에 추가 요소가 있으면 번역 키를 그대로 유지하며 마크업만 우드톤 클래스로 조정.)

- [ ] **Step 3: `[lang]/layout.tsx`에서 Footer에 copyright 전달**

```tsx
const copyright = dict.footer.copyright.replace("{year}", String(new Date().getFullYear()));
// ...
<Footer copyright={copyright} />
```

- [ ] **Step 4: dev 서버 확인 + 타입체크**

```bash
pnpm dev  # 시각 확인 후 종료
pnpm exec tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/layout/Footer.tsx src/app/[lang]/layout.tsx
git commit -m "feat(layout): translate Footer and apply wood tone"
```

---

## Task 10: `ToolInfo`에 `i18nKey` 필드 & 카테고리 레이블 번역키

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: `ToolInfo` 인터페이스에 `i18nKey` 추가 및 각 항목 채우기**

`src/lib/constants.ts`의 `ToolInfo` 인터페이스를 다음으로 교체:

```typescript
export interface ToolInfo {
  slug: string;
  title: string;          // 한국어 fallback
  description: string;    // 한국어 fallback
  i18nKey: string;        // e.g. "tools.pdf-merge" — dictionary 경로
  href: string;
  icon: LucideIcon;
  category: "pdf" | "ppt" | "image";
  seoDescription?: string;
  keywords?: string[];
  ogImage?: string;
}
```

`TOOLS` 배열의 각 항목에 `i18nKey: \`tools.\${slug}\`` 를 추가한다. 예시:

```typescript
{
  slug: "image-to-pdf",
  title: "이미지 → PDF",
  description: "JPG/PNG 이미지를 하나의 PDF 파일로 변환합니다.",
  i18nKey: "tools.image-to-pdf",
  href: "/tools/image-to-pdf",
  icon: ImageIcon,
  category: "pdf",
},
```

10개 전부 동일하게 `i18nKey: \`tools.\${slug}\`` 추가.

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

기대: `constants.ts`의 모든 항목이 `i18nKey` 누락 없이 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/constants.ts
git commit -m "feat(tools): add i18nKey to ToolInfo for dictionary lookup"
```

---

## Task 11: ToolCard 컴포넌트 (책상 위 문구 느낌)

**Files:**
- Create: `src/components/brand/ToolCard.tsx`

- [ ] **Step 1: `src/components/brand/ToolCard.tsx` 생성**

```tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  href: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  className?: string;
}

export function ToolCard({ href, title, description, Icon, className }: ToolCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border border-wood-200 bg-wood-50 p-4 shadow-sm",
        "transition-all hover:-translate-y-0.5 hover:border-wood-400 hover:shadow-md",
        "dark:bg-wood-100",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-md bg-wood-200/70 text-wood-600 transition-colors group-hover:bg-accent-mustard/30">
        <Icon className="size-5" />
      </div>
      <h3 className="font-medium text-wood-700">{title}</h3>
      <p className="text-sm text-wood-600/85 leading-snug">{description}</p>
    </Link>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/brand/ToolCard.tsx
git commit -m "feat(brand): add ToolCard with wood-tone shelf aesthetic"
```

---

## Task 12: ToolShelf 컴포넌트 (카테고리 선반)

**Files:**
- Create: `src/components/brand/ToolShelf.tsx`

- [ ] **Step 1: `src/components/brand/ToolShelf.tsx` 생성**

```tsx
import type { LucideIcon } from "lucide-react";
import { ToolCard } from "./ToolCard";

export interface ShelfItem {
  href: string;
  title: string;
  description: string;
  Icon: LucideIcon;
}

interface ToolShelfProps {
  id: string;
  heading: string;
  items: ShelfItem[];
}

export function ToolShelf({ id, heading, items }: ToolShelfProps) {
  return (
    <section id={id} className="relative">
      <h2 className="mb-4 text-xl font-semibold text-wood-700">{heading}</h2>
      {/* 선반 상판 라인 */}
      <div className="mb-6 h-1 w-full rounded-full bg-gradient-to-r from-wood-300 via-wood-400 to-wood-300" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ToolCard
            key={item.href}
            href={item.href}
            title={item.title}
            description={item.description}
            Icon={item.Icon}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/brand/ToolShelf.tsx
git commit -m "feat(brand): add ToolShelf section with shelf-rail visual"
```

---

## Task 13: DeskHero (책상 히어로 일러스트 + 카피)

**Files:**
- Create: `src/components/brand/DeskHero.tsx`

- [ ] **Step 1: `src/components/brand/DeskHero.tsx` 생성**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon } from "lucide-react";

interface DeskHeroProps {
  locale: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  valueProps: {
    private: string;
    unlimited: string;
    fast: string;
  };
}

export function DeskHero({ locale, title, subtitle, ctaLabel, valueProps }: DeskHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-wood-200 bg-gradient-to-b from-wood-50 to-wood-100 px-6 py-12 md:px-12 md:py-16">
      {/* 책상 일러스트 (인라인 SVG, 플레이스홀더) */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-70"
        viewBox="0 0 800 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* 책상 상판 */}
        <rect x="0" y="110" width="800" height="18" fill="var(--wood-400)" />
        {/* 선반 */}
        <rect x="40" y="70" width="200" height="6" fill="var(--wood-500)" />
        <rect x="560" y="70" width="200" height="6" fill="var(--wood-500)" />
        {/* 문구 아이콘 점 */}
        <circle cx="80" cy="60" r="6" fill="var(--accent-mustard)" />
        <rect x="110" y="52" width="4" height="16" fill="var(--wood-700)" />
        <rect x="140" y="48" width="14" height="22" rx="2" fill="var(--wood-300)" />
        <circle cx="600" cy="60" r="6" fill="var(--accent-forest)" />
        <rect x="630" y="50" width="18" height="20" rx="2" fill="var(--wood-300)" />
        <rect x="660" y="55" width="4" height="15" fill="var(--wood-700)" />
      </svg>

      <div className="relative z-10 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-wood-700 md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-lg text-wood-600">{subtitle}</p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm text-wood-600">
          <span className="rounded-full border border-wood-300 bg-wood-50 px-3 py-1">
            ✓ {valueProps.private}
          </span>
          <span className="rounded-full border border-wood-300 bg-wood-50 px-3 py-1">
            ✓ {valueProps.unlimited}
          </span>
          <span className="rounded-full border border-wood-300 bg-wood-50 px-3 py-1">
            ✓ {valueProps.fast}
          </span>
        </div>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href={`/${locale}#shelf-presentation`}>
              <ArrowDownIcon className="mr-2 size-4" />
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/brand/DeskHero.tsx
git commit -m "feat(brand): add DeskHero with inline desk/shelf illustration"
```

---

## Task 14: 랜딩 페이지 재작성 (Hero + 3 Shelves)

**Files:**
- Modify: `src/app/[lang]/page.tsx`

- [ ] **Step 1: `src/app/[lang]/page.tsx` 전면 교체**

```tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { TOOLS } from "@/lib/constants";
import { DeskHero } from "@/components/brand/DeskHero";
import { ToolShelf, type ShelfItem } from "@/components/brand/ToolShelf";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  const buildItems = (category: "ppt" | "pdf" | "image"): ShelfItem[] =>
    TOOLS.filter((t) => t.category === category).map((t) => {
      const translated = dict.tools[t.slug as keyof typeof dict.tools];
      return {
        href: `/${lang}${t.href}`,
        title: translated?.title ?? t.title,
        description: translated?.description ?? t.description,
        Icon: t.icon,
      };
    });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 md:py-12">
      <DeskHero
        locale={lang}
        title={dict.landing.heroTitle}
        subtitle={dict.landing.heroSubtitle}
        ctaLabel={dict.landing.heroCtaPrimary}
        valueProps={dict.landing.valueProps}
      />

      <ToolShelf
        id="shelf-presentation"
        heading={dict.landing.shelfHeading.presentation}
        items={buildItems("ppt")}
      />
      <ToolShelf
        id="shelf-document"
        heading={dict.landing.shelfHeading.document}
        items={buildItems("pdf")}
      />
      <ToolShelf
        id="shelf-image"
        heading={dict.landing.shelfHeading.image}
        items={buildItems("image")}
      />
    </div>
  );
}
```

- [ ] **Step 2: dev 서버 시각 확인**

```bash
pnpm dev
```

확인 항목:
- `http://localhost:3000/ko` — 히어로에 "Ontab" 타이틀, 책상 일러스트(SVG), 3개 선반(프레젠테이션·문서·이미지)이 각각 2/6/2 카드로 표시
- 언어 토글 `EN` 클릭 → 모든 카피 영어 전환
- 히어로 CTA "도구 둘러보기" 클릭 시 `#shelf-presentation`으로 스크롤
- 라이트/다크 모드 모두 우드톤이 깨지지 않음 (기존 `next-themes` 토글 있음)

- [ ] **Step 3: 타입체크 + lint**

```bash
pnpm exec tsc --noEmit
pnpm lint
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/[lang]/page.tsx
git commit -m "feat(landing): rebuild with DeskHero + 3-category ToolShelves"
```

---

## Task 15: 공통 ResetButton 컴포넌트

**Files:**
- Create: `src/components/common/ResetButton.tsx`

- [ ] **Step 1: `src/components/common/ResetButton.tsx` 생성**

```tsx
"use client";

import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResetButtonProps {
  label: string;
  onReset: () => void;
  className?: string;
}

export function ResetButton({ label, onReset, className }: ResetButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onReset}
      className={className}
    >
      <RotateCcwIcon className="mr-2 size-4" />
      {label}
    </Button>
  );
}
```

> 실제 배선(각 `/tools/*` done 상태에서 호출)은 Phase 1 도구별 마이그레이션에서 수행한다. 여기서는 컴포넌트만 준비.

- [ ] **Step 2: 타입체크**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/common/ResetButton.tsx
git commit -m "feat(common): add ResetButton component (wired in Phase 1)"
```

---

## Task 16: 빌드 검증 & PR 준비

**Files:** 없음

- [ ] **Step 1: Production 빌드**

```bash
pnpm build
```

기대: 에러 없이 성공. 라우트 목록에 `/[lang]`, `/[lang]/tools/*` 가 나타나야 함.

- [ ] **Step 2: dev 서버로 엔드투엔드 수동 검증**

```bash
pnpm dev
```

체크리스트:
- [ ] `/` 접속 시 Accept-Language에 따라 `/ko` 또는 `/en`으로 리다이렉트
- [ ] `/ko` 랜딩: 히어로 + 3 선반 + 한국어 카피
- [ ] `/en` 랜딩: 동일 구조 + 영어 카피
- [ ] Header 한/영 토글 정상 동작 (현재 페이지 유지하며 언어만 전환)
- [ ] 기존 10개 도구 페이지 `/ko/tools/{slug}` 와 `/en/tools/{slug}` 둘 다 접근 가능 (내용은 아직 한국어지만 404 없음)
- [ ] 다크 모드에서 우드톤이 깨지지 않음
- [ ] Header 모바일 햄버거 메뉴 정상 동작
- [ ] `pnpm lint` 경고 없음 (또는 최소)

- [ ] **Step 3: 변경 요약 커밋 (필요 시 CHANGELOG)**

특별히 남길 게 없으면 스킵.

- [ ] **Step 4: 브랜치 푸시 & PR 생성**

사용자에게 푸시·PR 생성 권한 확인 후 진행:

```bash
git push -u origin feat/ontab-phase-0
```

---

## Self-Review (작성자 체크 완료)

- **Spec coverage:**
  - §2 브랜드 → Task 6 (Logo), Task 2–3 (카피)
  - §3 디자인 시스템 → Task 5 (팔레트), Task 11–13 (책상 컴포넌트)
  - §4 랜딩/IA → Task 8 (3축 네비), Task 12–14 (선반·히어로·랜딩)
  - §5 기술 인프라 → Task 2–4 (i18n, `[lang]` 세그먼트, proxy)
  - §8 Phase 0 체크리스트 → Task 1–16 전부 매핑
  - ✅ Phase 0 범위 전체 커버. Phase 1 이후는 범위 외로 명시.
- **Placeholder 스캔:** DeskHero는 "인라인 SVG 플레이스홀더"임을 명시. "나중에"·"TBD" 없음. 모든 코드 블록은 실제 작성 가능한 상태.
- **타입 일관성:** `Locale`·`Dictionary`·`ToolInfo.i18nKey`·`ShelfItem`·`DeskHeroProps`·`HeaderProps` 전 파일에서 이름 일치 확인.

---

## 실행 옵션 선택

Plan complete and saved to `docs/superpowers/plans/2026-04-20-ontab-phase-0-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 태스크마다 새 서브에이전트 디스패치, 태스크 간 리뷰, 빠른 반복.

**2. Inline Execution** — 이 세션에서 executing-plans 스킬로 체크포인트 단위 배치 실행.

Which approach?
