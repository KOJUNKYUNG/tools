# TODO

## P0

- [x] 프로젝트 초기 세팅 (Next.js App Router + Tailwind + Shadcn/UI)
  - Acceptance: 기본 레이아웃(헤더, 푸터, 반응형)과 랜딩 페이지에서 각 도구 카드 목록이 렌더링됨
  - Notes: Mock 데이터 없음. 정적 UI 구성만 해당
  - Done: `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`, `src/lib/constants.ts` 생성. Shadcn `card`, `badge`, `progress`, `alert` 컴포넌트 추가.

- [x] 파일 업로드 공통 컴포넌트 구현 (react-dropzone)
  - Acceptance: 드래그 앤 드롭 및 클릭 업로드 동작, 파일 형식/크기 유효성 검사 및 오류 메시지 표시
  - Notes: 파일 크기 제한 로직은 Mock 상수값(비로그인 10MB / 로그인 50MB)으로 처리
  - Done: `src/components/common/FileUpload.tsx` 생성. 드래그 하이라이트, 파일 목록(크기·제거), Sonner toast 오류 표시 포함.

- [x] 이미지 → PDF 변환 기능 구현
  - Acceptance: JPG/PNG 다중 업로드 후 하나의 PDF로 다운로드 가능
  - Notes: `pdf-lib` 클라이언트 사이드 처리. 서버 불필요
  - Done: `src/app/tools/image-to-pdf/page.tsx`, `src/lib/pdf/imageToPdf.ts` 생성. 이미지 크기에 맞게 페이지 크기 자동 조정.

- [x] PDF → 이미지 변환 기능 구현
  - Acceptance: PDF 업로드 후 페이지별 이미지 추출, 출력 형식(JPG/PNG)·해상도(72/150/300 DPI) 선택 후 다운로드 가능
  - Notes: `pdfjs-dist` + Canvas API. Web Worker 설정 포함. 고해상도·대용량 파일은 메모리 경고 메시지 표시
  - Done: `src/app/tools/pdf-to-image/page.tsx`, `src/lib/pdf/pdfToImage.ts` 생성. `pdfjs-dist` v5 Worker를 CDN(unpkg)에서 로드. JPG/PNG 형식 선택 및 72/150/300 DPI 옵션 UI 구현. 단일 페이지는 이미지 직접 다운로드, 다중 페이지는 `jszip`으로 ZIP 패키징. 300 DPI 선택 시 메모리 경고 표시. Canvas 렌더링 후 즉시 메모리 해제(`canvas.width = 0`).

- [x] PDF 파일 합치기 기능 구현
  - Acceptance: 여러 PDF 업로드 후 순서 조정, 병합된 단일 PDF 다운로드 가능
  - Notes: `pdf-lib` 클라이언트 사이드 처리
  - Done: `src/app/tools/pdf-merge/page.tsx`, `src/lib/pdf/mergePdf.ts` 생성. `PDFDocument.copyPages()` 활용. 브라우저 메모리 초과 시 안내 메시지 포함.
  - 미구현: 업로드 후 순서 변경 UI (P2로 이관)

- [x] PPT 이미지 추출 기능 구현
  - Acceptance: PPTX 업로드 후 `ppt/media` 내 이미지 전체를 ZIP 파일로 다운로드 가능
  - Notes: `jszip` 클라이언트 사이드 처리. .ppt 형식 업로드 시 지원 불가 안내 메시지 표시
  - Done: `src/app/tools/ppt-extract/page.tsx`, `src/lib/ppt/extractImages.ts` 생성. `jszip`으로 PPTX 내 `ppt/media/` 경로의 이미지 파일(png, jpg, gif, bmp, tiff, svg, emf, wmf) 추출. 추출된 이미지를 새 ZIP으로 패키징하여 다운로드. `.ppt` 파일 업로드 시 경고 메시지 표시. 이미지 없는 PPTX는 오류 메시지 처리.

