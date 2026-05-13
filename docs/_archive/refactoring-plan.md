# 코드 리팩토링 계획

작성일: 2026-04-19
대상: `src/app/tools/*`, `src/lib/*`, `src/components/*`

---

## 배경

- 10개 툴 페이지(`src/app/tools/*/page.tsx`)가 거의 동일한 상태 관리 패턴을 반복
- 에러 메시지 변환 로직이 각 페이지에 중복 (예: `pdf-merge/page.tsx:42-50`의 memory/OOM 분기)
- 타입 정의가 여러 파일에 분산 (`ProcessingState`가 `components/common/ProcessingStatus.tsx`에 위치)
- 추후 i18n, SEO, OG 이미지 작업을 앞두고 기반 정비 필요

---

## Phase 1: 타입 중앙화 (약 30분)

**목적:** 이후 모든 작업의 기반. 타입부터 정리해야 훅 추출·에러 처리가 깔끔해짐.

- [ ] `src/types/tool.ts` 생성
  - `ProcessingState`
  - `ToolResult<T>` (제네릭 결과 타입)
  - `ToolError` (에러 코드 enum)
- [ ] `src/types/index.ts` barrel export
- [ ] 기존 import 경로 갱신
- [ ] `tsc --noEmit`으로 검증

**산출물:** 타입 재배치만, 동작 변경 없음

---

## Phase 2: 에러 메시지 일관화 (약 45분)

**목적:** i18n 도입 전 에러 메시지를 한곳에 집중. 현재 각 페이지가 `err.message.includes("memory")` 같은 검사를 반복하고 있음.

- [ ] `src/lib/errors.ts` 생성
  - `ToolErrorCode` enum (MEMORY, INVALID_FILE, PROCESSING_FAILED 등)
  - `getErrorMessage(err: unknown): { code, message }` 함수
  - 메시지는 한국어 키-값 맵 (나중에 i18n으로 이전 용이)
- [ ] 10개 툴 페이지의 catch 블록을 `getErrorMessage()` 호출로 교체

**산출물:** 중복된 에러 변환 로직 제거

---

## Phase 3: `useToolProcessor` 훅 추출 (약 1.5~2시간) ★ 핵심

**목적:** 가장 큰 임팩트. 10개 페이지가 반복하는 `files / status / progress / errorMessage / resultRef` 패턴을 훅 하나로.

- [ ] `src/hooks/useToolProcessor.ts` 생성

  ```typescript
  useToolProcessor<TResult>({
    processor: (files, onProgress) => Promise<TResult>,
    onDownload: (result) => void,
  })
  → { files, setFiles, status, progress, errorMessage,
       run, retry, download }
  ```

- [ ] **검증 우선 순서:** `pdf-merge` → `image-compress` → 나머지 8개
  (단순한 것부터 하나씩 마이그레이션, 각 페이지 동작 확인 후 다음으로)
- [ ] 각 페이지 50~60줄 → 30줄 내외로 축소

**산출물:** 페이지 코드 40~50% 감소, 로직 추가 시 한 곳만 수정

---

## Phase 4: `constants.ts` 확장 (약 30분)

**목적:** 이후 SEO·OG 작업을 위한 스키마 준비.

- [ ] `ToolInfo` 인터페이스 확장
  - `seoDescription?: string` (검색 엔진용, 기존 `description`과 분리)
  - `keywords?: string[]`
  - `ogImage?: string` (경로만 예약)
- [ ] 값은 빈 배열/undefined로 두고, SEO 단계에서 채움

**산출물:** 메타데이터 스키마 준비 완료

---

## Phase 5: 빌드·정리 (약 30분)

- [ ] `next.config.ts` 확인 (pdfjs-dist webpack 경고 등)
- [ ] `pnpm build` 성공 확인
- [ ] 각 툴 수동 스모크 테스트 (파일 1개씩 처리)
- [ ] 커밋 단위로 분리해 히스토리 정리

---

## 실행 순서 요약

| Phase | 작업 | 예상 시간 | 리스크 |
|-------|------|----------|--------|
| 1 | 타입 중앙화 | 30분 | 낮음 |
| 2 | 에러 메시지 | 45분 | 낮음 |
| 3 | **훅 추출** ★ | 1.5~2시간 | 중간 (10개 파일 영향) |
| 4 | constants 확장 | 30분 | 낮음 |
| 5 | 빌드·검증 | 30분 | - |

**총 예상:** 약 4~4.5시간

---

## 주의사항

- **Next.js 16**은 일반적인 Next.js와 다름 (`AGENTS.md` 지시). 작업 전 `node_modules/next/dist/docs/`의 Metadata API, App Router 문서 확인 필요.
- Phase 3는 한 번에 다 하지 말고, `pdf-merge` 하나 먼저 완성해 훅 시그니처를 검증한 뒤 나머지로 확장.
- 각 Phase는 독립 커밋으로 유지해 롤백 가능하게.

---

## 이후 연계 작업 (본 계획 범위 외)

1. 다크모드 + 다국어(i18n) 설정
2. 프론트엔드 리디자인
3. SEO 검색 최적화
4. OpenGraph 메타데이터 + OG Image
