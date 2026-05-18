# Ontab Phase 1 — `ppt-background` 마이그레이션 설계

- **Date:** 2026-05-14
- **Branch:** `feat/ontab-phase-1-ppt-background`
- **Scope:** Phase 1 첫 도구. silver 디자인 시스템 적용 + 영문 i18n + IMPROVEMENTS 항목 흡수 + Screen3Workspace 인라인 마운트.
- **References:** `CONTEXT.md`, `docs/design.md`, `docs/PRD_Z.md` §8.1, `docs/IMPROVEMENTS.md`, `docs/adr/0001`, `docs/adr/0002`, 메모리 `ontab_phase_progress`·`ontab_conventions`·`ontab_brand`·`ontab_tools_extensibility`.

---

## 1. Goals

1. `/{locale}/tools/ppt-background` (chrome 라우트) 본문을 silver 디자인 시스템으로 재작성.
2. 같은 본문 컴포넌트를 `Screen3Workspace`에 인라인 마운트하여 landing-inline 실행 모델 충족 (Phase 0 브릿지 Link → 인라인 호출 교체).
3. IMPROVEMENTS 흡수:
   - "PPT 파일" 카피 → "PPTX 파일" 정리 (.ppt 안내 문구 유지).
   - "슬라이드 지정 적용" 모드 추가.
4. 영문 i18n 완비 (현재 한국어 하드코딩 제거).
5. 향후 도구에서 재사용할 공통 컴포넌트 신설: `PageRangeSelector`, `ProcessingStatus.onReset`. **본 PR에서는 ppt-background에만 적용**, 다른 도구는 각자 Phase 1 PR에서 점진 흡수.

## 2. Non-goals (별도 PR/세션)

- `.ppt` 파일 직접 처리 또는 자동 변환 (.ppt → .pptx).
- `accent-electric` 톤 변경 (ADR-0001 개정 사안).
- 다른 도구들에 `PageRangeSelector` / `onReset` 적용.
- 갤러리 검색 UI (Supabase 단계로 연기, `tags` 필드만 도입).
- 갤러리 사용자 업로드/큐레이션.
- `FILE_SIZE_LIMIT` 조정.
- `landing.interiorHint`의 "10 tools" 하드코딩 정리 (별개 위반, 별도 PR).
- 워크스페이스 폭 외 다른 `--tweak-*` 변경.

## 3. Architecture

### 3.1 컴포넌트 트리

```
src/components/tools/ppt-background/
├── PptBackgroundTool.tsx        # 본문 진입점. 상태 호스트. 빈 상태 ↔ 2단 작업면 ↔ .ppt 상태 전이.
├── SlideThumbStrip.tsx          # 현재 슬라이드 배경 썸네일 그리드.
│                                 # "지정" 모드 시 클릭 토글 + 선택 표시.
├── BackgroundPicker.tsx         # 새 배경 선택 (미리보기 + 직접 업로드 + InlineGallery embed).
├── ModeSelector.tsx             # 3-모드 세그먼트 (전체 / 마스터 / 지정).
└── PptConversionGuide.tsx       # .ppt 안내 박스 (silver tone).
```

신설 공통:

```
src/components/common/
└── PageRangeSelector.tsx        # 텍스트 입력 + 전체선택/해제 버튼 + children slot.
src/lib/common/
└── pageRange.ts                 # parseRange / serializeRange + 유닛 테스트.
```

수정 기존:

- `src/components/ppt/InlineGallery.tsx` — silver 리스킨, 카테고리 4종.
- `src/lib/gallery/types.ts` — 카테고리 union 좁힘, `tags?: string[]`.
- `src/lib/gallery/mockData.ts` — 4 카테고리 × 5~6장 재구성.
- `src/lib/ppt/changeBackground.ts` — `BgMode`에 `"specific-slides"` 추가, `targetSlides?` 파라미터.
- `src/components/common/ProcessingStatus.tsx` — `onReset?` prop, done 상태에서 "다시 작업하기" 버튼 노출.
- `src/components/landing/Screen3Workspace.tsx` — `slug === "ppt-background"` 분기, 인라인 컴포넌트 마운트.
- `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx` — 본문 전면 교체, `<PptBackgroundTool/>` 마운트.
- `src/app/globals.css` — `--tweak-workspace-width` 상향.
- `src/i18n/dictionaries/{ko,en}.json` — `tools.ppt-background.page.*` 신규 키, `tools.ppt-background.description` 정리.