- [x] PPT 배경 일괄 변경 기능 구현
  - Acceptance: PPTX 업로드 후 배경 이미지 선택(로컬 파일), 전체 슬라이드 일괄 적용 또는 마스터 슬라이드 적용 모드 선택 후 변경된 PPTX 다운로드 가능
  - Notes: `jszip`으로 XML 파싱 및 수정. `<p:bg>` 없는 슬라이드 및 마스터 상속 케이스 예외 처리 필수
  - Done: `src/app/tools/ppt-background/page.tsx`, `src/lib/ppt/changeBackground.ts` 생성. 2단계 업로드 UI(PPTX → 배경 이미지). "전체 슬라이드 일괄 적용" / "마스터 슬라이드 적용" 모드 선택. `jszip`으로 PPTX XML 파싱 후 `<p:bg>` 요소 삽입/교체, `_rels` 관계 파일 자동 업데이트. 기존 `<p:bg>` 없는 슬라이드에도 정상 삽입. 마스터 모드 선택 시 개별 슬라이드 배경 우선순위 안내 표시. `.ppt` 형식 지원 불가 경고 포함.

- [x] 처리 진행 상태 UI (Progress Bar + 오류 처리)
  - Acceptance: 파일 처리 중 Progress Bar 표시, 실패 시 오류 원인 메시지 및 재시도 버튼 노출, 브라우저 메모리 초과 시 파일 크기 축소 권고 메시지 표시
  - Notes: 클라이언트 사이드 상태 관리로 구현
  - Done: `src/components/common/ProcessingStatus.tsx` 생성. `idle` / `processing` / `done` / `error` 4가지 상태 처리. progress props로 진행률 수신.

- [x] 배경 이미지 갤러리 UI 구현 (Mock 데이터 기반)
  - Acceptance: 카테고리·태그 필터링, 이미지 그리드 렌더링, 이미지 선택 시 PPT 배경 교체 도구와 즉시 연동 동작
  - Notes: Supabase 없이 Mock 이미지 배열로 구현. LocalStorage에 최근 선택 이미지 저장
  - Done: `src/app/gallery/page.tsx`, `src/lib/gallery/types.ts`, `src/lib/gallery/mockData.ts`, `src/lib/gallery/storage.ts` 생성. 5개 카테고리(비즈니스, 자연, 미니멀, 그라디언트, 추상) × 16개 Mock 이미지(picsum.photos). 카테고리 필터 버튼 + 태그 필터 Badge UI 구현. 반응형 3컬럼 이미지 그리드(hover 시 "배경으로 사용" 버튼 노출). 이미지 선택 시 LocalStorage에 저장 후 `/tools/ppt-background?from=gallery`로 리다이렉트. PPT 배경 변경 페이지에서 갤러리 이미지 자동 fetch → File 변환 연동. 최근 선택 이미지 최대 8개 LocalStorage 저장 및 갤러리 상단에 표시. `next.config.ts`에 picsum.photos 이미지 도메인 추가.

### 추가 사항

- [x] PPT 이미지 추출, 배경 변경 기능이 PPT 파일도 지원하게
  - Done: `cfb` 패키지 추가로 OLE2 바이너리(.ppt) 파일에서 Pictures 스트림 파싱 후 이미지 추출 가능. `src/lib/ppt/extractImagesFromPpt.ts` 생성, `extractImages.ts`에서 .ppt/.pptx 자동 분기 처리. PPT 이미지 추출 페이지 UI에서 .ppt 지원 안내 반영. 배경 변경은 XML 수정이 필요하여 .ppt 바이너리 형식은 클라이언트 사이드에서 지원 불가 → .pptx 변환 안내 메시지 개선.
