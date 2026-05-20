# Ontab Phase 0 — Design Handoff Port

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) for tracking. Always commit per Step instruction; never skip.

**Goal:** `ontab_design/` 안의 디자인 핸드오프 패키지(silver/metallic, tray+lid 메타포)를 Next.js 16 + Tailwind v4 + TypeScript 코드베이스로 포팅한다. 기존 Phase 0 Task 1~10에서 만든 i18n 인프라·라우팅·기본 컴포넌트는 유지하되, **wood-* 팔레트와 3축 앵커 네비, ToolShelf/DeskHero 같은 구 모델은 폐기**한다.

**Visual fidelity is the contract.** 디자인 JSX의 inline `style={{...}}`, 매직 넘버, className 조합, 트랜지션 값(900ms cubic-bezier 등)을 **변형 없이** 포팅한다. 내부 구조(import, state, prop type)만 React+TS+Next 컨벤션으로 정돈한다.

**Spec / Source of truth:**
- `docs/superpowers/specs/2026-04-20-ontab-redesign-design.md` (의도)
- `ontab_design/HANDOFF.md` (확정 결정)
- `ontab_design/tokens.css`, `data.jsx`, `icons.jsx`, `shell.jsx`, `screens.jsx`, `artboards.jsx` (구현 원본)

**Tech Stack:** Next.js 16.2.4 + React 19 + TypeScript 5 + Tailwind CSS 4 + `next-themes` + `lucide-react`

**Scope 제외:**
- `[lang]/tools/{slug}/` 페이지 내부 구 DocuFlow UI — 그대로 둔다 (직링크/SEO 보존). Phase 1에서 도구별로 신 디자인 적용.
- 신규 도구 추가(Phase 2)는 범위 밖.

---

## 파일 구조 맵

### 생성
- `src/fonts/PretendardVariable.woff2` (사용자가 직접 배치)
- `src/app/fonts.ts` — `next/font/local`로 Pretendard, `next/font/google`로 Space Grotesk · Inter · JetBrains Mono
- `src/components/brand/Wordmark.tsx` — 박스 아이콘 + "ONTAB" 워드마크 인라인 (디자인 Header 상단)
- `src/components/brand/Tray.tsx` — 트레이(rim + brushed floor)
- `src/components/brand/Lid.tsx` — 리드(상단 뚜껑) — shell.jsx의 Lid는 안 쓰고 screens.jsx의 PhotoLid 패턴을 사용. Lid.tsx는 PhotoLid 포팅 결과.
- `src/components/brand/PhotoLid.tsx` — 풀블리드 사진 위 글래스 오버레이 (워드마크 + 카테고리)
- `src/components/brand/GlassButton.tsx` — frosted glass 카테고리 버튼
- `src/components/brand/Nameplate.tsx` — 음각 메탈 nameplate (현재 사용 안 하지만 디자인 shell.jsx의 정의를 보존, 추후 워크스페이스에서 사용 가능)
- `src/components/brand/ValueProp.tsx` — 가치 프롭 칩
- `src/components/brand/CategoryStrip.tsx` — S2/S3 카테고리 탭 스트립
- `src/components/brand/FadeInCenter.tsx` — 페이드+스케일 마운트 래퍼
- `src/components/brand/ToolCard.tsx` — 디자인의 ToolCard 포팅 (구 ToolCard 폐기, 새로 작성)
- `src/components/brand/Bi.tsx` — 바이링구얼 텍스트 헬퍼
- `src/components/landing/Screen1Landing.tsx`
- `src/components/landing/Screen2Opened.tsx`
- `src/components/landing/Screen3Workspace.tsx`
- `src/components/landing/InteractiveLanding.tsx` — 스테이지 머신 오케스트레이터 (artboards.jsx의 InteractiveArtboard 포팅)
- `public/brand/tray-bg.png` — `ontab_design/uploads/main.png` 복사본

### 수정
- `src/app/globals.css` — wood-* 토큰 제거, silver-* + tweak 상수 + 머티리얼 클래스(rim/brushed/lid/glint/nameplate/glass-btn/toolcard/focus-ring/hr-line/ob-scroll/dark-tray-surface) 전부 이식. `.theme-dark` → `.dark` 셀렉터로 변환.
- `src/app/[lang]/layout.tsx` — 폰트 wiring (fonts.ts에서 import하여 `<html>`에 className 적용). Header/Footer props 정리. ThemeProvider는 next-themes 그대로 유지.
- `src/app/[lang]/page.tsx` — 서버 컴포넌트로 dict 로드 후 `<InteractiveLanding dict={...} locale={lang} />` 클라이언트 컴포넌트에 전달.
- `src/components/layout/Header.tsx` — 3축 앵커 네비 + 모바일 햄버거 **제거**, 디자인 shell.jsx의 Header 그대로 포팅 (Wordmark + KO/EN 세그먼티드 + 테마 토글).
- `src/components/layout/Footer.tsx` — 디자인 shell.jsx의 Footer 포팅 (copyright + "v0.1 · 오픈소스").
- `src/components/layout/LanguageToggle.tsx` — 디자인의 Header 내장 토글 디자인에 맞춰 리스타일. `router.push`로 URL 기반 locale 전환 유지.
- `src/i18n/dictionaries/ko.json`, `en.json` — 디자인 data.jsx의 DICT 카피로 갱신, `common.back/browse/drop/or/click` 추가.
- `src/lib/constants.ts` — TOOLS 항목의 `icon`을 디자인 매핑대로 lucide-react 컴포넌트로 교체, `title`/`description` 카피 디자인 기준으로 갱신, 슬러그는 기존 유지(`pdf-pages`, `ppt-extract`).

### 삭제
- `src/components/brand/Logo.tsx` (Task 6 산출물 — Wordmark로 대체)

### 참고만 (포팅 안 함)
- `ontab_design/design-canvas.jsx` — 핸드오프 미리보기 캔버스, 포트 대상 아님

---

## 시각 일치 규칙 (모든 태스크에 적용)

