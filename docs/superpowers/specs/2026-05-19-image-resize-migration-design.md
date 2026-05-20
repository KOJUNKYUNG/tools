# image-resize Phase 1 마이그레이션 — Design

**Date**: 2026-05-19
**Tool**: `/image-resize`
**Phase**: Ontab Phase 1 (silver design migration, 두 번째 도구)
**Reference**: `ppt-background` (Phase 1 첫 도구, PR #3)

---

## 배경

`image-resize`는 현재 단일 파일(`page.tsx`, 335줄)에 inline 구현됨. 3-mode 탭(pixel / percent / preset)으로 분리된 UI라 사용자의 의도("크기를 바꾸고 싶다")와 모드 선택 사이에 불필요한 인지 부하가 있음. Phase 1 마이그레이션 기회를 활용해 UX 자체를 단일 화면 모델로 재설계.

부가로 `docs/IMPROVEMENTS.md`의 image-resize 관련 두 항목을 함께 흡수:
- 픽셀 모드에 해상도 프리셋 추가 (FHD/HD/모바일 등)
- 기존 픽셀 단위 프리셋 탭을 비율(종횡비) 선택으로 개편

---

## 핵심 결정

**모드 분리 폐기.** 3-mode 탭 대신 단일 화면. 너비/높이 입력 + 잠금 토글 + "왜곡 없이 자르기" 체크박스 하나가 동작을 결정.

| 체크박스 | 왼쪽 crop 영역 | 동작 |
|---|---|---|
| **OFF** | 비활성/숨김 | 입력 W×H로 원본을 강제 변형 (왜곡 허용 = stretch) |
| **ON** | 활성 | crop box 비율 = W:H. 사용자 드래그/리사이즈. apply 시 crop 영역을 W×H로 resample (왜곡 없음) |

체크박스 라벨은 **"왜곡 없이 자르기"** — 동작과 직관적으로 일치.

배율 (%) 모드 제거. 너비/높이 사이 **비율 잠금 토글**(🔒 아이콘 버튼)로 대체 — 한쪽 입력 시 비율 유지하며 반대편 자동 계산.

---

## UX 레이아웃

업로드 전: 가운데 정렬된 FileUpload + 안내.

업로드 후 (좌/우 2단, 모바일은 위/아래 stack):

```
┌─ Header (silver, tray/lid 메타포, ppt-background와 일관) ────┐
│  뱃지 / 제목(이미지 크기 변경) / 부제                          │
├───────────────────────────────────────────────────────────┤
│  [왼쪽]                  │  [오른쪽]                          │
│  파일 정보 + 다시 업로드   │  ① 적용 버튼 (Apply)                │
│                         │                                  │
│  ┌──────────────────┐   │  ② 너비 [W] 🔒 높이 [H]            │
│  │ 원본 이미지         │   │     [✓ 왜곡 없이 자르기]            │
│  │ + crop box (점선)  │   │                                  │
│  │ - 위치 드래그        │   │  ③ 크기 프리셋 │ 비율 프리셋        │
│  │ - 8방향 리사이즈     │   │     FHD       │   16:9          │
│  │ - 비율 고정          │   │     HD        │   1:1           │
│  │ (체크박스 OFF면      │   │     모바일     │   9:16, 3:4     │
│  │  단순 프리뷰)        │   │     ...        │   4:3           │
│  └──────────────────┘   │                                  │
└───────────────────────────────────────────────────────────┘

       적용 후 (적용 버튼 자리에 결과 카드)

  ┌─────────────────────────────────────────────┐
  │ 변경 완료: 1920×1080 (1.2MB, JPG)             │
  │ [⬇ 다운로드]   [🗜 압축/변환하러 가기]          │
  └─────────────────────────────────────────────┘
```

---

## 컴포넌트 구조

새로 `src/components/tools/image-resize/`:

| 파일 | 책임 |
|---|---|
| `ImageResizeTool.tsx` | 최상위 — state hub, `useToolProcessor` 호출, 좌/우 layout |
| `ImageResizePreview.tsx` | 왼쪽 — 이미지 + CropSelector (체크박스 ON 시) |
| `ImageResizeControls.tsx` | 오른쪽 — W/H input + 잠금 토글 + 체크박스 |
| `ImageResizePresets.tsx` | 크기 프리셋 / 비율 프리셋 두 그룹 |
| `ImageResizeResult.tsx` | 적용 후 결과 카드 (다운로드 + 핸드오프 버튼) |
| `labels.ts` | i18n 키 매핑 (ppt-background 패턴 동일) |

`src/app/[lang]/(chrome)/tools/image-resize/page.tsx`는 헤더 + `<ImageResizeTool />` mount만 남기고 본문 제거.

기존 `src/components/image/CropSelector.tsx`는 **resize handle 추가**해서 확장 (아래 §CropSelector 확장).

---

## State 모델

`ImageResizeTool` 내부:

```ts
file: File | null
imageUrl: string | null
origDims: { w: number; h: number } | null
targetW: string             // input value (string으로 빈 입력 허용)
targetH: string
lockAspect: boolean
cropEnabled: boolean        // "왜곡 없이 자르기"
cropRect: { x, y, w, h } | null   // crop UI 결과
```

파생 값 (memo):
- `targetRatio = Number(targetW) / Number(targetH)`
- `maxFitCrop(origDims, targetRatio)` — 비율 프리셋 / 체크박스 ON 전환 시 초기 crop 계산

---

## 핵심 로직

### 업로드 시
1. 파일 선택 → origDims 계산
2. `targetW = origDims.w`, `targetH = origDims.h` 자동 채움
3. `lockAspect = true`, `cropEnabled = false` 기본값
4. cropRect는 cropEnabled 토글 시점에 생성

### 비율 프리셋 클릭 (예: 16:9)
1. `lockAspect = true`로 강제
2. **max-fit 알고리즘**으로 W, H 재계산:
   ```
   ratio_target = targetW / targetH
   ratio_image  = origW / origH
   if ratio_target >= ratio_image:
       newW = origW
       newH = round(origW * targetH / targetW)
   else:
       newH = origH
       newW = round(origH * targetW / targetH)
   ```
   → "원본 안에 들어가는 가장 큰 16:9 사각형"
3. cropEnabled가 켜져 있으면 cropRect도 max-fit 위치(가운데 정렬)로 재설정

### 크기 프리셋 클릭 (예: FHD 1920×1080)
1. `targetW = 1920`, `targetH = 1080` set
2. lockAspect 상태 그대로 유지

### 잠금 토글 ON + W 또는 H 입력 변경
- 기존 W:H 비율 유지하며 반대편 자동 계산. 현재 pixel 모드 동작 그대로.

### 체크박스 ON 전환 (왜곡 없이 자르기)
- 현재 W:H 비율로 max-fit crop 자동 생성 + 가운데 정렬
- 사용자가 드래그/리사이즈로 미세 조정

### Apply
- `cropEnabled = false`:
  - `resizeImage({ mode: "pixel", width: targetW, height: targetH, lockAspectRatio: false })` — stretch
- `cropEnabled = true`:
  - `resizeImage({ mode: "preset", width: targetW, height: targetH, crop: cropRect })` — 기존 함수 시그니처 재활용
- 출력 형식은 **항상 원본 형식 유지**. image-resize는 형식 선택 UI를 두지 않음 — 사용자가 형식을 바꾸고 싶을 땐 결과 카드의 "압축/변환하러 가기" 버튼으로 image-compress에 위임

### 결과 카드
- `result.blob.size`, `result.blob.type` 표시
- [다운로드] 버튼: 기존 동작
- [압축/변환하러 가기] 버튼: 핸드오프 store에 `result.blob`을 `File`로 wrap → stage → `router.push("/[lang]/tools/image-compress")`

---

## CropSelector 확장

현재 `CropSelector.tsx`는 위치 드래그만 지원. 추가:

- **8방향 resize handle** (corner 4 + edge 4)
- **aspect-ratio-locked 리사이즈**: handle 잡고 끌면 반대 모서리 고정, 비율 유지하며 박스 크기 변경
- **boundary clamp**: 박스가 이미지 영역 밖으로 못 나감
- **Pointer events** 사용 (mouse + touch 통합)

리사이즈 계산 로직은 순수 함수로 분리:
```ts
aspectLockedResize(
  handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
  prevRect: { x, y, w, h },
  mousePos: { x, y },
  ratio: number,
  bounds: { w, h },          // 이미지 native 크기
): { x, y, w, h }
```

→ 단위 테스트 가능 (node env).

---

## 핸드오프 (도구 간 이미지 전달)

**module-scoped in-memory store** — 새 dep 없음, SPA 라우팅 살아 있음, 새로고침 시 잃음.

```ts
// src/lib/common/toolHandoff.ts
let staged: { files: File[]; source: string } | null = null;

export function stageFiles(files: File[], source: string) {
  staged = { files, source };
}

export function consumeStagedFiles(): { files: File[]; source: string } | null {
  const s = staged;
  staged = null;
  return s;
}
```

사용:
- image-resize 결과 카드 → `stageFiles([resizedFile], "image-resize")` → `router.push(...)`
- image-compress 페이지 mount 시 `useEffect`에서 `consumeStagedFiles()` 호출 → 있으면 자동 업로드

image-compress는 이 PR에서 **consume side만** 추가. silver 디자인 마이그레이션은 차기 PR.

**제약**: 새로고침/새 탭 진입 시 잃음. 정상 시나리오에서는 충분.

---

## 마이그레이션 스코프 (Phase 1 공통 작업)

- **silver 디자인 본문**: ppt-background와 동일한 헤더(뱃지 / 머티리얼 클래스 / 타이포)
- **Screen3 인라인 마운트**: 랜딩 `Screen3Workspace`에서 image-resize 미리보기를 인라인 컴포넌트로 mount. `inline` prop으로 헤더 숨김. 현재 Link 브릿지를 컴포넌트 mount로 교체.
- **i18n**: `tools.image-resize.page.*` 영문 키 추가 (`labels.ts` + 영어 dictionary)
- **공통 자산 흡수**:
  - `ProcessingStatus.onTryAnother` + 다국어 labels — 결과 카드에서 활용
  - `FileUpload.hideFileList` / `hideAutoHint` — 단일 이미지 업로드 UI 단순화
  - `template()` 헬퍼 — 파일명 포맷 등
- `RESIZE_PRESETS` 재정의:
  - 크기 프리셋: FHD (1920×1080), HD (1280×720), 모바일 (390×844), 정방형 (1080×1080)
  - 비율 프리셋: 1:1, 16:9, 9:16, 4:3, 3:4

---

## 테스트 전략

vitest + node 환경 (이미 설치됨). 순수 로직 위주 단위 테스트:

- `maxFitCrop(origDims, targetW, targetH)` — 경계 케이스 (가로 원본 + 세로 target, 같은 비율, 1:1, 극단 비율)
- `aspectLockedResize(handle, prevRect, mousePos, ratio, bounds)` — 8 handle 각각 + boundary clamp + ratio 보존
- `toolHandoff` stage/consume — set 후 consume 한 번만 가져가는지

TDD 스킬은 위 순수 함수 작성 시 자동 트리거됨 (superpowers test-driven-development).

**컴포넌트/통합 테스트는 이번 PR 범위 밖** — jsdom + RTL 미설치. 차기 인프라 PR에서 도입. 이번엔 `/qa` 또는 브라우저 수동 검증.

---

## Out of Scope / 후속

- **image-compress silver 마이그레이션**: 다음 Phase 1 PR. 이번엔 consume 로직만 추가.
- **"예상 파일 크기" pre-apply 표시**: 부정확하니 미구현. 결과 카드의 실제 크기로 충분.
- **압축 슬라이더 자체**: image-compress가 처리. image-resize에는 핸드오프 버튼만.
- ppt-background polish 백로그 추가 발견 시: `ontab_phase1_polish_backlog.md`로만 적고 이 PR에 안 섞음.

---

## 의존성 / 환경 변경

- **새 npm 패키지 없음**.
- 기존 사용 라이브러리만: `next/navigation` (router.push), `react`, `lucide-react`.
- vitest는 이미 PR #4로 설치됨.