- [x] 배경 갤러리는 메인 화면에 노출시키지 않고, PPT 배경 변경에서 파일을 업로드하면 현재 배경을 보여주고 배경 갤러리가 아래 쪽으로 펼쳐지게 하여 바꿀 배경을 배경 갤러리에서 고를 수 있도록 하기
  - Done: 메인 페이지 TOOLS 배열에서 갤러리 제거. `/gallery` 경로 접근 시 `/tools/ppt-background`로 리다이렉트. `src/lib/ppt/extractCurrentBackgrounds.ts` 생성 — PPTX 업로드 시 각 슬라이드의 배경 이미지 추출(slide → layout → master 순 탐색) 후 썸네일 표시. `src/components/ppt/InlineGallery.tsx` 생성 — 접이식 갤러리 UI(카테고리·태그 필터)를 PPT 배경 변경 페이지 내에 통합. 직접 업로드 또는 갤러리 선택 두 가지 경로로 배경 이미지 지정 가능.
- [x] .ppt 파일 배경 변경 불가 안내에 .pptx 변환 상세 방법 추가 (PowerPoint / Google 슬라이드 / LibreOffice 3가지 방법)
  - Done: .ppt 업로드 시 경고 메시지를 3가지 변환 방법(PowerPoint 다른 이름으로 저장, Google 슬라이드 무료 변환, LibreOffice Impress)으로 상세 안내하는 UI로 교체. 각 방법에 단계별 순서(ol) 및 외부 링크 포함.
- [x] PPT 배경 변경 — 새 배경 이미지 선택 시 갤러리 자동 접힘 + 미리보기 표시
  - Done: `InlineGallery`에 `forceCollapsed` prop 추가 — 배경 이미지가 선택되면 갤러리 자동 접힘. 선택된 배경 이미지의 미리보기(aspect-video)를 선택 정보 아래에 표시. 직접 업로드 시 `URL.createObjectURL`로, 갤러리 선택 시 썸네일 URL로 미리보기 생성. 선택 해제 시 ObjectURL 정리.

---

## P1

### 신규 도구 구현

- [x] PDF 압축 기능 구현
  - Acceptance: PDF 업로드 후 Light/Medium/Heavy 3단계 압축 레벨 선택, 압축 완료 후 처리 전·후 파일 크기 비교 표시 및 다운로드 가능
  - Notes: `@kihyun1998/justpdf-compress-wasm` 패키지 설치. Rust 기반 WASM으로 파일이 서버에 전송되지 않음. Web Worker로 메인 스레드 블로킹 방지. 기존 `ProcessingStatus` 컴포넌트 재활용.
  - 구현 파일: `src/app/tools/pdf-compress/page.tsx`, `src/lib/pdf/compressPdf.ts`
  - Done: `@kihyun1998/justpdf-compress-wasm` 패키지 설치. `compressPdf.ts`에서 동적 import로 WASM 초기화 후 `compress(bytes, preset)` 호출. 페이지 UI에 Light(화질 유지, 10~30%)/Medium(범용, 30~60%)/Heavy(강한 압축, 60~80%) 3단계 선택 버튼 구현. 압축 완료 후 원본 크기·압축 후·절감률을 3컬럼 그리드로 비교 표시. `ProcessingStatus` 재활용.

- [x] PDF 분할 기능 구현
  - Acceptance: PDF 업로드 후 범위 지정 모드(예: `1-3, 5, 7-9`) 또는 전체 분리 모드 선택. 범위 지정 시 단일 PDF, 전체 분리 시 ZIP 파일로 다운로드 가능
  - Notes: `pdf-lib`으로 클라이언트 사이드 처리 (추가 패키지 설치 불필요). 범위 입력 파싱 로직 구현 필요 (쉼표·하이픈 혼용). 유효하지 않은 범위 입력 시 즉시 오류 메시지 표시. 다중 분할 결과는 `jszip`으로 패키징.
  - 구현 파일: `src/app/tools/pdf-split/page.tsx`, `src/lib/pdf/splitPdf.ts`
  - Done: `splitPdf.ts`에 `parsePageRanges()` 함수 구현 — 쉼표·하이픈 혼용 범위 파싱, 유효하지 않은 범위 즉시 에러. 업로드 시 `pdf-lib`으로 총 페이지 수 자동 표시. 범위 지정 모드는 `copyPages`로 단일 PDF 추출, 전체 분리 모드는 페이지별 개별 PDF 생성 후 `jszip` ZIP 패키징.

