# PRD_Z — 현재 구현 기준 (MVP 스냅샷)

> 본 문서는 `docs/PRD.md`(원안)과 달리, **현재 저장소에 실제로 구현된 기능**과 **확정된 리브랜딩·로드맵 계획**을 기술한다. 최초 작성: 2026-04-19 · 최근 갱신: 2026-05-13 (silver 디자인 + Phase 0 머지 반영).
> 도메인 용어는 [`CONTEXT.md`](../CONTEXT.md), 디자인 구현 contract 은 [`docs/design.md`](./design.md), 결정 이력은 [`docs/adr/`](./adr/). 2026-04 wood 시절 1차 계획은 [`docs/_archive/refactoring-plan.md`](./_archive/refactoring-plan.md).

---

## 1. 프로젝트 개요
- **서비스명:** **Ontab** (구 가칭 DocuFlow)
- **어원:** "on tab" — 브라우저 탭 위에 상주하는 도구 책상
- **한 줄 정의 (KR):** 브라우저 탭 위, 책상 위 문구처럼 언제든 꺼내 쓰는 문서 도구 모음
- **한 줄 정의 (EN):** The toolbox that lives in your browser tab — always within reach
- **기원:** 교회 주간 PPT·문서 작업의 반복을 줄이기 위한 개인 필요에서 출발. 기존 대체 서비스(iLovePDF, ppt.ai 등)의 서버 업로드 지연·일일 제한·PPT 배경 교체 미지원을 해소.
- **타겟:** 비전문가 글로벌 사용자 (교회·강사·학생·일반 직장인 등 반복 문서 작업자)
- **포지셔닝:** PPT 특화 간판 + PDF·이미지 범용 도구 하이브리드 (iLovePDF 대체재 + PPT 특화 확장)
- **핵심 가치 (현재 구현 기준):**
    - **Privacy-First (실현됨):** 모든 파일 처리가 브라우저 메모리 내에서 수행되며, 서버로 전송되지 않음.
    - **Zero-Install · Zero-Login:** 로그인·설치·결제 없이 즉시 사용 가능, 일일 처리 제한 없음.
    - **PPT 특화:** 경쟁 서비스에 없는 PPTX 배경 일괄 교체·이미지 추출 기능.
    - **Unified Workflow:** PPT·PDF·이미지 도구를 단일 UI에서 제공 (현재 시점 스냅샷 10여 종, 계속 확장 — 도구 목록은 `CONTEXT.md` "Tool" 항목 참조).

## 2. 기술 스택 (실제 설치 기준)
- **Framework:** Next.js 16.2.4 (App Router, native `[lang]` 세그먼트 + `src/proxy.ts` locale 리다이렉트, **`next-intl` 미사용** — ADR-0002) + React 19.2.4 + TypeScript 5
- **Styling:** Tailwind CSS 4 + 자체 silver 디자인 시스템 (`silver-*` 토큰, `accent-electric`/`accent-copper` 액센트, 머티리얼 클래스 `rim`/`brushed`/`lid`/`glint`/`nameplate`/`glass-btn`/`toolcard`/`tray-photo`/`dark-tray-surface` — 정의는 `src/app/globals.css`, 상세 spec 은 `docs/design.md`). shadcn/ui Radix primitives 는 폼 컨트롤 등 한정 사용.
- **브랜드 컴포넌트:** `src/components/brand/` (Wordmark, Tray, PhotoLid, GlassButton, Nameplate, ValueProp, CategoryStrip, FadeInCenter, ToolCard, Bi)
- **인터랙티브 랜딩:** `src/components/landing/` (Screen1Landing → Screen2Opened → Screen3Workspace)
- **i18n:** `@formatjs/intl-localematcher` + `negotiator` 로 locale 협상, 번역은 `src/i18n/locales/{ko,en}.json` plain JSON, 헤더에 KO/EN 2축 토글 (3축 카테고리 네비 없음)
- **패키지 매니저:** pnpm
- **핵심 라이브러리:**
    - PDF 처리: `pdf-lib` 1.17.1, `pdfjs-dist` 5.6.205
    - PDF 압축: `@kihyun1998/justpdf-compress-wasm` (Rust 기반 WASM, 클라이언트 처리)
    - PPT 조작: `jszip` 3.10.1 (PPTX XML/ZIP 조작), `cfb` 1.2.2 (PPT OLE2 바이너리 파싱)
    - 이미지 처리: `browser-image-compression` 2.0.2, Canvas API
    - 드래그 앤 드롭: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
    - UX: `sonner`(toast), `lucide-react`(icon), `next-themes`(다크모드)
