# ppt-background 폴리싱 — 레이아웃 개편 + 재사용 폴리싱 기준 수립

- **Date:** 2026-07-04
- **Branch:** `chore/polish-ppt-background`
- **Scope:** 도구별 폴리싱 1번 타자. ppt-background 워크스페이스 레이아웃 전면 개편 + 정본 결과카드 이관 + 로직/견고성 점검. 동시에 후속 12개 도구가 따를 **재사용 폴리싱 기준**을 확정.
- **Mockup(작업용):** `docs/design-preview-ppt-background.html` (v5 — 확정 기준. 랜딩 후 정리하여 `docs/design-preview.html`에 설계 기록으로 접어 넣고 이 파일은 삭제.)
- **References:** 루트 `DESIGN.md`, `docs/brand.html`, `src/app/globals.css` @theme, 메모리 `common-component-unification`·`result-pop-card-only`·`ontab_conventions`·`ontab_copy_conventions`·`design-brand-sync`·`ontab_tools_extensibility`·`ontab-polishing-phase`·`user_context`.

---

## 1. 배경 / 동기

ppt-background는 가장 오래된 도구(PR #3)라 이후 깔린 정본(공통 결과카드 #41, SEO #42, 바운더리 #43, 로딩 안정화 #44) 대부분을 놓쳤고, 교회 주간 사용 빈도가 최상위(슬라이드 배경)다. 그래서 첫 폴리싱 대상이며, **여기서 정한 폴리싱 차원·수용 기준이 이후 모든 도구의 기준**이 된다. 매 결정마다 "이게 다음 12개 도구에 그대로 적용 가능한가"를 만족해야 한다.

기존 UI의 문제:
- 결과 뷰 비정본 — `ProcessingStatus.done`이 자체 result-pop 마크업을 렌더(공통 `ResultCard`/`ResultActions` 미사용).
- 좌우 2패널(좌: 적용범위+슬라이드 썸네일 스트립 / 우: 배경 선택기)이 현재 사용 흐름과 어긋남.
- 헤더 오른쪽 되돌리기(reset) 버튼 — 단일 파일 도구엔 불필요(다시 업로드로 대체).
- 상단 스트립에 파일 크기 미표시(파일명·슬라이드수만).

## 2. 목표 (이번 PR)

1. ppt-background 워크스페이스를 §4 레이아웃으로 개편.
2. done 상태를 공통 `ResultCard` + `ResultActions` 정본으로 이관(`PptBackgroundResult` 신설).
3. 신규 로직: PPT 슬라이드 비율 감지(16:9/4:3), 현재 배경 종류별 dedup 그룹화, 체크박스 ↔ '선택' 범위 양방향 바인딩.
4. 헤더 reset 버튼 제거, 상단 스트립에 `파일명 · 크기 · 슬라이드수` 순서 확정.
5. §7 **재사용 폴리싱 기준**을 `docs/agents/tool-polishing-checklist.md`로 고정(후속 도구 검수용) + 메모리 반영.

## 3. Non-goals (별도 PR/세션)

- 다른 12개 도구에 개편/기준 적용 — 각자 폴리싱 PR에서 점진 흡수. **이번 PR은 ppt-background에만**(단, 공통 컴포넌트를 손대면 그 출처에서 고쳐 전 도구 자동 반영 — §6 참조).
- `.ppt → .pptx` 자동 변환(현행 안내 가이드 유지).
- 갤러리 실제 에셋 재큐레이션 / Supabase 연동 / 사용자 업로드. (카테고리 **구조**만 이번에 정비 — §5.4, 에셋 확충은 백로그.)
- `changeBackground` XML 변환 로직 자체(모드 매핑은 그대로 재사용 — §5.2).

## 4. 레이아웃 설계 (v5 확정)

트레이(≈ `--tweak-workspace-width` × `--tray-h`) 안에서:

### 4.1 상단 스트립 (`ToolTopStrip`, 전 도구 공통·불가침)
```
[ 파일명 · 크기 · 슬라이드수  [다시 업로드] ] ················· [ 변경하기 ]
```
- 좌: `filesSummary` = 파일명, `meta` = `· {size} · {n} 슬라이드` (크기 추가가 이번 변경점). 순서 = **파일명 → 크기 → 슬라이드수**.
- 우: 실행 버튼 `변경하기`(= 정본 execute, `onExecute`는 idle에서만 전달 → done/processing 시 자동 숨김). **위치·규격 전 도구 통일, 이 도구도 예외 없음.**

### 4.2 본문 — 2패널 (좌 갤러리 / 1px divider / 우 미리보기+범위)

**LEFT — 갤러리(새 배경 선택)**
- 상단 헤더 행: 좌측 **카테고리 탭**(`그라디언트 · 자연 · 사물`) + 우측 **업로드 버튼(텍스트만, 아이콘 없음)**.
- 본문: 갤러리 그리드(3열, 스크롤). 업로드 버튼 클릭 → 파일 선택. (기존 업로드/갤러리 탭 토글 폐기.)

**RIGHT — 미리보기 + 적용 범위**
- 상단: **선택한 배경 · 현재 배경** 미리보기를 **가로로 나란히**, 각 컬럼이 패널 폭을 반씩 나눠 **최대 크기**(고정폭 아님).
  - 두 프레임 모두 **PPT 비율(16:9/4:3) 반영**, **상단 정렬**(위로 붙고 4:3은 아래로 늘어남 — 세로 예약·중앙정렬 아님).
  - 각 프레임 **호버 → 돋보기 버튼**(우상단) → 클릭 시 **오른쪽 패널을 채우는 확대(라이트박스)**, X로 닫기. 아이콘은 brand 규격(24 그리드·stroke 1.0·currentColor·round cap/join, 원+손잡이).
  - **현재 배경** 프레임 오버레이: 좌상단 **체크박스**, 좌하단 **‹ › 페이지 화살표**, 우하단 **`슬라이드 {n}장`**. dedup된 배경 종류만큼 페이지네이션(예: 20장·3배경 → 3페이지).
  - **선택한 배경** 프레임: 갤러리/업로드로 고른 새 배경. 미선택 시 플레이스홀더.
  - 상단 캡션(`선택한 배경` / `현재 배경 · {k}종`) — 나란히 놓여 구분이 필요하므로 최소 캡션 유지.
- 하단(맨 아래): **적용 범위** — 라벨 + 동적 영역 한 행, 그 아래 세그먼트 `전체 / 마스터 / 선택`.
  - `전체` → 빈 힌트. `마스터` → 안내 문구. `선택` → 라벨 오른쪽 **텍스트 입력**(예: `1, 3, 5-8`, `PageRangeSelector` 텍스트 파싱 재사용).

### 4.3 상태별 우패널
- **idle**: 미리보기 2개 + 적용 범위.
- **processing**: `ProcessingStatus`(진행률 바)로 우패널 채움.
- **error**: `ProcessingStatus`(오류 + 재시도).
- **done**: `PptBackgroundResult`(정본 `ResultCard`)로 우패널 채움. **좌 갤러리는 유지.** 스트립 `변경하기`는 자동 숨김.

## 5. 로직 변경

### 5.1 슬라이드 비율 감지 (신규)
`ppt/presentation.xml`의 `<p:sldSz cx cy/>`(EMU)에서 종횡비 산출 → `"16:9" | "4:3" | {number}`. 미리보기 프레임 `aspect-ratio`에 반영. 16:9(12192000×6858000)·4:3(9144000×6858000) 외 값은 실제 cx/cy 비율로. `extractCurrentBackgrounds` 또는 소형 헬퍼 `getSlideAspect(file)`에서 함께 반환.

### 5.2 현재 배경 dedup 그룹화 (신규)
`extractCurrentBackgrounds`는 현재 슬라이드별 `SlideBackground[]`를 반환. 이를 **배경 동일성 키**로 그룹화:
- 키 = 해석된 이미지 파트 경로(같은 rel target = 같은 이미지) + `source`. `source==="none"`은 단일 그룹.
- 필요 시 이미지 바이트 해시로 폴백(다른 파트가 동일 바이트인 경우).
- 각 그룹은 `{ key, thumbnailBlob, source, slideIndexes:number[], previewUrl }`. `slideIndexes`가 체크박스 → 범위 바인딩의 소스.
- **주의**: object URL 수명 — 그룹 프리뷰 URL은 파일 변경/언마운트 시 revoke(현행 정리 패턴 유지·확장).

### 5.3 체크박스 ↔ '선택' 범위 양방향 바인딩 (신규)
- 현재 배경 그룹 체크 → 적용 범위 `선택`으로 전환 + 그 그룹의 `slideIndexes`를 범위 문자열로 union하여 입력에 채움(여러 그룹 체크 시 누적).
- 범위 텍스트를 **수동 편집** → 모든 체크 자동 해제(텍스트가 진실의 원천).
- `선택` 외 모드로 전환 → 체크 초기화.

### 5.4 적용 범위 → `changeBackground` 매핑 (기존 재사용)
`BgMode` 그대로: `전체`→`all-slides`, `마스터`→`master`, `선택`→`specific-slides` + `targetSlides`(범위 파싱 결과). **`changeBackground` 변환 로직 무변경.**

### 5.5 갤러리 카테고리 구조 정비
`GalleryCategory`를 `gradient | nature | object`로(그라디언트/자연/사물). 기존 `texture`·`pattern` 항목은 `object`로 재버킷(또는 정리). i18n `categoryByKey`·탭 라벨 갱신. **실제 에셋 확충은 백로그**(현행 mock/picsum 유지, 매핑만).

## 6. 컴포넌트 변경

- **`PptBackgroundTool.tsx`** — 상태머신/레이아웃 재작성. 헤더 reset 버튼 제거. 스트립 `meta`에 크기 추가. 우패널 idle/processing/error/done 분기.
- **`BackgroundPicker.tsx`** — 갤러리 전용으로 재편(카테고리 탭 + 업로드 버튼 + 그리드). 미리보기/actionSlot 책임 분리.
- **`PptBackgroundResult.tsx`** (신규) — `ResultCard`(title=`완료`) + `ResultActions`(download `다운로드` + again `다시 하기`). body는 간단한 요약(적용 범위/슬라이드 수) 또는 생략. `.result-pop`은 카드에만([[result-pop-card-only]]).
- **현재 배경 미리보기** — 신규 프레젠테이션 컴포넌트(dedup 그룹 페이지네이션 + 오버레이). 기존 `SlideThumbStrip`(전 슬라이드 나열) 대체/폐기.
- **라이트박스** — 우패널 스코프 오버레이(공통화 여지 있으나 이번엔 이 도구 로컬, 후속에서 공통 추출 검토).
- **공통 컴포넌트 손댈 경우**([[common-component-unification]]): `ToolTopStrip`가 `파일명·크기·카운트`를 구조적으로 받도록 개선하면 전 도구 영향 → 이번엔 **문자열 조합(caller)** 유지로 최소 변경, 구조화는 후속 공통 PR로 뺀다.

## 7. 재사용 폴리싱 기준 (산출물 — `docs/agents/tool-polishing-checklist.md`)

이번에 확정하는, 후속 도구가 그대로 따르는 체크리스트:

**A. 로직·정확성** — 상태머신·엣지케이스·레이스, object URL 등 리소스 수명(생성처=정리처 대응), 실패/손상 출력 가드.
**B. 디자인 정합** — `DESIGN.md` 토큰 계약 + `docs/brand.html`(로고·아이콘·모션) + globals.css @theme. 아이콘은 brand 라인 세트 규격.
**C. UI 안정성 계약** — 인터랙션(모드 전환·체크·페이지·상태 전환) 후 다른 요소의 위치·크기 불변. 나타나는 요소는 **자리 예약**(예: 체크박스 visibility, 비율은 큰 쪽 기준 예약 또는 상단 정렬 성장).
**D. 카피·i18n** — 카피=i18n 단일원([[ontab_copy_conventions]]). 실행=도구별 동사(`변경하기`)·리셋=`도구 초기화`·재업로드=`다시 업로드`/`Re-upload`·done again=`다시 하기`. EN 로케일 누수 0.
**E. 공통 규격 준수** — 실행 버튼=스트립 우측 고정. 파일 메타=`파일명 · 크기 · 카운트`(단일 파일 크기, PPT=슬라이드수/PDF=페이지수, 다중=파일 개수). done=공통 `ResultCard`/`ResultActions`. 단일 파일 도구는 헤더 reset 버튼 없음.

각 도구 완료 시: 작업용 `design-preview-<tool>.html`을 정리해 `docs/design-preview.html`에 **설계 기록**(의도 포함)으로 접어 넣고 작업 파일 삭제.

## 8. i18n 변경

- `fileStatus`에 크기 표시용은 기존 `formatBytes` 조합(신규 키 불필요) — 스트립 meta 템플릿 확인.
- `mode` 라벨: `전체 / 마스터 / 선택`(기존 optionAll/optionMaster/optionSpecific 문구 조정). 선택 입력 placeholder 재사용.
- `gallery.categoryByKey`: `gradient/nature/object`로 키·문구 갱신(그라디언트/자연/사물, EN: Gradient/Nature/Object).
- `processing`: done→`ResultCard` 이관에 맞춰 `done`/`download`/`tryAnother` 매핑 유지.
- ko/en 동시 갱신.

## 9. 검증 계획

- 순수 로직(비율 감지·dedup 그룹화·범위 파싱/바인딩)은 **subagent TDD**(RED-GREEN-REFACTOR).
- `tsc` + `build` + ESLint(core-web-vitals) + `pnpm design:check`(있으면 `design:drift`).
- 사용자 시각 검증: dev 서버는 사용자가 기동, 스크린샷 요청(/browse 금지). 실제 .pptx(16:9 및 4:3, 다중 배경)로 dedup·비율·라이트박스·바인딩 확인.
- `/review` → `/ship`(shipping gate).

## 10. 미해결 / 후속(백로그)

- 갤러리 실제 에셋 재큐레이션(사물 카테고리 사진 소스), Supabase 연동.
- 라이트박스 공통 컴포넌트 추출(후속 도구 공유 시).
- `ToolTopStrip` 파일 메타 구조화(문자열 조합 → props) — 전 도구 공통 PR.
- 미리보기 캡션 유무·현재 배경 화살표 위치는 시각 검증에서 최종 조정.

## 11. 리스크

- dedup 키 정확성 — layout/master 상속 배경의 동일성 판정이 어긋나면 그룹/카운트 오류. 실제 덱으로 검증 필수.
- 4:3 프레임 세로 성장이 `--tray-h` 안에서 적용 범위를 밀어내지 않도록 우패널 세로 예산 확인(§4.2 상단 정렬 + 하단 `margin-top:auto`).
- object URL 누수 — 그룹 프리뷰/라이트박스 URL 정리 경로 누락 주의.