- [x] PDF 페이지 관리 기능 구현
  - Acceptance: PDF 업로드 후 각 페이지 썸네일 그리드 표시. 드래그 앤 드롭 재정렬, 체크박스 선택 후 삭제, 개별 페이지 90°/180° 회전 가능. 변경 완료 후 새 PDF로 다운로드 가능
  - Notes: `@dnd-kit/sortable` 패키지 설치 (PDF 합치기 P2 항목과 동일 라이브러리). `pdfjs-dist`로 각 페이지 썸네일 Canvas 렌더링. `pdf-lib`으로 페이지 재조합·회전 처리. 대용량 PDF(페이지 수 많음) 썸네일 렌더링 시 청크 단위 처리 권장.
  - 구현 파일: `src/app/tools/pdf-pages/page.tsx`, `src/lib/pdf/managePages.ts`, `src/components/pdf/PageThumbnail.tsx`, `src/components/pdf/PageGrid.tsx`
  - Done: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` 패키지 설치. `managePages.ts`에 `generateThumbnails()` — `pdfjs-dist`로 각 페이지 200px 너비 JPEG 썸네일 Canvas 렌더링 후 dataURL 저장, `rebuildPdf()` — 활성 페이지만 `pdf-lib` `copyPages`+`degrees()` 회전 적용 후 새 PDF 생성. `PageThumbnail.tsx` — 썸네일·90° 회전·삭제 토글·드래그 핸들 UI. `PageGrid.tsx` — `DndContext`+`SortableContext`+`rectSortingStrategy`로 드래그 앤 드롭 재정렬 그리드(3~5컬럼 반응형). 페이지에서 전체/활성 페이지 수 표시 및 "PDF 생성하기" 버튼.

- [x] 이미지 압축 및 포맷 변환 기능 구현
  - Acceptance: JPG/PNG/WebP 이미지 다중 업로드 후 출력 포맷(JPG/PNG/WebP) 선택 및 품질(%) 슬라이더 또는 목표 용량(KB) 입력으로 압축. 처리 전·후 파일 크기 비교 표시. 다중 파일은 ZIP 다운로드
  - Notes: `browser-image-compression` 패키지 설치. 클라이언트 사이드 처리. 단일 파일은 직접 다운로드, 다중 파일은 `jszip`으로 ZIP 패키징. WebP 출력은 Canvas API `toBlob('image/webp')` 활용.
  - 구현 파일: `src/app/tools/image-compress/page.tsx`, `src/lib/image/compressImage.ts`
  - Done: `browser-image-compression` 패키지 설치. `compressImage.ts`에서 동일 포맷이면 `browser-image-compression` 라이브러리로 압축, 포맷 변환 시 Canvas API `toBlob()` 활용. 출력 포맷 3종(JPG/PNG/WebP) 선택 버튼 + 품질 슬라이더(10~100%) UI 구현. 각 파일별 원본→압축 크기 및 절감률 비교 표시. 단일 파일은 직접 다운로드, 다중 파일은 `jszip` ZIP 패키징.
  - 미구현: 목표 용량(KB) 직접 입력 모드 (품질 슬라이더만 구현, P2로 이관 가능)

- [x] 이미지 크기 변경 기능 구현
  - Acceptance: 이미지 업로드 후 ① 픽셀 직접 입력(너비·높이, 종횡비 잠금 옵션) ② 비율 입력(%) ③ 프리셋 선택(1920×1080 등) 중 하나로 크기 변경 후 다운로드 가능
  - Notes: 추가 패키지 없이 `OffscreenCanvas` + Canvas API로 구현 가능. 종횡비 잠금 시 너비/높이 한 쪽 입력 시 나머지 자동 계산. 프리셋 목록: 1920×1080 (FHD), 1280×720 (HD), 1080×1080 (정방형/인스타), 800×600, 400×300. 업스케일(원본보다 크게) 시 화질 저하 안내 메시지 표시.
  - 구현 파일: `src/app/tools/image-resize/page.tsx`, `src/lib/image/resizeImage.ts`
  - Done: `resizeImage.ts`에서 Canvas API로 리사이즈 — `imageSmoothingQuality: "high"` 적용. 3가지 모드 UI 구현: 픽셀 지정(너비·높이 입력 + 종횡비 잠금/해제 토글 버튼), 비율(% 입력 + 결과 크기 실시간 미리보기), 프리셋(FHD·HD·정방형·800×600·400×300) 선택 버튼. 업로드 시 `Image` 객체로 원본 크기 자동 표시. 업스케일 시 화질 저하 경고 메시지 표시. 변경 결과에 원본→변경 크기 비교 표시.

### 추가 사항

- [x] 메인 페이지 TOOLS 배열 및 카테고리 확장
  - Done: `src/lib/constants.ts`에 5개 신규 도구(`pdf-compress`, `pdf-split`, `pdf-pages`, `image-compress`, `image-resize`) 등록. `ToolInfo.category`에 `"image"` 타입 추가. `src/app/page.tsx`의 `CATEGORY_LABEL`에 `image: "이미지"` 추가. 홈 설명 문구를 신규 도구 반영하여 업데이트.
- [x] 신규 도구 패키지 설치
  - Done: `@kihyun1998/justpdf-compress-wasm` (PDF 압축 WASM), `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (드래그 앤 드롭), `browser-image-compression` (이미지 압축) 설치 완료.