1. 디자인 JSX의 **모든** `style={{...}}` 블록은 그대로 옮긴다. 키 순서까지 가능하면 보존.
2. `var(--*)` CSS 변수 참조는 그대로 둔다. globals.css에 토큰이 1:1로 포팅됨.
3. Tailwind 임의값 클래스(`text-[44px]`, `tracking-[0.08em]`, `rounded-[6px]` 등) 그대로 유지. v4가 임의값 모두 지원.
4. 매직 넘버(78px 워드마크, 50px×150px nameplate, 92px 카드 높이, 620px 워크스페이스 등)는 디자인 그대로. 단, `--tweak-*` 토큰으로 이미 노출된 값은 토큰 사용.
5. 트랜지션 duration/easing(`900ms cubic-bezier(.2,.8,.2,1)` 등) 변경 금지.
6. icons.jsx의 SVG 패스를 직접 옮기지 말고 `// lucide: <name>` 주석대로 `lucide-react`에서 import. 디자인 의도와 동일.
7. `theme === "dark"` 분기 로직은 보존. dark 분기는 `useTheme()` 훅에서 받은 값으로 채움.
8. 텍스트는 디자인 카피 그대로 i18n 사전에 들어가고, 컴포넌트는 사전을 통해 렌더.

---

## Task 11: Tokens, Fonts, Material Classes

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/app/fonts.ts`
- User-placed: `src/fonts/PretendardVariable.woff2`

- [ ] **Step 1: 사용자가 폰트 파일 배치 확인**

```bash
ls -la src/fonts/PretendardVariable.woff2
```

없으면 STOP & 사용자에게 요청. 있으면 계속.

- [ ] **Step 2: `src/app/fonts.ts` 생성**

```typescript
import localFont from "next/font/local";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";

export const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
```

- [ ] **Step 3: `src/app/globals.css` 전면 개편**

이미 있는 wood-* 토큰 + accent-mustard/forest 토큰을 **삭제**한다. 기존 shadcn 토큰(`--background`, `--foreground`, `--primary`...)은 유지(다른 UI 요소가 의존). 그 후 `ontab_design/tokens.css`의 모든 내용을 다음 규칙으로 이식:

- `:root` 블록의 silver scale, accents, semantic, shadows, tweak 상수 → 기존 `:root` 안에 추가.
- `.theme-dark` 블록 → `.dark`로 셀렉터 이름만 변경 (next-themes 호환). 내부 내용 그대로.
- `.dark-tray-surface`, `.font-display`, `.font-body`, `.font-ko`, `.font-mono`, `.glint`, `.brushed`, `.rim`, `.lid`, `.ob-scroll`, `.hr-line`, `.nameplate`, `.glass-btn`, `.toolcard`, `.focus-ring` — globals.css 하단에 그대로 추가.
- `.theme-dark .X` 같은 다크 변형 셀렉터도 `.dark .X`로 변환.
- 폰트 클래스(`.font-display` 등)에서 font-family 첫 항목을 fonts.ts variable과 정합: 예) `.font-ko { font-family: var(--font-pretendard), ...기존 fallback }`, `.font-display { font-family: var(--font-space-grotesk), ... }`, `.font-body { font-family: var(--font-inter), ... }`, `.font-mono { font-family: var(--font-jetbrains-mono), ... }`.

`@theme inline` 블록에서 wood-* 매핑 제거하고 다음 추가 (Tailwind 유틸 `bg-silver-*`, `text-silver-*`, `border-accent-electric` 등 활성화):

```css
--color-silver-50: var(--silver-50);
--color-silver-100: var(--silver-100);
--color-silver-200: var(--silver-200);
--color-silver-300: var(--silver-300);
--color-silver-400: var(--silver-400);
--color-silver-500: var(--silver-500);
--color-silver-600: var(--silver-600);
--color-silver-700: var(--silver-700);
--color-silver-800: var(--silver-800);
--color-silver-900: var(--silver-900);
--color-accent-electric: var(--accent-electric);
--color-accent-electric-hi: var(--accent-electric-hi);
--color-accent-copper: var(--accent-copper);
```

- [ ] **Step 4: 검증**

```bash
pnpm exec tsc --noEmit
pnpm build
```

기대: 빌드 성공. wood-* 클래스를 참조하던 기존 Header가 깨질 수 있는데, 그건 Task 13에서 다시 작성하므로 **이 시점에서 wood-* 클래스를 silver-*로 임시 치환만 해서 빌드를 통과**시키면 된다 (Task 13에서 어차피 전면 교체됨). 만약 Header/Footer 외에 wood-* 참조가 있다면 같이 silver-*로 치환.

- [ ] **Step 5: 커밋**

```bash
git add src/app/globals.css src/app/fonts.ts src/fonts/
git commit -m "feat(design): port silver tokens + material classes + 4-font stack"
```

---

## Task 12: Constants & i18n 갱신

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/i18n/dictionaries/ko.json`
- Modify: `src/i18n/dictionaries/en.json`

- [ ] **Step 1: `src/lib/constants.ts` 갱신**

`ToolInfo` 인터페이스는 유지. TOOLS 배열의 각 항목 `icon`을 디자인의 lucide 매핑대로 교체. `title`/`description` 카피를 디자인 data.jsx에서 가져옴 (한국어 fallback). 슬러그는 기존 유지.