### 3.2 라우트 구조

변경 없음. (chrome) 그룹 보존. ADR-0002 contract 유지.

- `/{locale}/tools/ppt-background` — silver surface 위 카드 형태 본문. 트레이 배경 없음 (chrome 그룹의 의도).
- `Screen3Workspace`에서 같은 컴포넌트가 트레이 배경 위에 마운트.

### 3.3 상태 흐름 (`PptBackgroundTool`)

```
pptxFile: File | null
isPpt: boolean             # 파일 확장자가 .ppt
showConversionGuide: bool  # .ppt 검출 시 true. pptxFile에는 들어가지 않음.
currentBgs: SlideBackground[]
bgObjectUrls: Map<number, string>
bgLoading: boolean

bgFile: File | null
galleryImage: GalleryImage | null
bgPreviewUrl: string | null

mode: "all-slides" | "master" | "specific-slides"
selectedSlides: Set<number>  # 1-based, mode === "specific-slides"일 때만 의미

# useToolProcessor → changeBackground({ pptxFile, bgImage, mode, targetSlides })
status, progress, errorMessage, run, retry, download
```

전이:
- 파일 분기: `.ppt` 검출 시 → `showConversionGuide = true`, `pptxFile`은 비움. 빈 상태 레이아웃 유지 + dropzone 그대로 + 가이드 펼침.
- `pptxFile` 진입 → 자동으로 `extractCurrentBackgrounds` 호출 → `currentBgs` 채움.
- `mode === "specific-slides"`로 전환 시 `selectedSlides` 기본 비어 있음. 텍스트 입력과 그리드 양방향 동기.
- 완료(`status === "done"`) + `onReset` 클릭 → 모든 state 초기화 (object URL revoke 포함) → 빈 상태로 복귀.

### 3.4 양방향 동기 — 텍스트 입력 ↔ 썸네일 그리드

`PageRangeSelector`가 호스트:
- 내부 state: `text` (입력 raw), `composing` (사용자 입력 중 플래그).
- 사용자 입력 → 300ms debounce 후 `parseRange(text, totalPages)` → `onChange(set)`.
- 외부 `selected` 변경 (그리드 클릭으로 발생) + `!composing` → `serializeRange(selected) → text` 동기.
- composing 동안 외부 변경은 보류.

`parseRange` 규칙:
- 토큰 분리: `/[,\n]/`로 split, trim.
- 각 토큰: `^\d+$` 또는 `^\d+-\d+$`. 그 외는 silently drop (dev에서 console.warn).
- 범위 역전(`5-3`) → `[3, 5]`로 정규화.
- 1 미만이나 `totalPages` 초과는 클램프.
- 빈 문자열 → 빈 Set.

`serializeRange` 규칙:
- 오름차순 정렬, 연속 구간을 `a-b`로 압축, 그 외는 `a`.
- 빈 Set → 빈 문자열.

## 4. 데이터·타입

### 4.1 `BgMode` 확장

```ts
export type BgMode = "all-slides" | "master" | "specific-slides";

interface ChangeBackgroundArgs {
  pptxFile: File;
  bgImage: File;
  mode: BgMode;
  targetSlides?: number[];  // 1-based, required when mode === "specific-slides"
  onProgress?: (n: number) => void;
}
```

분기:
- `all-slides`, `master`: 기존 로직 그대로.
- `specific-slides`: `all-slides`의 슬라이드 인덱스 화이트리스트 변종. `targetSlides`에 포함된 슬라이드 XML만 `<p:bg>` 교체 + `_rels` 업데이트. 미포함 슬라이드는 byte-identical 유지.
- guard: `mode === "specific-slides" && (!targetSlides || targetSlides.length === 0)` → throw. UI에서 사전에 disable.

### 4.2 갤러리 데이터

```ts
export type GalleryCategory = "gradient" | "nature" | "texture" | "pattern";

export interface GalleryImage {
  id: string;
  category: GalleryCategory;
  title: string;            // mock 단계: i18n 안 함. Supabase 단계에서 재검토.
  url: string;
  thumbnailUrl: string;
  tags?: string[];          // future search. 본 PR UI에 노출 안 함.
}
```