- [x] PDF 페이지 관리 — 드래그 앤 드롭 순서 변경 동작 안 되는 문제 해결
  - Done: `listeners`(포인터 이벤트 핸들러)를 작은 grip 아이콘이 아닌 전체 카드 래퍼에 적용하도록 `PageGrid.tsx`의 `SortableItem` 수정. `PageThumbnail.tsx`에서 `dragHandleProps` prop 제거, 카드 전체에 `cursor-grab`/`active:cursor-grabbing` 스타일 적용. grip 아이콘은 `pointer-events-none` 시각적 힌트로 유지. 회전·삭제 버튼에 `onPointerDown stopPropagation` 추가하여 버튼 클릭 시 드래그 방지.
- [x] 이미지 크기 변경 — 프리셋 선택 시 크롭 영역 선택 기능 추가
  - Done: `src/components/image/CropSelector.tsx` 생성 — 프리셋 비율이 원본 비율과 다를 때 표시. 원본 이미지 미리보기 위에 프리셋 비율의 크롭 영역을 반투명 오버레이로 표시. 드래그로 크롭 위치 이동 가능(PointerCapture 활용). 3×3 가이드 그리드 표시. `resizeImage.ts`에 `CropArea` 인터페이스 및 `crop` 옵션 추가 — `drawImage(img, sx, sy, sw, sh, 0, 0, tw, th)` 소스 영역 지정으로 크롭+리사이즈 동시 처리. 비율이 동일한 경우 크롭 UI를 표시하지 않고 기존처럼 전체 이미지 리사이즈.
- [x] 이미지 크기 변경 — '비율' → '배율' 명칭 변경
  - Done: 크기 변경 방식 버튼 라벨, 입력 필드 라벨, 페이지 설명 문구의 '비율'을 '배율'로 일괄 변경.

### 인증 및 데이터

- [ ] Clerk 인증 연동
  - Acceptance: 회원가입/로그인/로그아웃 동작, 로그인 상태에 따라 파일 크기 제한 차등 적용
  - Notes: P0에서 Mock 상수로 처리한 용량 제한 로직을 Clerk 세션 기반으로 교체. `src/lib/constants.ts`의 `FILE_SIZE_LIMIT` 참조.

- [ ] Supabase 프로젝트 설정 및 `background_images` 테이블 생성
  - Acceptance: `id`, `url`, `category`, `tags`, `uploaded_by`, `is_approved`, `file_size`, `created_at` 컬럼 생성 완료, RLS 정책 적용
  - Notes: `assets` 및 `temp` Storage Bucket 생성 포함