매핑 (디자인 slug → 기존 slug, 디자인 icon → lucide-react 이름):
- `ppt-background` → 동일, icon `Layers`
- `ppt-extract-images` → `ppt-extract`(기존 유지), icon `ImageDown`
- `pdf-merge` → 동일, icon `Files` (디자인 // lucide: files 주석 기준)
- `pdf-split` → 동일, icon `Split`
- `pdf-compress` → 동일, icon `Archive`
- `pdf-manage-pages` → `pdf-pages`(기존 유지), icon `LayoutGrid`
- `image-to-pdf` → 동일, icon `ImagePlus`
- `pdf-to-image` → 동일, icon `FileImage`
- `image-compress` → 동일, icon `Shrink`
- `image-resize` → 동일, icon `Expand`

```typescript
import {
  Layers, ImageDown, Files, Split, Archive, LayoutGrid,
  ImagePlus, FileImage, Shrink, Expand,
} from "lucide-react";

export interface ToolInfo {
  slug: string;
  title: string;
  description: string;
  i18nKey: string;
  href: string;
  icon: LucideIcon;
  category: "pdf" | "ppt" | "image";
  seoDescription?: string;
  keywords?: string[];
  ogImage?: string;
}

export const TOOLS: ToolInfo[] = [
  { slug: "ppt-background", title: "PPT 배경 바꾸기",
    description: "슬라이드 배경을 한 번에 일괄 교체합니다.",
    i18nKey: "tools.ppt-background", href: "/tools/ppt-background",
    icon: Layers, category: "ppt" },
  { slug: "ppt-extract", title: "PPT 이미지 추출",
    description: "프레젠테이션에 포함된 모든 이미지를 꺼내옵니다.",
    i18nKey: "tools.ppt-extract", href: "/tools/ppt-extract",
    icon: ImageDown, category: "ppt" },
  { slug: "pdf-merge", title: "PDF 합치기",
    description: "여러 PDF 파일을 하나로 정밀하게 병합합니다.",
    i18nKey: "tools.pdf-merge", href: "/tools/pdf-merge",
    icon: Files, category: "pdf" },
  { slug: "pdf-split", title: "PDF 나누기",
    description: "페이지 단위로 나누거나 구간별로 분리합니다.",
    i18nKey: "tools.pdf-split", href: "/tools/pdf-split",
    icon: Split, category: "pdf" },
  { slug: "pdf-compress", title: "PDF 용량 줄이기",
    description: "품질 손실 없이 파일 크기를 줄입니다.",
    i18nKey: "tools.pdf-compress", href: "/tools/pdf-compress",
    icon: Archive, category: "pdf" },
  { slug: "pdf-pages", title: "페이지 관리",
    description: "페이지 순서 변경, 회전, 삭제를 한 곳에서.",
    i18nKey: "tools.pdf-pages", href: "/tools/pdf-pages",
    icon: LayoutGrid, category: "pdf" },
  { slug: "image-to-pdf", title: "이미지 → PDF",
    description: "이미지 여러 장을 하나의 PDF로 묶습니다.",
    i18nKey: "tools.image-to-pdf", href: "/tools/image-to-pdf",
    icon: ImagePlus, category: "pdf" },
  { slug: "pdf-to-image", title: "PDF → 이미지",
    description: "PDF의 각 페이지를 고해상도 이미지로 변환합니다.",
    i18nKey: "tools.pdf-to-image", href: "/tools/pdf-to-image",
    icon: FileImage, category: "pdf" },
  { slug: "image-compress", title: "이미지 압축·변환",
    description: "여러 이미지를 한 번에 압축하고 포맷을 바꿉니다.",
    i18nKey: "tools.image-compress", href: "/tools/image-compress",
    icon: Shrink, category: "image" },
  { slug: "image-resize", title: "이미지 크기 변경",
    description: "픽셀·비율을 유지하며 일괄 리사이즈합니다.",
    i18nKey: "tools.image-resize", href: "/tools/image-resize",
    icon: Expand, category: "image" },
];
```

(`LucideIcon` 타입 import 누락 시 `import type { LucideIcon } from "lucide-react"` 추가.)

- [ ] **Step 2: `ko.json` 카피 갱신 — 디자인 data.jsx 기준**

```json
{
  "brand": {
    "name": "온탭",
    "tagline": "브라우저 탭 위, 언제든 꺼내 쓰는 문서 도구 책상"
  },
  "nav": {
    "presentation": "프레젠테이션",
    "document": "문서",
    "image": "이미지"
  },
  "landing": {
    "heroTitle": "ONTAB",
    "heroSubtitle": "브라우저 탭 위의 문서 작업실",
    "heroCtaPrimary": "공구함 열기",
    "valueProps": {
      "private": "100% 브라우저 내 처리",
      "unlimited": "무제한 · 무료",
      "fast": "업로드 없음"
    },
    "shelfHeading": {
      "presentation": "프레젠테이션 도구",
      "document": "문서 도구",
      "image": "이미지 도구"
    },
    "selectCategory": "카테고리를 선택하세요",
    "descriptor": "브라우저 탭 위에서 작동하는 문서 도구",
    "interiorHint": "공구함 · 10 tools"
  },
  "common": {
    "reset": "다시 작업하기",
    "back": "닫기",
    "loading": "처리 중…",
    "download": "다운로드",
    "browse": "파일 선택",
    "drop": "파일을 여기에 놓으세요",
    "or": "또는",
    "click": "클릭해서 찾아보기"
  },
  "footer": {
    "copyright": "© 2026 온탭 · 브라우저 안에서 동작합니다",
    "version": "v0.1",
    "license": "오픈소스"
  },
  "status": {
    "inBrowser": "브라우저 내",
    "unlimited": "무제한",
    "noUpload": "업로드 없음",
    "queued": "선택된 파일"
  },
  "tools": {
    "ppt-background": { "title": "PPT 배경 바꾸기", "description": "슬라이드 배경을 한 번에 일괄 교체합니다." },
    "ppt-extract":    { "title": "PPT 이미지 추출", "description": "프레젠테이션에 포함된 모든 이미지를 꺼내옵니다." },
    "pdf-merge":      { "title": "PDF 합치기",     "description": "여러 PDF 파일을 하나로 정밀하게 병합합니다." },
    "pdf-split":      { "title": "PDF 나누기",     "description": "페이지 단위로 나누거나 구간별로 분리합니다." },
    "pdf-compress":   { "title": "PDF 용량 줄이기", "description": "품질 손실 없이 파일 크기를 줄입니다." },
    "pdf-pages":      { "title": "페이지 관리",     "description": "페이지 순서 변경, 회전, 삭제를 한 곳에서." },
    "image-to-pdf":   { "title": "이미지 → PDF",   "description": "이미지 여러 장을 하나의 PDF로 묶습니다." },
    "pdf-to-image":   { "title": "PDF → 이미지",   "description": "PDF의 각 페이지를 고해상도 이미지로 변환합니다." },
    "image-compress": { "title": "이미지 압축·변환", "description": "여러 이미지를 한 번에 압축하고 포맷을 바꿉니다." },
    "image-resize":   { "title": "이미지 크기 변경", "description": "픽셀·비율을 유지하며 일괄 리사이즈합니다." }
  }
}
```

- [ ] **Step 3: `en.json` 동일 구조로 갱신**

```json
{
  "brand": {
    "name": "Ontab",
    "tagline": "The toolbox that lives in your browser tab"
  },
  "nav": {
    "presentation": "Presentation",
    "document": "Document",
    "image": "Image"
  },
  "landing": {
    "heroTitle": "ONTAB",
    "heroSubtitle": "The toolbox that lives in your browser tab",
    "heroCtaPrimary": "Open the toolbox",
    "valueProps": {
      "private": "100% in-browser",
      "unlimited": "Unlimited · Free",
      "fast": "No uploads, no login"
    },
    "shelfHeading": {
      "presentation": "Presentation tools",
      "document": "Document tools",
      "image": "Image tools"
    },
    "selectCategory": "Select a category",
    "descriptor": "The toolbox that lives in your browser tab",
    "interiorHint": "Toolbox · 10 tools"
  },
  "common": {
    "reset": "Reset",
    "back": "Close toolbox",
    "loading": "Processing…",
    "download": "Download",
    "browse": "Select files",
    "drop": "Drop files here",
    "or": "or",
    "click": "click to browse"
  },
  "footer": {
    "copyright": "© 2026 Ontab · runs entirely in your browser",
    "version": "v0.1",
    "license": "Open source"
  },
  "status": {
    "inBrowser": "In-browser",
    "unlimited": "Unlimited",
    "noUpload": "No upload",
    "queued": "Queued"
  },
  "tools": {
    "ppt-background": { "title": "Change PPT background", "description": "Swap the background across every slide at once." },
    "ppt-extract":    { "title": "Extract PPT images",    "description": "Pull every embedded image out of a .pptx file." },
    "pdf-merge":      { "title": "Merge PDFs",            "description": "Combine multiple PDFs into one precise document." },
    "pdf-split":      { "title": "Split PDF",             "description": "Separate pages or extract ranges." },
    "pdf-compress":   { "title": "Compress PDF",          "description": "Reduce file size with minimal quality loss." },
    "pdf-pages":      { "title": "Manage PDF pages",      "description": "Reorder, rotate, or delete pages in one place." },
    "image-to-pdf":   { "title": "Image → PDF",           "description": "Package images into a single PDF." },
    "pdf-to-image":   { "title": "PDF → Image",           "description": "Render each page as a high-res image." },
    "image-compress": { "title": "Compress & convert",    "description": "Batch-compress and convert formats." },
    "image-resize":   { "title": "Resize images",         "description": "Batch-resize while preserving ratio." }
  }
}
```

- [ ] **Step 4: 검증**

```bash
pnpm exec tsc --noEmit
pnpm build
```

기존 Footer가 `dict.footer.copyright`의 `{year}` 치환을 했었는데, 디자인 카피는 `{year}` 없음. layout.tsx에서 `replace("{year}", ...)` 호출이 남아있어도 영향 없음(빈 치환). Task 13에서 정리.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/constants.ts src/i18n/dictionaries/
git commit -m "feat(content): align tools + dictionaries to design handoff copy"
```

---

## Task 13: Shell 재작업 (Header, Footer, LanguageToggle, Wordmark)

**Files:**
- Delete: `src/components/brand/Logo.tsx`
- Create: `src/components/brand/Wordmark.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/components/layout/LanguageToggle.tsx`
- Modify: `src/app/[lang]/layout.tsx`

- [ ] **Step 1: `Logo.tsx` 삭제**

```bash
git rm src/components/brand/Logo.tsx
```

- [ ] **Step 2: `src/components/brand/Wordmark.tsx` 생성**

shell.jsx의 Header 내부 박스 아이콘 + "ONTAB" 인라인 블록을 단독 컴포넌트로 추출. 시각은 디자인 그대로.

```tsx
import Link from "next/link";

interface WordmarkProps {
  locale: string;
  className?: string;
}

export function Wordmark({ locale, className }: WordmarkProps) {
  return (
    <Link
      href={`/${locale}`}
      className={`flex items-center gap-2.5 relative ${className ?? ""}`}
      aria-label="Ontab"
    >
      <div
        className="w-6 h-6 rounded-[3px] relative"
        style={{
          background: "linear-gradient(160deg, var(--ink-strong), var(--silver-600))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(20,30,60,0.15)",
        }}
      >
        <div
          className="absolute inset-[5px] rounded-[1px] border"
          style={{ borderColor: "rgba(255,255,255,0.25)" }}
        />
      </div>
      <span
        className="font-display text-[17px] font-semibold tracking-[0.08em]"
        style={{ color: "var(--headline)" }}
      >
        ONTAB
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: `Header.tsx` 전면 교체**

shell.jsx의 Header를 그대로 포팅. 3축 앵커 네비/모바일 햄버거 전부 삭제. LanguageToggle은 디자인의 segmented pill 패턴이라 inline으로 두되, 분리된 컴포넌트로 호출 가능.

```tsx
"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { LanguageToggle } from "@/components/layout/LanguageToggle";

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <header
      className="flex items-center justify-between px-8 py-5 border-b relative"
      style={{
        borderColor: "var(--border)",
        height: "60px",
        fontWeight: 400,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "var(--bg)",
          opacity: "var(--tweak-header-bg-opacity, 1)",
          transition: "opacity 200ms ease",
        }}
      />
      <Wordmark locale={locale} />
      <div className="flex items-center gap-1 relative">
        <LanguageToggle currentLocale={locale} />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-8 h-8 flex items-center justify-center rounded-[4px] transition-colors focus-ring"
          style={{ color: "var(--ink-strong)" }}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: `LanguageToggle.tsx` 디자인 톤으로 리스타일**

기능(URL 기반 `router.push`로 locale 교체)은 유지. 비주얼은 디자인 shell.jsx의 segmented pill 그대로:

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import { locales } from "@/i18n/locales";

interface Props {
  currentLocale: string;
}

export function LanguageToggle({ currentLocale }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = (target: string) => {
    const segments = pathname.split("/");
    if (locales.includes(segments[1] as (typeof locales)[number])) {
      segments[1] = target;
    } else {
      segments.splice(1, 0, target);
    }
    router.push(segments.join("/") || `/${target}`);
  };

  return (
    <div
      className="flex items-center rounded-[4px] overflow-hidden border mr-1"
      style={{ borderColor: "var(--border)", height: 28 }}
    >
      {locales.map((lc) => (
        <button
          key={lc}
          onClick={() => switchTo(lc)}
          className="px-2.5 h-full font-display text-[10.5px] font-semibold tracking-[0.08em] uppercase transition-colors"
          style={{
            background: currentLocale === lc ? "var(--ink-strong)" : "transparent",
            color: currentLocale === lc ? "var(--bg)" : "var(--ink)",
            cursor: currentLocale === lc ? "default" : "pointer",
          }}
        >
          {lc}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `Footer.tsx` 디자인 그대로 포팅**

```tsx
interface FooterProps {
  copyright: string;
  version: string;
  license: string;
}

export function Footer({ copyright, version, license }: FooterProps) {
  return (
    <footer
      className="px-8 py-4 flex items-center justify-between border-t relative"
      style={{
        borderColor: "var(--border)",
        height: "60px",
        borderStyle: "solid",
        margin: "0px",
        padding: "16px 32px",
        fontWeight: 500,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "var(--bg)",
          opacity: "var(--tweak-footer-bg-opacity, 1)",
          transition: "opacity 200ms ease",
        }}
      />
      <div
        className="font-body text-[11px] tabular-nums tracking-wide relative"
        style={{ color: "var(--ink-soft)" }}
      >
        {copyright}
      </div>
      <div
        className="flex items-center gap-3 font-body text-[10px] tracking-[0.12em] uppercase relative"
        style={{ color: "var(--ink-soft)" }}
      >
        <span>{version}</span>
        <span style={{ color: "var(--border)" }}>·</span>
        <span>{license}</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: `[lang]/layout.tsx`에서 props 정리**

`Header`는 `locale`만 받음. `Footer`는 `copyright`/`version`/`license` 받음. dict에서 채워 전달.

```tsx
const { lang } = await params;
const dict = await getDictionary(lang as Locale);
// ...
<Header locale={lang} />
{/* body... */}
<Footer
  copyright={dict.footer.copyright}
  version={dict.footer.version}
  license={dict.footer.license}
/>
```

(year replace 로직 제거.)

또한 `<html>` 태그에 폰트 variable 클래스 적용:

```tsx
import { pretendard, spaceGrotesk, inter, jetbrainsMono } from "@/app/fonts";
// ...
<html
  lang={lang}
  suppressHydrationWarning
  className={`${pretendard.variable} ${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
>
```

- [ ] **Step 7: 검증**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

기존 lint 경고(CropSelector/InlineGallery)는 무시. 새 코드에서 발생하는 경고만 해결.

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(layout): port Header/Footer/LanguageToggle from design (silver, no anchor nav)"
```

---

## Task 14: Brand 프리미티브 (Tray, Lid/PhotoLid, GlassButton, ToolCard, FadeInCenter, CategoryStrip, Bi, ValueProp, Nameplate)

**Files:**
- Create: `src/components/brand/Tray.tsx`
- Create: `src/components/brand/PhotoLid.tsx`
- Create: `src/components/brand/GlassButton.tsx`
- Create: `src/components/brand/Nameplate.tsx`
- Create: `src/components/brand/ValueProp.tsx`
- Create: `src/components/brand/CategoryStrip.tsx`
- Create: `src/components/brand/FadeInCenter.tsx`
- Create: `src/components/brand/ToolCard.tsx`
- Create: `src/components/brand/Bi.tsx`

> 디자인 jsx의 컴포넌트를 1:1로 TSX로 옮긴다. `window.OntabData` / `window.OntabShell` 참조 모두 제대로 된 import로 치환. 상태가 있는 컴포넌트(FadeInCenter)는 파일 상단에 `"use client"`. 나머지는 가능하면 서버 호환으로 둔다.

- [ ] **Step 1: `FadeInCenter.tsx`** — screens.jsx의 FadeInCenter 그대로. `"use client"` 필요.

```tsx
"use client";
import { useEffect, useState, type ReactNode } from "react";

export function FadeInCenter({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "scale(1)" : "scale(0.96)",
        transformOrigin: "50% 50%",
        transition: "opacity 320ms ease 80ms, transform 360ms cubic-bezier(.4,0,.2,1) 80ms",
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `Tray.tsx`** — shell.jsx의 Tray 그대로 포팅.

```tsx
import type { ReactNode, CSSProperties } from "react";

interface TrayProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Tray({ children, className = "", style }: TrayProps) {
  return (
    <div className={`relative rim rounded-[22px] ${className}`} style={style}>
      <div
        className="absolute inset-[14px] brushed rounded-[12px]"
        style={{
          boxShadow:
            "inset 0 2px 6px rgba(20,30,60,0.18), inset 0 -1px 2px rgba(255,255,255,0.4)",
        }}
      />
      <div className="relative" style={{ padding: "36px 32px" }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `GlassButton.tsx`** — screens.jsx의 GlassButton 그대로. `"use client"`.

```tsx
"use client";
import type { ReactNode } from "react";

interface GlassButtonProps {
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}

export function GlassButton({ onClick, children, active = false }: GlassButtonProps) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="focus-ring rounded-[6px] font-display font-semibold glass-btn"
      style={{
        width: "100%",
        minWidth: 0,
        height: 36,
        padding: "0 16px",
        fontSize: 13,
        fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: active ? "var(--ink-strong)" : "rgba(28,36,52,0.78)",
        background: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)",
        backdropFilter: "blur(8px) saturate(1.1)",
        WebkitBackdropFilter: "blur(8px) saturate(1.1)",
        border: active ? "1px solid rgba(255,255,255,0.9)" : "1px solid rgba(255,255,255,0.45)",
        boxShadow: active
          ? "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 8px -2px rgba(20,30,60,0.18)"
          : "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(20,30,60,0.06), 0 1px 4px -1px rgba(20,30,60,0.14)",
        cursor: active ? "default" : "pointer",
        transition:
          "transform 180ms ease, background 180ms ease, box-shadow 180ms ease, color 180ms ease",
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: `Nameplate.tsx`** — shell.jsx의 Nameplate 그대로.

```tsx
"use client";
import type { ReactNode, CSSProperties } from "react";

interface NameplateProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
}

export function Nameplate({ active, onClick, children, style }: NameplateProps) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="nameplate glint focus-ring rounded-[4px] px-5 py-2.5 font-display text-[13px] font-medium tracking-[0.05em]"
      style={{
        color: "var(--ink-strong)",
        ...style,
        fontWeight: 600,
        lineHeight: "1.5",
        letterSpacing: "0.65px",
        width: "150px",
        height: "50px",
        fontSize: "12px",
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: `ValueProp.tsx`** — shell.jsx 그대로.

```tsx
import type { ComponentType } from "react";

interface ValuePropProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
}

export function ValueProp({ icon: Icon, label }: ValuePropProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-body text-[11px] tabular-nums tracking-[0.02em]"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--ink-strong)",
        opacity: 1,
        borderStyle: "solid",
        padding: "4px 5px 4px 10px",
        backgroundColor: "rgb(212, 212, 212)",
      }}
    >
      <Icon size={12} />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 6: `Bi.tsx`** — screens.jsx의 Bi 그대로.

```tsx
import type { ReactNode } from "react";

interface BiProps {
  ko: string;
  en: string;
  locale?: "ko" | "en";
  size?: "xl" | "lg" | "md" | "sm" | "xs";
  className?: string;
  align?: "left" | "center" | "right";
}

const sizes = {
  xl: "text-[44px] font-display font-semibold tracking-[0.08em] leading-[1.05]",
  lg: "text-[22px] font-display font-semibold tracking-[0.02em] leading-[1.2]",
  md: "text-[14px] font-display font-semibold tracking-[0.01em] leading-[1.25]",
  sm: "text-[12px] font-body font-medium tracking-[0.02em] leading-[1.2]",
  xs: "text-[11px] font-body font-medium tracking-[0.05em] leading-[1.2]",
} as const;

export function Bi({ ko, en, locale = "ko", size = "md", className = "", align = "center" }: BiProps) {
  const ta = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  const text = locale === "en" ? en || ko : ko;
  const fontClass = locale === "en" ? "font-display" : "font-ko";
  return (
    <div className={`${ta} ${className}`}>
      <div className={`${sizes[size]} ${fontClass}`} style={{ color: "var(--headline)" }}>
        {text}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `ToolCard.tsx`** — screens.jsx의 ToolCard 그대로. lucide 아이콘은 prop으로 받음.

```tsx
"use client";
import type { LucideIcon } from "lucide-react";

interface ToolCardProps {
  slug: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  onOpen: (slug: string) => void;
  zooming?: boolean;
}

export function ToolCard({ slug, title, description, Icon, onOpen, zooming }: ToolCardProps) {
  return (
    <button
      onClick={() => onOpen(slug)}
      className="toolcard glint focus-ring rounded-[6px] text-left flex gap-3 items-start w-full"
      style={{
        height: "var(--tweak-card-height, 96px)",
        padding: "var(--tweak-card-padding, 14px)",
        transform: zooming ? "scale(0.96)" : "scale(1)",
        opacity: zooming ? 0 : 1,
        transition:
          "transform 280ms cubic-bezier(.4,0,.2,1), opacity 240ms ease, height 200ms ease, padding 200ms ease",
        zIndex: zooming ? 5 : 1,
        alignItems: "flex-start",
      }}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-[4px] flex items-center justify-center"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--ink-strong)",
        }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5 overflow-hidden">
        <div
          className="font-display text-[13.5px] font-semibold leading-[1.25] tracking-[0.005em] font-ko truncate"
          style={{ color: "var(--headline)" }}
        >
          {title}
        </div>
        <div
          className="mt-1.5 font-body text-[11.5px] leading-[1.4] line-clamp-2"
          style={{ color: "var(--ink)" }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 8: `CategoryStrip.tsx`** — screens.jsx의 CategoryStrip 그대로. ArrowLeft는 lucide-react에서.

```tsx
"use client";
import { ArrowLeft } from "lucide-react";
import { GlassButton } from "./GlassButton";

interface CategoryStripProps {
  active: "presentation" | "document" | "image";
  labels: { presentation: string; document: string; image: string };
  backLabel: string;
  theme?: "light" | "dark";
  onSelect: (cat: "presentation" | "document" | "image") => void;
  onBack: () => void;
}

const ORDER: Array<"presentation" | "document" | "image"> = ["presentation", "document", "image"];

export function CategoryStrip({ active, labels, backLabel, theme = "light", onSelect, onBack }: CategoryStripProps) {
  const isDark = theme === "dark";
  const labelColor = isDark ? "rgba(235,240,250,0.62)" : "rgba(40,48,64,0.55)";
  const blend: "normal" | "multiply" = isDark ? "normal" : "multiply";
  return (
    <div
      className="absolute left-1/2 flex flex-col items-center gap-4"
      style={{
        top: "calc(18% + var(--tweak-categories-y, 0px))",
        transform: "translateX(-50%)",
        transition: "top 200ms ease",
      }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 font-body text-[9px] tracking-[0.32em] uppercase focus-ring rounded-[3px]"
        style={{ color: labelColor, mixBlendMode: blend, padding: 0, lineHeight: "1", height: 12 }}
      >
        <ArrowLeft size={11} />
        <span>{backLabel}</span>
      </button>
      <div className="grid grid-cols-3 gap-2.5 items-center">
        {ORDER.map((cat, i) => (
          <div
            key={cat}
            className={i === 0 ? "flex justify-end" : i === 1 ? "flex justify-center" : "flex justify-start"}
          >
            <GlassButton active={cat === active} onClick={() => onSelect(cat)}>
              {labels[cat]}
            </GlassButton>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: `PhotoLid.tsx`** — screens.jsx의 PhotoLid 그대로 (S1의 wordmark + 카테고리 오버레이).

```tsx
"use client";
import { GlassButton } from "./GlassButton";

interface PhotoLidProps {
  state: "closed" | "opening" | "open";
  locale: "ko" | "en";
  theme?: "light" | "dark";
  labels: {
    presentation: string;
    document: string;
    image: string;
    selectCategory: string;
    descriptor: string;
  };
  onOpen: (cat: "presentation" | "document" | "image") => void;
}

export function PhotoLid({ state, locale, theme = "light", labels, onOpen }: PhotoLidProps) {
  const isDark = theme === "dark";
  const labelColor = isDark ? "rgba(235,240,250,0.62)" : "rgba(40,48,64,0.55)";
  const wordmarkColor = isDark ? "rgba(245,248,255,0.94)" : "rgba(28,36,52,0.92)";
  const descriptorColor = isDark ? "rgba(220,228,240,0.72)" : "rgba(40,48,64,0.72)";
  const blend: "normal" | "multiply" = isDark ? "normal" : "multiply";
  const wordmarkShadow = isDark ? "0 1px 0 rgba(0,0,0,0.35)" : "0 1px 0 rgba(255,255,255,0.45)";
  const titleFade = state === "closed" ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ pointerEvents: state === "closed" ? "auto" : "none" }}
    >
      <div
        className="absolute left-1/2 flex flex-col items-center gap-4"
        style={{
          top: "calc(18% + var(--tweak-categories-y, 0px))",
          transform: "translateX(-50%)",
          transition: "top 200ms ease",
          pointerEvents: "auto",
        }}
      >
        <div
          className="font-body text-[9px] tracking-[0.32em] uppercase flex items-center"
          style={{ color: labelColor, mixBlendMode: blend, lineHeight: "1", height: 12 }}
        >
          {labels.selectCategory}
        </div>
        <div className="grid grid-cols-3 gap-2.5 items-center" style={{ gridAutoColumns: "1fr" }}>
          <div className="flex justify-end">
            <GlassButton onClick={() => onOpen("presentation")}>{labels.presentation}</GlassButton>
          </div>
          <div className="flex justify-center">
            <GlassButton onClick={() => onOpen("document")}>{labels.document}</GlassButton>
          </div>
          <div className="flex justify-start">
            <GlassButton onClick={() => onOpen("image")}>{labels.image}</GlassButton>
          </div>
        </div>
      </div>

      <div
        className="absolute left-1/2 flex flex-col items-center"
        style={{
          top: "50%",
          transform: `translate(-50%, calc(-50% + var(--tweak-title-y, 0px))) scale(${titleFade.scale})`,
          opacity: titleFade.opacity,
          transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 240ms ease",
        }}
      >
        <div
          style={{
            color: wordmarkColor,
            textShadow: isDark
              ? `0 calc(var(--tweak-emboss-depth, 0.5) * -1px) 0 rgba(0,0,0, calc(var(--tweak-emboss-depth, 0.5) * 0.7)), 0 calc(var(--tweak-emboss-depth, 0.5) * 1px) 0 rgba(255,255,255, calc(var(--tweak-emboss-depth, 0.5) * 0.18)), ${wordmarkShadow}`
              : `0 calc(var(--tweak-emboss-depth, 0.5) * 1px) 0 rgba(255,255,255, calc(var(--tweak-emboss-depth, 0.5) * 0.95)), 0 calc(var(--tweak-emboss-depth, 0.5) * -1px) 0 rgba(0,0,0, calc(var(--tweak-emboss-depth, 0.5) * 0.32))`,
            mixBlendMode: blend,
            lineHeight: 1,
            fontSize: 78,
            fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            textAlign: "center",
          }}
        >
          ONTAB
        </div>
        <div
          className="mt-3 font-body"
          style={{
            color: descriptorColor,
            mixBlendMode: blend,
            fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
            fontSize: 13,
            letterSpacing: "0.01em",
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {labels.descriptor}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: 검증 + 커밋**

```bash
pnpm exec tsc --noEmit
pnpm build
git add src/components/brand/
git commit -m "feat(brand): port tray/lid/glass/card primitives from design"
```

---

## Task 15: Screens + Orchestrator + 랜딩 페이지 교체

**Files:**
- Create: `public/brand/tray-bg.png` (복사)
- Create: `src/components/landing/Screen1Landing.tsx`
- Create: `src/components/landing/Screen2Opened.tsx`
- Create: `src/components/landing/Screen3Workspace.tsx`
- Create: `src/components/landing/InteractiveLanding.tsx`
- Modify: `src/app/[lang]/page.tsx`

- [ ] **Step 1: 트레이 사진 자산 배치**

```bash
mkdir -p public/brand
cp ontab_design/uploads/main.png public/brand/tray-bg.png
git add public/brand/tray-bg.png
```

- [ ] **Step 2: `Screen1Landing.tsx` — screens.jsx의 Screen1Landing 포팅**

요점:
- `assets/tray-bg.png` 경로를 `/brand/tray-bg.png`로 교체
- `theme` prop은 useTheme()에서 받지 말고 InteractiveLanding이 prop으로 전달 (서버 분기 단순화)
- DICT 참조는 prop으로 분리해 받기
- 디자인 inline style 전부 그대로

상세 코드는 screens.jsx의 Screen1Landing을 그대로 옮기되 `window.OntabData.DICT` → prop, `assets/tray-bg.png` → `/brand/tray-bg.png`, `<Header />`/`<Footer />`는 새 layout이 이미 감싸므로 이 컴포넌트에서는 **렌더하지 않는다** (랜딩 본문만 그림). InteractiveLanding 컴포넌트가 children으로 들어가는 위치는 `[lang]/page.tsx` 내부, `layout.tsx` 안의 Header/Footer 사이.

`Header`/`Footer`를 Screen1/2/3 안에서 또 렌더하지 않도록 주의. 디자인 jsx는 standalone artboard였기 때문에 각 스크린이 Header/Footer를 자체 렌더했지만, **포팅 시에는 layout.tsx에 위임**한다 (DRY).

- [ ] **Step 3: `Screen2Opened.tsx`** — screens.jsx의 Screen2Opened 포팅. 동일 원칙.

- [ ] **Step 4: `Screen3Workspace.tsx`** — screens.jsx의 Screen3Workspace 포팅. 동일 원칙. 워크스페이스 width는 디자인 그대로 620px (`var(--tweak-workspace-width)`).

- [ ] **Step 5: `InteractiveLanding.tsx`** — artboards.jsx의 InteractiveArtboard 포팅. 스테이지 머신 그대로. 단:
- `theme` 고정 prop 대신 `useTheme()` 사용 (next-themes)
- `locale`은 prop으로 받음 (URL `[lang]` 기준)
- `onLocaleChange`는 호출하지 않음 (LanguageToggle이 URL 라우팅으로 처리)

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Screen1Landing } from "./Screen1Landing";
import { Screen2Opened } from "./Screen2Opened";
import { Screen3Workspace } from "./Screen3Workspace";
import type { Dictionary } from "@/i18n/config";
import { TOOLS } from "@/lib/constants";

type Category = "presentation" | "document" | "image";
type Stage = "closed" | "opened" | "workspace";

interface InteractiveLandingProps {
  locale: "ko" | "en";
  dict: Dictionary;
}

export function InteractiveLanding({ locale, dict }: InteractiveLandingProps) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const [stage, setStage] = useState<Stage>("closed");
  const [lidState, setLidState] = useState<"closed" | "opening" | "open">("closed");
  const [activeCategory, setActiveCategory] = useState<Category>("document");
  const [tool, setTool] = useState<(typeof TOOLS)[number] | null>(null);
  const [zoomingToolSlug, setZoomingSlug] = useState<string | null>(null);
  const [wsZoom, setWsZoom] = useState<"entering" | "expanded">("entering");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const wait = (ms: number) => new Promise<void>((r) => timers.current.push(setTimeout(r, ms)));

  async function handleOpen(category: Category) {
    setActiveCategory(category);
    setLidState("opening");
    await wait(280);
    setStage("opened");
    setLidState("open");
  }

  function handleCategoryChange(cat: Category) {
    setActiveCategory(cat);
  }

  async function handleClose() {
    setStage("closed");
    setLidState("opening");
    await wait(40);
    setLidState("closed");
  }

  async function handleToolOpen(slug: string) {
    const found = TOOLS.find((t) => t.slug === slug) ?? null;
    setTool(found);
    setZoomingSlug(slug);
    await wait(280);
    setStage("workspace");
    setWsZoom("expanded");
    setZoomingSlug(null);
  }

  async function handleWorkspaceClose() {
    setStage("opened");
  }

  if (stage === "workspace" && tool) {
    return (
      <Screen3Workspace
        locale={locale}
        theme={theme}
        dict={dict}
        tool={tool}
        zoomState={wsZoom}
        onClose={handleWorkspaceClose}
        onCategoryChange={(cat) => {
          setActiveCategory(cat);
          setStage("opened");
        }}
      />
    );
  }

  if (stage === "opened") {
    return (
      <Screen2Opened
        locale={locale}
        theme={theme}
        dict={dict}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        onClose={handleClose}
        onToolOpen={handleToolOpen}
        zoomingToolSlug={zoomingToolSlug}
      />
    );
  }

  return (
    <Screen1Landing
      locale={locale}
      theme={theme}
      dict={dict}
      lidState={lidState}
      onOpen={handleOpen}
    />
  );
}
```

- [ ] **Step 6: `[lang]/page.tsx` 교체**

```tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { InteractiveLanding } from "@/components/landing/InteractiveLanding";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return <InteractiveLanding locale={lang as "ko" | "en"} dict={dict} />;
}
```

> InteractiveLanding은 자체적으로 풀스크린 sticky 영역을 차지하므로, layout.tsx의 main 컨테이너가 height/overflow를 적절히 잡아줘야 한다. 디자인 jsx의 `<div className="flex flex-col h-full">`는 viewport 높이를 채우는 의도라, page 컨테이너에 `min-h-screen flex flex-col`을 줘서 Screen이 main의 flex-1을 채우게 한다. 만약 layout이 이미 그렇게 되어있지 않다면 layout.tsx 본문도 조정.

- [ ] **Step 7: 시각 검증 (dev 서버 띄우지 말고 빌드만)**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(landing): port 3-stage interactive landing from design"
```

---

## Task 16: 최종 검증 + PR 준비

**Files:** 없음 (검증·문서화만)

- [ ] **Step 1: 풀빌드**

```bash
pnpm build
```

라우트 목록에 `/[lang]`, `/[lang]/tools/{slug}` 모두 보여야 한다.

- [ ] **Step 2: dev 서버 수동 체크리스트 (사용자가 직접)**

```bash
pnpm dev
```

체크리스트:
- [ ] `/` 접속 → `/ko` 또는 `/en`으로 리다이렉트
- [ ] `/ko` 랜딩에 트레이 사진 풀블리드 배경 + 워드마크 + 카테고리 GlassButton 3개
- [ ] 카테고리 클릭 → 리드 페이드아웃, 도구 그리드 페이드인 (S1→S2 전환)
- [ ] 카테고리 간 전환 시 카드 그리드만 교체, 카테고리는 같은 자리
- [ ] 도구 카드 클릭 → 카드 축소 페이드, 워크스페이스 카드 페이드인 (S2→S3)
- [ ] 워크스페이스에서 카테고리 다시 클릭 → S2로 복귀
- [ ] 다크 모드 토글 → 사진 dim + `dark-tray-surface` 텍스처 합성
- [ ] KO/EN 토글 → URL 교체, 모든 카피 즉시 영어 전환
- [ ] 기존 `/ko/tools/pdf-merge` 등 직링크 → 구 UI로 정상 표시 (404 없음)
- [ ] Footer에 "v0.1 · 오픈소스" 표시
- [ ] Pretendard 폰트가 한국어 영역에 적용된 음각(emboss) 효과 정상 표시

문제 발견 시 해당 컴포넌트로 돌아가 시각 수정 PR 추가.

- [ ] **Step 3: lint 한 번**

```bash
pnpm lint
```

기존 경고(CropSelector/InlineGallery) 무시. 신규 코드의 새 경고가 있으면 정리.

- [ ] **Step 4: 변경 통계**

```bash
git log --oneline master..HEAD
git diff --stat master..HEAD
```

PR 본문 초안에 사용.

- [ ] **Step 5: 사용자 승인 후 브랜치 푸시 & PR**

(직접 사용자에게 확인받고 진행)

```bash
git push -u origin feat/ontab-phase-0
gh pr create --title "Ontab Phase 0 — i18n infra + design handoff port" --body "$(cat <<'EOF'
## Summary
- i18n infrastructure (ko/en dictionaries, proxy, [lang] segment)
- Silver/metallic design system from Claude Design handoff
- 3-stage interactive landing (closed → opened → workspace)
- All 10 existing tool routes preserved at /[lang]/tools/{slug}

## Test plan
- [ ] / redirects to /ko or /en based on Accept-Language
- [ ] Landing renders tray photo, ONTAB wordmark, category glass buttons
- [ ] Category click triggers lid lift animation and grid fade-in
- [ ] Tool card click triggers zoom-out and workspace fade-in
- [ ] Dark mode swaps to brushed-titanium surface texture
- [ ] KO/EN toggle swaps locale via URL routing
- [ ] All /tools/{slug} routes still accessible (old UI, redesigned in Phase 1)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Visual fidelity:** 디자인 JSX의 inline style/매직 넘버/className 전부 verbatim 포팅. icons.jsx 의도 + lucide-react 매핑으로 시각 동일.
- **Spec coverage:**
  - HANDOFF §디자인 결정 → Task 11(팔레트·폰트), Task 13(네비 단순화), Task 14·15(트레이·리드·2-col 그리드)
  - HANDOFF §잠긴 레이아웃 상수 → Task 11에 `--tweak-*` 전부 :root로 이식
  - HANDOFF §i18n → Task 12에서 KO/EN 사전 갱신
  - HANDOFF §애니메이션 → Task 14·15에서 transition 값 그대로 유지
  - HANDOFF §포트 노트 → 모든 잘못된 inline 패턴(window.X) 정규 import로 변환
- **Phase 1 호환:** `/tools/{slug}` 라우트 보존. 구 ToolInfo 호환(`icon` 필드는 그대로 LucideIcon 타입).
- **Risks:**
  - `theme === "dark"` 분기를 SSR/CSR mismatch 없이 useTheme()으로 받으려면 `mounted` 가드가 필요할 수 있음. InteractiveLanding이 client component라 첫 페인트에서 light로 시작 후 다크 토글이 적용될 가능성. 필요 시 `useEffect`로 `mounted` 가드 + `suppressHydrationWarning` (layout에 이미 있음) 조합 사용.
  - Pretendard 폰트 가중치 범위(`45 920`)는 PretendardVariable.woff2 사양 기준. 다른 단일-가중치 파일이면 weight 조정 필요.
  - `theme-dark` → `dark` 셀렉터 변환 시 디자인이 `:not(.dark)` 같은 음수 셀렉터를 쓰지 않는지 확인.