`mockData.ts`: 4 카테고리 × 5~6장, 총 20~24장. 각 이미지에 `tags` 2~4개.
- `nature`/`texture`/`pattern`: picsum 시드 큐레이션.
- `gradient`: picsum이 사진만 제공하므로 SVG data URL 합성 또는 unsplash 시드 검색. **구현 단계 결정.**

## 5. 표면 (silver 톤 매핑)

원칙: `docs/design.md` §2~3 준수. raw `--silver-*` 대신 semantic alias 우선. **새 토큰·새 머티리얼 클래스 도입 없음.**

### 5.1 도구 본문 컨테이너

Screen3 카드 패턴 verbatim 재사용:
- `rounded-[14px] border`, border `var(--border)`.
- `background: color-mix(in oklch, var(--surface) 92%, transparent)`.
- `backdropFilter: blur(10px) saturate(1.1)`.
- 그림자: `0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)`.

좌·우 panel 사이: 1px 세로 hairline (`background: var(--hairline)`). panel padding `px-6 py-5`.

### 5.2 Dropzone (빈 상태 중앙 + 업로드 후 좌상 mini)

`rounded-[8px] border-2 border-dashed`, border `var(--hairline)`, bg `var(--surface-2)`, hover border `var(--accent-electric)`. 아이콘 박스(`UploadCloud`)는 `var(--surface)` + `var(--border)` + `var(--ink-strong)`. (Screen3의 진입 dropzone 패턴 재사용.)

### 5.3 ModeSelector (3분할 세그먼트)

- 비활성: `var(--surface-2)` 배경 + `var(--ink-soft)` 텍스트.
- 활성: `var(--surface)` 배경 + `var(--ink-strong)` 텍스트 + 하단 2px `var(--accent-electric)` underline.
- `master` 활성 시 아래 작은 안내문(기존 카피 silver 톤).

### 5.4 SlideThumbStrip

카드: `rounded-[6px] border` (`var(--border)`), 16:9 이미지 또는 placeholder (`var(--surface-2)` + `var(--ink-soft)` "배경 없음").
캡션: 슬라이드 이름 + 소스(슬라이드/레이아웃/마스터), `var(--ink)` 작은 텍스트.

모드별 상호작용:
- **`specific-slides` + 선택**: 카드 outline `2px solid var(--accent-electric)`, 우상단 체크 배지(`var(--accent-electric)` 원 + 흰 ✓), cursor pointer.
- **`specific-slides` + 미선택**: 기본 카드, hover border `var(--accent-electric)`, cursor pointer.
- **그 외 모드**: cursor default, hover 효과 없음.

자동 줄바꿈 그리드. panel 내부 `max-height` + `overflow-y: auto`. **본문 전체 스크롤 없음.**

### 5.5 BackgroundPicker

선택된 배경 미리보기 카드 (우상): `rounded-[8px] border` + `var(--border)`. 상단 라벨 바 `var(--surface-2)` + "미리보기" 텍스트. 아래 16:9 이미지 `object-contain`. 미선택 시 placeholder.

직접 업로드 dropzone (선택된 배경 없을 때만 노출, 컴팩트).

InlineGallery (접이식, silver 리스킨). 선택된 배경이 있을 때 `forceCollapsed`.

### 5.6 InlineGallery 리스킨

- 카테고리 strip: `--surface-2` 칩, 활성 시 `--surface` + `--ink-strong` + 하단 underline (ModeSelector와 동일 패턴).
- 카테고리: `all` / `gradient` / `nature` / `texture` / `pattern` (5개 칩, `all`이 기본).
- 그리드: 3컬럼, 좁아지면 2컬럼. 16:9 카드.
- 선택된 카드: `2px solid var(--accent-electric)` outline + 우상단 체크 배지 (SlideThumbStrip과 동일 패턴, 일관성).
- 최근 사용 row: 카테고리 strip 위에 작은 가로 row, 라벨 dict.
- panel 내부 `max-height` + `overflow-y: auto`.
- 머티리얼 클래스 `toolcard` 적용 여부: **시각 검증 후 결정.** 과하면 단순 `rounded border` fallback.

### 5.7 PptConversionGuide (.ppt 안내, silver tone)