- **미도입 (PRD 원안에 있었으나 현재 미통합):**
    - 인증: Clerk — `.env`에 키 자리만 존재, 코드 미연동
    - DB/Storage: Supabase — `.env`에 키 자리만 존재, 코드 미연동
    - 파일 업로드: `react-dropzone` — 대신 자체 구현 `src/components/common/FileUpload.tsx` 사용

---

## 3. 현재 제공 기능 (구현 완료)

### 3.1 PDF 도구 (6종)
| 기능 | 경로 | 구현 라이브러리 | 비고 |
| :--- | :--- | :--- | :--- |
| **이미지 → PDF** | `/tools/image-to-pdf` | `pdf-lib` | 이미지 크기에 맞춘 페이지 크기 자동 조정 |
| **PDF → 이미지** | `/tools/pdf-to-image` | `pdfjs-dist` + Canvas + `jszip` | JPG/PNG × 72/150/300 DPI, 300 DPI 메모리 경고, 다중 페이지 ZIP 패키징 |
| **PDF 합치기** | `/tools/pdf-merge` | `pdf-lib` | 업로드 순서대로 병합 (순서 변경 UI 미구현) |
| **PDF 압축** | `/tools/pdf-compress` | `@kihyun1998/justpdf-compress-wasm` | Light / Medium / Heavy 3단계, 원본·압축·절감률 비교 표시 |
| **PDF 분할** | `/tools/pdf-split` | `pdf-lib` + `jszip` | 범위 지정(`1-3, 5, 7-9`) / 전체 분리 2모드, 범위 파싱 에러 처리 |
| **PDF 페이지 관리** | `/tools/pdf-pages` | `pdfjs-dist` + `pdf-lib` + `@dnd-kit/sortable` | 썸네일 그리드, DnD 재정렬, 90° 회전, 삭제 토글, 새 PDF 저장 |

### 3.2 PPT 도구 (2종)
| 기능 | 경로 | 구현 라이브러리 | 비고 |
| :--- | :--- | :--- | :--- |
| **PPT 이미지 추출** | `/tools/ppt-extract` | `jszip` (PPTX) + `cfb` (PPT) | PPTX `ppt/media/` 추출, PPT는 OLE2 Pictures 스트림 파싱으로 이미지 추출 지원 |
| **PPT 배경 변경** | `/tools/ppt-background` | `jszip` + XML 조작 | **PPTX 전용**, 전체 슬라이드 / 마스터 슬라이드 2모드, `.ppt`는 변환 안내 UI 제공 |

**PPT 배경 변경 특수 흐름:**
1. PPTX 업로드 → `extractCurrentBackgrounds.ts`가 각 슬라이드의 현재 배경 썸네일 추출 (slide → layout → master 순 탐색)
2. 배경 이미지 지정 경로 2가지:
   - 로컬 파일 직접 업로드
   - 내장 InlineGallery(배경 이미지 갤러리)에서 선택
3. 배경 이미지 선택 시 갤러리 자동 접힘 + 미리보기 표시
4. `<p:bg>` 삽입/교체 + `_rels` 관계 파일 자동 업데이트

### 3.3 배경 이미지 갤러리 (Mock 단계)
- **제공 형태:** `src/components/ppt/InlineGallery.tsx` — **PPT 배경 변경 페이지 내부에 임베드된 접이식 UI**.
- **데이터:** `src/lib/gallery/mockData.ts` — 5개 카테고리(비즈니스/자연/미니멀/그라디언트/추상) × 16개 `picsum.photos` Mock 이미지.
- **기능:** 카테고리 버튼 필터 + 태그 Badge 필터 + 3컬럼 반응형 그리드.
- **최근 선택 이미지:** LocalStorage에 최대 8개 저장.
- **메인 노출 제외:** 독립 `/gallery` 경로는 `/tools/ppt-background`로 리다이렉트 (메인 그리드 미노출).
- **미구현:** Supabase 연동, 사용자 업로드/기여, 관리자 승인 플로우.