- [ ] 갤러리 데이터 Supabase 마이그레이션
  - Acceptance: Mock 이미지 데이터를 Supabase DB/Storage로 이전, 갤러리 페이지가 Supabase에서 데이터를 fetch하여 렌더링
  - Notes: P0 Mock 배열 제거 후 Supabase 클라이언트로 교체

- [ ] 사용자 이미지 업로드 기능 구현 (갤러리 기여)
  - Acceptance: 로그인 사용자가 이미지 업로드 후 카테고리·태그 입력, Supabase Storage에 저장 및 DB에 `is_approved: false` 상태로 레코드 생성, 승인 대기 안내 메시지 표시
  - Notes: 비로그인 사용자 접근 시 로그인 유도 UI 표시

- [ ] 관리자 승인 기능 구현
  - Acceptance: 관리자 계정으로 로그인 시 미승인 이미지 목록 확인 및 승인/거절 처리 가능, 승인된 이미지만 갤러리에 노출
  - Notes: 관리자 식별은 Clerk `publicMetadata` 또는 Supabase 별도 컬럼으로 관리

---

## P2

- [ ] PDF 파일 합치기 — 순서 변경 UI
  - Acceptance: 업로드된 PDF 목록에서 드래그 앤 드롭으로 순서 변경 가능
  - Notes: P0에서 순서 변경 없이 업로드 순서 그대로 병합되도록 구현됨. `@dnd-kit/sortable` 이미 설치됨 (P1 PDF 페이지 관리에서 설치 완료). `PageGrid.tsx`의 `SortableContext` 패턴 재활용 가능.

- [ ] 파일 처리 용량 제한 수치 확정 및 적용
  - Acceptance: 비로그인 최대 10MB·일 5회, 로그인 최대 50MB·무제한 제한 로직 실제 동작 검증
  - Notes: TBD 수치 확정 후 P1 Clerk 연동 코드에 반영. 초과 시 안내 메시지 표시

- [ ] SEO 설정 (각 도구 페이지 메타데이터)
  - Acceptance: 각 도구 페이지에 고유한 title, description, OG tags 적용, Next.js `metadata` API 사용
  - Notes: 추후 검색 노출 극대화를 위해 각 페이지에 사용 가이드 텍스트 콘텐츠 포함

- [ ] 구조화 데이터(JSON-LD) 적용
  - Acceptance: `WebApplication` 또는 `SoftwareApplication` 스키마가 각 도구 페이지에 삽입, Google Rich Results Test 통과
  - Notes: Next.js `<Script>` 컴포넌트로 JSON-LD 삽입

- [ ] sitemap.xml 및 robots.txt 자동 생성
  - Acceptance: `/sitemap.xml`, `/robots.txt` 경로에서 정상 응답, 모든 도구·갤러리 페이지 URL 포함
  - Notes: Next.js App Router의 `sitemap.ts`, `robots.ts` 파일 활용

- [ ] 구글 애드센스 배치 및 UI 최적화
  - Acceptance: 각 도구 페이지의 지정 위치에 애드센스 광고 단위 노출, 모바일 레이아웃에서 광고로 인한 UX 저해 없음
  - Notes: 광고 단위 코드는 애드센스 심사 통과 후 삽입

- [ ] 모바일 반응형 UI 최종 검수
  - Acceptance: 주요 브레이크포인트(375px, 768px, 1280px)에서 파일 업로드·처리·다운로드 흐름 전체 동작 확인
  - Notes: Tailwind 반응형 유틸리티 사용

- [ ] PDF → 이미지 변환 성능 최적화 (대용량 파일)
  - Acceptance: 50MB PDF 처리 시 브라우저 탭 크래시 없이 완료, 또는 처리 불가 시 명확한 안내 메시지 표시
  - Notes: `pdfjs-dist` Web Worker 분리 및 페이지 단위 청크 처리 방식 검토