amber 톤 완전 제거. 차분한 status 톤:
- 컨테이너: `rounded-[12px] border`, bg `var(--surface)`, border `var(--border)`.
- 좌측 2px copper rail: `box-shadow: inset 2px 0 0 var(--accent-copper)` 또는 `border-left: 2px solid var(--accent-copper)`.
- 헤더: `Info` 아이콘 + "이 파일은 .pptx로 변환이 필요합니다" + 펼침/접힘 chevron (기본 펼침).
- 3가지 방법 카드 내부: `rounded-[8px] border` + `var(--surface-2)`. 외부 링크는 `var(--accent-electric)` underline.

### 5.8 ProcessingStatus (우하)

표면만 silver. progress bar: `var(--surface-2)` 트랙 + `var(--accent-electric)` fill.
done 상태: 다운로드 버튼 (`var(--accent-electric)` + `glint` 머티리얼 클래스) + "다시 작업하기" 보조 버튼 (`var(--surface-2)` + `var(--ink-strong)` + `var(--border)`).

## 6. 레이아웃

### 6.1 빈 상태 (PPTX 미업로드)

```
─────────────── 본문 카드 (워크스페이스 폭 전체) ───────────────
  Header strip (도구 아이콘 + title + description)

         ┌────────────────────────────────────┐
         │  중앙 PPTX dropzone (크게)          │
         └────────────────────────────────────┘

  [.ppt 업로드 시] 아래에 PptConversionGuide 펼침
─────────────────────────────────────────────────────────────
```

`.ppt` 업로드 시: dropzone은 그대로 유지(작아지지 않음, 위치 변하지 않음). 그 위에 작은 inline 알림("이 파일(.ppt)은 변환이 필요합니다. 아래 안내를 따라 .pptx로 변환 후 다시 업로드하세요."), 그 아래에 PptConversionGuide. 사용자가 변환한 .pptx를 같은 dropzone에 그대로 끌어놓으면 정상 흐름으로 진입.

### 6.2 2단 작업면 (PPTX 업로드 후)

```
─────────────── 본문 카드 (워크스페이스 폭 전체) ───────────────
  Header strip

  ┌─── LEFT panel ──────────┬─── RIGHT panel ──────────────┐
  │ ▸ 좌상: 파일 상태        │ ▸ 우상: 배경 고르기           │
  │   - 파일명 / 크기         │   - 선택된 배경 미리보기      │
  │   - 슬라이드 수           │   - 직접 업로드 (컴팩트)      │
  │   - "다른 파일 선택"       │   - InlineGallery             │
  │                          │     (panel 내부 스크롤)       │
  │ ▸ 좌하: 적용 범위        │                              │
  │   - ModeSelector         │ ▸ 우하: 실행                 │
  │     [전체][마스터][지정]   │   - idle: [적용] (배경 미선택 │
  │   - "지정" 시 그리드 헤더  │           시 disabled)        │
  │     · 텍스트 입력          │   - run: ProcessingStatus    │
  │     · [전체 선택][해제]    │   - done: [다운로드][다시 작업]│
  │   - SlideThumbStrip       │   - error: 메시지 + 재시도    │
  │     (panel 내부 스크롤)    │                              │
  └──────────────────────────┴──────────────────────────────┘
─────────────────────────────────────────────────────────────
```

본문 전체 스크롤 없음. panel 내부 스크롤만 (썸네일 그리드, 갤러리).

### 6.3 워크스페이스 폭

현재 `--tweak-workspace-width: 620px` → 상향. 정확 px 값은 1280×800 viewport에서 다음 조건을 모두 만족하는 최대치를 시각 검증으로 확정:
- 본문 카드가 viewport 좌우에 트레이 배경이 살아남는 여백 확보 (Screen3에서).
- 2단 작업면이 한 화면 fit (Header/Footer 제외 본문 영역 안에 들어옴).
- 도구 본문 폭 = 워크스페이스 폭 (분리 없음, 다른 도구도 같은 폭 공유).

예상 범위 960~1040px.

## 7. i18n

### 7.1 신규 키 (`tools.ppt-background.page.*`)