### 3.4 이미지 도구 (2종)
| 기능 | 경로 | 구현 라이브러리 | 비고 |
| :--- | :--- | :--- | :--- |
| **이미지 압축 · 변환** | `/tools/image-compress` | `browser-image-compression` + Canvas `toBlob` + `jszip` | JPG/PNG/WebP 출력, 품질 슬라이더(10~100%), 단일→직접 DL / 다중→ZIP |
| **이미지 크기 변경** | `/tools/image-resize` | Canvas API (`imageSmoothingQuality: "high"`) | 픽셀·배율·프리셋 3모드, 종횡비 잠금, 업스케일 경고, **CropSelector**로 프리셋 비율 크롭 영역 지정 |

**이미지 크기 변경 프리셋:** 1920×1080 (FHD), 1280×720 (HD), 1080×1080 (정방형), 800×600, 400×300
**크롭 UX:** 프리셋 비율이 원본과 다를 경우 반투명 오버레이 + 3×3 가이드 그리드 + 드래그로 크롭 위치 이동.

### 3.5 공통 UX
- **파일 업로드 컴포넌트:** `FileUpload.tsx` — 드래그 하이라이트, 파일 목록(크기/제거), Sonner toast 오류.
- **처리 상태 컴포넌트:** `ProcessingStatus.tsx` — idle / processing / done / error 4상태, Progress Bar.
- **다크 모드:** `next-themes` 기반 테마 토글.
- **UI 언어:** 한국어.

---

## 4. 파일/디렉터리 구조 (현재)

```
src/
├── app/
│   ├── layout.tsx                 # Header / Footer / Toaster
│   ├── page.tsx                   # 도구 카드 그리드 (카테고리: pdf / ppt / image)
│   └── tools/
│       ├── image-compress/        ├── pdf-compress/
│       ├── image-resize/          ├── pdf-merge/
│       ├── image-to-pdf/          ├── pdf-pages/
│       ├── pdf-to-image/          ├── pdf-split/
│       ├── ppt-background/        └── ppt-extract/
├── components/
│   ├── ui/         # shadcn (button, card, badge, alert, progress, sonner)
│   ├── layout/     # Header, Footer
│   ├── common/     # FileUpload, ProcessingStatus
│   ├── pdf/        # PageGrid, PageThumbnail
│   ├── ppt/        # InlineGallery
│   └── image/      # CropSelector
└── lib/
    ├── constants.ts                # TOOLS 배열, FILE_SIZE_LIMIT
    ├── pdf/                        # mergePdf, splitPdf, compressPdf,
    │                               # pdfToImage, imageToPdf, managePages, downloadBlob
    ├── ppt/                        # changeBackground, extractImages,
    │                               # extractImagesFromPpt, extractCurrentBackgrounds
    ├── image/                      # compressImage, resizeImage
    └── gallery/                    # mockData, types, storage(LocalStorage)
```

---

## 5. 데이터 저장소 현황
- **서버 DB/Storage 없음.** 모든 상태는 브라우저 메모리 + LocalStorage(최근 선택 배경 이미지)에서만 유지.
- **.env 자리 표시자만 존재:**
    - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
    - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- PRD 원안의 `background_images` 테이블 / `assets`·`temp` 버킷은 **미생성**.

---

## 6. 사용자 흐름 (현재 구현)

### 6.1 도구 사용 흐름 (Phase 0 머지 후 — 인터랙티브 랜딩 기준)
1. **Landing (`/{locale}`):** `Screen1Landing` 이 풀블리드 트레이 사진 + 카테고리 strip (PPT / PDF / 이미지) 렌더. 사용자가 `proxy.ts` 의 locale 협상으로 `/ko` 또는 `/en` 으로 자동 리다이렉트됨.
2. **카테고리 선택 → `Screen2Opened`:** 트레이 lid 가 들리며 해당 카테고리의 도구 카드가 노출. 시점 스냅샷의 도구 수는 카테고리당 다름 (현재 PPT 2 / PDF 5 / 이미지 3), 도구 목록은 단일 레지스트리 파생.
3. **도구 선택 → `Screen3Workspace`:** 동일 페이지 안에서 워크스페이스 영역이 펼쳐짐. 마이그레이션 완료된 도구는 **인라인 컴포넌트**로 업로드·처리·다운로드까지 완결. 미마이그레이션 도구는 임시 브릿지 `Link → /{locale}/tools/{slug}` 로 라우팅 (Phase 1 동안 도구별로 인라인 호출로 교체 — `CONTEXT.md` "Architecture" 참조).
4. **직링크 라우트 `/{locale}/tools/{slug}`:** SEO·북마크·하위호환용으로 유지. 동일 도구 컴포넌트가 Screen3 와 직링크 페이지 양쪽에서 재사용됨.
5. **Processing & Download:** 도구 내부에서 `ProcessingStatus` 로 진행률·에러 표시, Blob → 직접 다운로드 또는 다중 결과는 `jszip` 으로 ZIP 패키징. 전 과정 클라이언트.

### 6.2 PPT 배경 변경 특화 흐름
1. PPTX 업로드 → 현재 슬라이드 배경 썸네일 표시.
2. InlineGallery 펼쳐 선택 **또는** 로컬 이미지 업로드.
3. 모드 선택(전체 슬라이드 / 마스터).
4. 변환된 PPTX 다운로드.

### 6.3 오류 처리
- 파일 형식/크기 미충족 → 업로드 단계 Sonner toast.
- 처리 중 실패 → `ProcessingStatus` error 상태 + 재시도 가능.
- `.ppt` 배경 변경 시 → PowerPoint / Google 슬라이드 / LibreOffice 3가지 변환 방법 안내 UI.
- 고해상도/대용량 → 메모리 경고 메시지(300 DPI, 업스케일 등).

---

## 7. 현재 제약 (Constraints as-is)
- 모든 처리가 **클라이언트 사이드 전용** → 브라우저 메모리 한도에 의존.
- **파일 크기 제한:** `FILE_SIZE_LIMIT` 상수만 정의(비로그인 10MB / 로그인 50MB). **로그인 구분 로직 없음** → 현재는 상수값 참조만 존재, 실제 일일 처리 횟수 제한 미구현.
- **PPT(.ppt, OLE2) 배경 변경 미지원** — 이미지 추출만 지원.
- **PDF 합치기 순서 변경 UI 미구현** — 업로드 순서대로 병합.
- **이미지 압축 "목표 용량(KB) 입력 모드" 미구현** — 품질 슬라이더만.
- **API Route / 서버 엔드포인트 없음** — 100% Static/Client.

---

## 8. Post-MVP 로드맵 (Ontab silver 기준, 2026-05-13 갱신)

> 갱신 이력:
> - 2026-04-20: wood 톤 + `next-intl` + 3축 네비 기반 1차 로드맵.
> - 2026-05-13: 디자인을 silver/metallic 로 전환, i18n 을 Next 16 native `[lang]` 세그먼트로 전환, 3축 네비 폐기·KO/EN 2축 토글로 단순화. 관련 결정은 `docs/adr/0001-silver-design-system.md`, `docs/adr/0002-next16-native-i18n-and-chrome-route-group.md` 참조.
>
> 전략: 공통 인프라 선행(완료) → 도구 단위로 "silver 디자인 + 기능 개선 + 영어 번역" 한 번에 마이그레이션 → 신규 도구 추가 → SEO·광고 → 문서화. 도구 목록은 시점 스냅샷이며 계속 확장됨 (`CONTEXT.md` "Tool" 항목 참조).

### Phase 0 — 공통 인프라 ✅ 완료 (PR #1, 2026-05 머지·배포)
- [x] Ontab 브랜딩 자산 — silver/metallic 팔레트, tray + lid 메타포 (wood/책상·문구는 폐기)
- [x] Tailwind 4 silver 토큰(`silver-*`, `accent-electric`, `accent-copper`) + 머티리얼 클래스(`rim`/`brushed`/`lid`/`glint`/`nameplate`/`glass-btn`/`toolcard`/`tray-photo`/`dark-tray-surface`)
- [x] Next 16 native i18n — `src/proxy.ts` + `[lang]` 세그먼트 + `src/i18n/locales/{ko,en}.json` (`next-intl` 미사용, ADR-0002)
- [x] 라우트 구조 — `src/app/[lang]/page.tsx`(랜딩, chrome 밖) + `src/app/[lang]/(chrome)/tools/{slug}/page.tsx`(도구, chrome 안)
- [x] 인터랙티브 랜딩 (Screen1/2/3) + Header/Footer/LanguageToggle (KO/EN + 테마 토글, 3축 네비 없음)