```
header.title           "PPTX 배경 일괄 변경" / "Replace PPTX backgrounds"
header.description     "PPTX 슬라이드의 배경 이미지를 한 번에 교체합니다." / "Swap the background across every slide of a .pptx file at once."

upload.dropzone.label  "PPTX 파일을 드래그하거나 클릭하여 업로드" / "Drop a PPTX file here, or click to browse"
upload.dropzone.hint   ".pptx 형식을 지원합니다" / "Supports .pptx files"
upload.pptDetected     "이 파일(.ppt)은 변환이 필요합니다. 아래 안내를 따라 .pptx로 변환 후 다시 업로드하세요." / "This .ppt file needs to be converted. Follow one of the methods below to save it as .pptx, then upload again."

conversion.heading     "이 파일은 .pptx로 변환이 필요합니다" / "This file needs to be converted to .pptx"
conversion.method.1.title  "Microsoft PowerPoint" / "Microsoft PowerPoint"
conversion.method.1.steps  (배열, 기존 카피 silver 톤 유지)
conversion.method.2.title  "Google 슬라이드 (무료, 설치 불필요)" / "Google Slides (free, no install)"
conversion.method.2.steps  (배열)
conversion.method.2.linkLabel  "slides.google.com"
conversion.method.3.title  "LibreOffice Impress (무료 설치형)" / "LibreOffice Impress (free desktop)"
conversion.method.3.steps  (배열)
conversion.method.3.linkLabel  "LibreOffice"
conversion.note        "이미지 추출 기능은 .ppt 파일도 지원합니다." / "Image extraction does work with .ppt files."

fileStatus.slideCount   "{n}개 슬라이드" / "{n} slides"
fileStatus.changeFile   "다른 파일 선택" / "Choose another file"
fileStatus.analyzing    "슬라이드 배경을 분석하는 중…" / "Analyzing slide backgrounds…"

mode.label              "적용 범위" / "Apply to"
mode.option.all         "전체" / "All slides"
mode.option.master      "마스터" / "Master"
mode.option.specific    "지정" / "Specific"
mode.master.note        "개별 슬라이드에 자체 배경이 설정된 경우, 마스터 배경이 적용되지 않을 수 있습니다." / "Slides with their own backgrounds may override the master background."
mode.specific.input     "예: 1, 3, 5-7" / "e.g. 1, 3, 5-7"
mode.specific.selectAll "전체 선택" / "Select all"
mode.specific.clear     "선택 해제" / "Clear"
mode.specific.hint      "썸네일을 클릭하거나 위에 범위를 입력하세요" / "Click thumbnails or type a range above"

thumbnails.heading       "슬라이드" / "Slides"
thumbnails.empty         "배경 없음" / "No background"
thumbnails.source.slide  "슬라이드" / "Slide"
thumbnails.source.layout "레이아웃" / "Layout"
thumbnails.source.master "마스터" / "Master"

background.heading       "새 배경" / "New background"
background.preview.label "미리보기" / "Preview"
background.upload.label  "이미지 업로드" / "Upload image"
background.upload.hint   "JPG, PNG 지원" / "JPG, PNG"
background.empty         "아직 배경이 선택되지 않았습니다" / "No background selected yet"
background.fromGallery   "갤러리에서 선택한 배경" / "From the gallery"
background.fromUpload    "직접 업로드한 배경" / "Uploaded image"
background.clear         "선택 해제" / "Clear selection"

gallery.heading          "배경 갤러리" / "Background gallery"
gallery.category.all     "전체" / "All"
gallery.category.gradient "그라디언트" / "Gradient"
gallery.category.nature   "자연" / "Nature"
gallery.category.texture  "텍스쳐" / "Texture"
gallery.category.pattern  "패턴" / "Pattern"
gallery.recent           "최근 사용" / "Recent"
gallery.empty            "해당 카테고리에 이미지가 없습니다" / "No images in this category"

action.apply             "배경 변경 적용" / "Apply background"
action.processing        "변환 중…" / "Converting…"
action.applyDisabledHint "배경 이미지를 먼저 선택하세요" / "Select a background image first"
action.specificEmpty     "적용할 슬라이드를 선택하세요" / "Select at least one slide"
```

`common.reset`은 기존 키 재사용 ("다시 작업하기" / "Reset").

### 7.2 기존 키 정리

`tools.ppt-background.description` — "슬라이드 배경을 한 번에 일괄 교체합니다." → "PPTX 슬라이드 배경을 한 번에 일괄 교체합니다." (영문은 기존 "Swap the background across every slide at once." 유지).