### Phase 1 — 기존 도구 silver 마이그레이션 (진행 중)
도구당 1 브랜치(`feat/ontab-phase-1-{slug}`) = 1 PR. 작업: silver 디자인 적용 + 영어 번역 + `docs/IMPROVEMENTS.md` 의 해당 항목 반영 + `Screen3Workspace` 의 임시 브릿지 Link 를 **인라인 컴포넌트 호출**로 교체 (랜딩 인라인 실행 모델, `CONTEXT.md` "Architecture" 참조).
우선순위: `ppt-background` → `image-resize` → `image-compress` → `pdf-merge` → `pdf-split` → `pdf-pages` → `pdf-compress` → `pdf-to-image` → `image-to-pdf` → `ppt-extract`.

### Phase 2 — 신규 도구 (브라우저 처리 범위 확장)
도구 목록은 계속 확장됨. 현재 후보:
- **PPT:** PPTX 압축 / 슬라이드 → 이미지 일괄 변환
- **PDF:** 워터마크 추가·제거 / 페이지 번호 / 잠금·잠금해제(`qpdf-wasm`) / OCR(`Tesseract.js`) / 서명·간단 편집
- **이미지:** 배경 제거(`@imgly/background-removal`) / 크롭(독립 도구화) / 워터마크 / HEIC → JPG(`heic2any`) / SVG → PNG

우선순위는 Phase 1 종료 시점에 재조정.

### Phase 3 — SEO & 수익화
- [ ] 각 도구 페이지 메타데이터(title/description/OG) KR·EN 분리
- [ ] JSON-LD 구조화 데이터 (`WebApplication` / `SoftwareApplication`)
- [ ] `sitemap.xml`, `robots.txt` 자동 생성 (도구 레지스트리에서 파생)
- [ ] 모바일 브레이크포인트(375/768/1280) 최종 검수 (데스크톱 1급, 모바일 반응형 보장)
- [ ] 구글 AdSense 슬롯 적용 (최후순위, 디자인 단계에서 슬롯 위치만 예약)
- [ ] PDF → 이미지 대용량(50MB+) 성능 최적화

### Phase 4 — 문서화 & 공개
- [ ] README.md 재작성 (Ontab 정체성, 도구 카테고리, 로컬 실행, 기여 가이드)
- [ ] 오픈소스 공개 준비

### 본 로드맵에서 제외 (Post-Ontab 단계로 연기)
- 로그인·회원가입 (Clerk 등) · 세션 기반 용량 차등
- Supabase `background_images` 테이블 / Storage / 사용자 갤러리 기여 · 관리자 승인
- 유료 Pro 티어 · 결제
- PDF → Word/Excel/PPT 변환 (서버 측·품질 문제)

---

## 9. MVP 정의 (Definition of Done — 2026-04 MVP 시점 기준)
본 프로젝트는 아래 조건을 만족하여 **MVP 상태에 도달**한 것으로 간주한다 (시점 한정 — 이후 도구는 계속 추가됨):
1. ✅ MVP 시점 10개 도구(PDF 6 + PPT 2 + 이미지 2) 모두 동작.
2. ✅ 업로드 → 처리 → 다운로드 파이프라인이 모든 도구에서 일관된 UX로 작동.
3. ✅ 모든 처리가 서버 전송 없이 브라우저에서 완결.
4. ✅ PPT 배경 변경에 Mock 갤러리 + 현재 배경 프리뷰가 통합됨.
5. ✅ 다크 모드, 반응형 그리드, 에러 핸들링, 한국어 UI 제공.

다음 마일스톤(Post-MVP)은 **Ontab 리브랜딩 + 리디자인 + i18n + 신규 도구 확장**(§8 Phase 0~4)으로 정의한다.