## 8. 검증

### 8.1 자동
- `pnpm exec tsc --noEmit` — 카테고리 union 변경에 따른 영향 전파 0 에러.
- `pnpm build` — Next 16 production build 통과.
- `vitest`:
  - `src/lib/common/pageRange.test.ts` — `parseRange`/`serializeRange` 라운드트립, 엣지케이스 (빈 입력, 공백/중복, 범위 역전, 클램프, 비숫자).
  - `src/lib/ppt/changeBackground.test.ts` — `specific-slides` 모드: 3장 fixture PPTX에서 `targetSlides: [2]`만 교체 → 슬라이드 1·3 XML byte-identical, 슬라이드 2 `<p:bg>` 갱신. 기존 모드 회귀.

### 8.2 수동 시각 (사용자 dev 서버)

체크리스트 — 1280×800 viewport, light·dark × KO·EN = 4조합:

- 빈 상태: 중앙 dropzone, 트레이 배경 좌우 여백 살아 있음.
- `.pptx` 업로드 → 2단 작업면 진입, 본문 전체 스크롤 없음.
- 모드 3종 토글 정상.
- "지정" 모드:
  - 썸네일 클릭 → 선택 outline·체크 배지 표시.
  - 텍스트 입력 (`1, 3, 5-7`) → 그리드 동기, debounce 300ms.
  - 전체 선택/해제 버튼.
- 배경 선택: 직접 업로드 + 갤러리 (4 카테고리 필터 + 최근 사용).
- 적용 → 다운로드 → 다시 작업 → 빈 상태 복귀.
- `.ppt` 업로드 → 빈 상태 유지 + dropzone 그대로 + 가이드 펼침 + 같은 dropzone에 변환된 .pptx 즉시 업로드 가능.
- standalone 라우트 (`/{locale}/tools/ppt-background`)와 Screen3 인라인 양쪽에서 동일 동작.

## 9. 작업 분해 (subagent-driven-development)

1. **워크스페이스 폭 + Screen3 분기 골격** — `globals.css` `--tweak-workspace-width` 상향, `Screen3Workspace`에 슬러그 분기 (컴포넌트는 placeholder), 다른 도구 영향 없음 확인.
2. **공통 유틸·컴포넌트 신설** — `pageRange.ts` + 테스트, `PageRangeSelector.tsx`, `ProcessingStatus.onReset` prop.
3. **갤러리 데이터·타입·리스킨** — `types.ts` 카테고리 4종 + `tags`, `mockData.ts` 재구성, `InlineGallery.tsx` silver 리스킨.
4. **`changeBackground` 로직 확장** — `BgMode`에 `"specific-slides"`, `targetSlides` 처리 분기 + 테스트.
5. **본문 컴포넌트 조립** — `PptBackgroundTool` 외 4종 신설, 상태 호스트, 양방향 동기, reset 핸들러, 빈/2단/.ppt 전이.
6. **standalone wrapper + Screen3 실연결** — `page.tsx` 본문 교체, `Screen3Workspace` placeholder → 실 컴포넌트.
7. **i18n 신규 키 + "PPTX" 카피 정리** — dict 양 locale, 본문 한국어 하드코딩 제거.
8. **검증 패스** — tsc + build, 사용자 dev 서버에서 시각 체크리스트 4조합.

각 태스크 후 사용자 승인 → 다음. 메모리 `ontab_conventions` 규칙 준수 (서브에이전트는 `pnpm dev` 안 띄움, `git add -A` 금지, 푸시·PR 사용자 승인 후만).

## 10. 미해결 (구현 단계 결정)

- `--tweak-workspace-width` 정확 px 값 — 1280×800에서 시각 검증으로 확정.
- 그라디언트 카테고리 mock 이미지 소스 — picsum(사진만) 대신 SVG data URL 합성 vs unsplash 시드.
- 갤러리 썸네일에 `toolcard` 머티리얼 클래스 적용 여부 — 시각 검증, 과하면 단순 `rounded border` fallback.
- "다시 작업하기" reset 범위 — 본 PR 기본은 **완전 초기화**(`pptxFile`까지). 사용자 피드백 보고 추후 "배경/모드만 초기화, PPTX 유지" 옵션 검토.
