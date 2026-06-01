# Ontab Phase 2 — PDF 잠금/암호화 (pdf-lock)

**Status:** Plan locked via /plan-eng-review (2026-06-01)
**Branch:** `feat/ontab-phase-2-pdf-lock`
**Phase gate:** Step 1의 5/5번째(마지막) 도구. 머지 시 Step 0 하드 계약 충족 → Phase 3(SEO·수익화) 게이트 통과.

## 목표

100% 브라우저·0서버로 PDF에 **열기 암호 + 권한 암호**를 걸고(잠금), **암호를 아는 사용자가 해제**(unlock)할 수 있는 도구. 비전문가 1급 사용자(교회 PPT 주간 작업) 대상, ko/en i18n.

## 의존성 (vetting 완료 — 설치 승인됨)

`@neslinesli93/qpdf-wasm@0.3.0` (ISC, 무의존, wasm 1.3MB).
- vetting: 주간 6,253 DL(후보 1위), MODULARIZE 팩토리 → top-level 사이드이펙트 없음.
- 기능 스모크 5/5 통과: AES-256 암호화 → `/Encrypt` dict 생성 → 무암호 열기 거부 → 정답 복호화.
- 라이선스: 래퍼 ISC, qpdf 본체 Apache-2.0 → NOTICE 고지 의무(Phase 3 공개 시 반영).
- 통합 패턴(검증됨):
  ```
  createModule({ locateFile: () => "/qpdf/qpdf.wasm", noInitialRun: true, printErr })
  → FS.writeFile("/input.pdf", uint8)
  → callMain(["--encrypt", userPw, ownerPw, "256", "--print=none"..., "--", "/input.pdf", "/output.pdf"])
  → FS.readFile("/output.pdf")
  → FS.unlink(...)
  ```
- 주의: 번들 `qpdf.d.ts`에 `FS.writeFile` 타입 누락(런타임 존재) → 타입 보강 필요. `--accessibility=n`은 modern 암호화에서 무시됨(경고).

## 잠긴 결정 (plan-eng-review)

| # | 결정 | 선택 |
|---|---|---|
| D1 | 범위 | **잠금 + 해제(unlock) 둘 다** 한 PR. pdf-watermark식 2-모드 토글. |
| 1 | wasm 통합 | **self-host**(copy-pdfjs.mjs 확장 → public/qpdf/) + lazy import + next.config webpack/Turbopack 이중 설정. `next build` 검증 필수. |
| 2 | unlock 오답 에러 | **WRONG_PASSWORD sentinel 신설**(errors.ts, CORRUPT_OUTPUT과 동일 패턴) → `wrongPasswordHint` i18n. |
| 3 | wasm 인스턴스 | **매 run 새 인스턴스 + 즉시 FS unlink**(상태 블리딩 0, 보안 우선). |
| 4 | owner 권한 | **2토글**(인쇄 허용 / 복사·추출 허용). 나머지(modify/annotate/form/assemble) 기본 금지. |
| 5 | 모드 구조 | **단일 PdfLock 컴포넌트 + lock/unlock 모드 토글**. lib는 qpdfCrypto.ts encrypt/decrypt 공통 런너. |
| 6 | 인자 빌드 | **buildEncryptArgs/buildDecryptArgs 순수 모듈 분리** → vitest 전수. |
| 7 | PW 확인 가드 | **validateLockForm 순수함수**(빈값·불일치·최소길이) → vitest. 컴포넌트는 호출만. |

### owner password 자동 설정 (구현 노트)
qpdf `--encrypt`는 user/owner 둘 다 위치 인자로 요구. 사용자가 열기 암호만 입력해도 내부에서 owner를 user와 동일하게 자동 설정(또는 권한 제어용으로 user와 분리). buildEncryptArgs가 이 규칙을 캡슐화하고 테스트.

## 데이터 흐름

```
[FileUpload] PDF (maxSize=user 50MB)
   │
   ├── mode=lock ──→ [validateLockForm] ──(ok)──→ [buildEncryptArgs] ──→ [qpdfCrypto.encryptPdf]
   │                      │ (불일치/빈값)              (권한 토글→플래그)        │
   │                      ↓                                                   ↓
   │                   toast(i18n)                              [출력 가드: %PDF + /Encrypt]
   │                                                                          │ (실패→CORRUPT_OUTPUT)
   │                                                                          ↓
   │                                                              deriveLockedName(-locked)
   │                                                                          ↓
   └── mode=unlock ─→ [buildDecryptArgs] ──→ [qpdfCrypto.decryptPdf] ──→ [downloadBlob]
                          (password)            │ (오답→WRONG_PASSWORD throw)
                                                ↓
                                       getErrorMessage(wrongPasswordHint)
```

## 파일 변경 (≈22)

### 신규 — 순수 로직 (vitest TDD)
- `src/lib/pdf/qpdfArgs.ts` + `.test.ts` — buildEncryptArgs/buildDecryptArgs. 권한×암호 조합 전수.
- `src/lib/pdf/pdfLockNaming.ts` + `.test.ts` — deriveLockedName(lock→`-locked`, unlock→`-unlocked`, 빈값→`output-*`).
- `src/lib/pdf/lockFormValidation.ts` + `.test.ts` — validateLockForm(빈값·불일치·최소길이).

### 신규 — wasm 경계 (/qa)
- `src/lib/pdf/qpdf.ts` — pdfjs.ts식 lazy loader. `QPDF_WASM_URL = "/qpdf/qpdf.wasm"`, createModule 캐시 안 함.
- `src/lib/pdf/qpdfCrypto.ts` — encryptPdf/decryptPdf 공통 런너(로더·FS write/read/unlink·출력 가드 공유). 타입 보강(FS.writeFile).

### 신규 — UI
- `src/components/tools/pdf-lock/PdfLock.tsx` — PdfWatermark 셸 복제(52vh 2열, reset, reupload 가드). lock/unlock 모드 토글.
- `src/components/tools/pdf-lock/PdfLockModeToggle.tsx`
- `src/components/tools/pdf-lock/LockControls.tsx` — PW show/hide·확인 재입력·권한 2토글.
- `src/components/tools/pdf-lock/UnlockControls.tsx` — PW show/hide.
- `src/components/tools/pdf-lock/labels.ts` — getPdfLockLabels(dict).
- `src/app/[lang]/(chrome)/tools/pdf-lock/page.tsx`

### 수정
- `src/lib/constants.ts` — TOOLS에 pdf-lock 등록(category "pdf", icon Lock).
- `src/components/landing/Screen3Workspace.tsx` — **renderToolBody() switch에 `case "pdf-lock"` 추가** (pitfall 9/10, 누락 시 레거시 Link fallback).
- `src/lib/errors.ts` — WRONG_PASSWORD sentinel 분기 + wrongPasswordHint 옵션.
- `src/hooks/useToolProcessor.ts` 또는 GetErrorMessageOptions — wrongPasswordHint 추가(errors.ts).
- `scripts/copy-pdfjs.mjs` (또는 신규 copy-qpdf.mjs) — qpdf.wasm → public/qpdf/ 복사. postinstall.
- `next.config.ts` — webpack fallback(fs/path/process: false) + Turbopack 대응.
- `src/i18n/dictionaries/ko.json`, `en.json` — tools.pdf-lock.{title,description,page.*}.

## 테스트 커버리지

```
순수 로직 (vitest, 목표 100%):
  qpdfArgs:        기본전권한금지 / 인쇄허용 / 복사허용 / owner빈값자동 / 2토글매트릭스(4) / decrypt순서
  pdfLockNaming:   lock / unlock / 빈값
  lockFormValidation: 빈값 / 불일치 / 최소길이 / 정상
  errors:          WRONG_PASSWORD→hint (회귀: CORRUPT_OUTPUT 분기 보존)

wasm·UI (/qa, 에이전트 browse 차단):
  encryptPdf 출력 /Encrypt+%PDF 가드 / decrypt 정답 / decrypt 오답→WRONG_PASSWORD
  FS unlink 정리 / 모드토글 / PW 불일치 toast / EN 로케일 토스트 i18n
```

## 검증 (사용자 시각 /qa)
tests/fixtures 악보 PDF(20260419_청소년부예배찬양.pdf 등)로:
1. 잠금 → 다른 뷰어/브라우저에서 암호 요구 확인 + 권한 제한(인쇄/복사) 확인 + 정답 암호로 정상 열림.
2. 해제 → 잠긴 PDF에 정답 암호로 해제 후 무암호 열림. 오답 시 WRONG_PASSWORD 토스트(ko/en).
3. `next build` 성공(Turbopack/webpack wasm 정적해석 무오류).

## NOT in scope
- **unlock 슬러그 분리** — 단일 pdf-lock 슬러그 내 모드 토글로 통합(별도 라우트 없음). 이유: DRY, 단일 도구 카드.
- **암호화 강도 선택(RC4/128)** — AES-256 고정. 이유: 비전문가에게 강도 선택지 숨김.
- **6개 세분 권한 전체 노출** — 2토글로 압축. 이유: 비전문가 UX.
- **wasm 인스턴스 캐싱** — 의도적 미적용. 이유: 비밀번호 도구 상태 블리딩 방지.
- **미리보기** — 잠긴 PDF 미리보기 의미 약함. 입력 폼 중심 UI.
- **후속 "PDF 보안 묶음" 확장** — qpdf-wasm은 압축/회전 등 더 제공하나 이번 PR 외.

## What already exists (재사용)
FileUpload, FILE_SIZE_LIMIT, useToolProcessor, getErrorMessage(+CORRUPT_OUTPUT sentinel), ProcessingStatus, downloadBlob, template, formatBytes, PdfWatermark 셸 패턴(52vh 2열·reset·reupload 가드·모드 토글), pdfjs.ts self-host 로더 패턴, copy-pdfjs.mjs postinstall 패턴. 로컬 복사 금지 — 전부 재사용.

## 함정 (이전 도구 교훈)
1. **Screen3 switch case 필수**(learnings 9/10) — constants.ts 등록만으론 부족.
2. **EN 로케일 워커 한국어 메시지 노출 방지** — WRONG_PASSWORD/CORRUPT 선검증 i18n 토스트.
3. **52vh show/hide 높이 변동** — 모드 전환 시 요소 자리 고정(dim/disabled).
4. **Turbopack ≠ webpack** — next.config 이중 설정, build 검증.

## 구현 순서 (vertical slice)
1. qpdf self-host (copy script + next.config + qpdf.ts loader) → `next build` 그린.
2. 순수 로직 TDD: qpdfArgs → pdfLockNaming → lockFormValidation → errors(WRONG_PASSWORD).
3. qpdfCrypto.ts (encrypt/decrypt + 출력 가드).
4. UI: PdfLock 셸 + 모드 토글 + 컨트롤 + labels + i18n.
5. constants.ts + Screen3 case.
6. tsc + build + vitest 그린 → 사용자 /qa.

## Parallelization
Sequential implementation, no parallelization opportunity. (모든 단계가 src/lib/pdf + 단일 컴포넌트 디렉터리 공유, 1번이 빌드 기반.)

## Implementation Tasks
Synthesized from this review's findings. Each derives from a locked decision above.

- [ ] **T1 (P1, CC: ~15min)** — qpdf self-host — wasm 통합 + 빌드 그린
  - Surfaced by: Architecture #1 — Turbopack ≠ webpack 정적해석 리스크
  - Files: scripts/copy-qpdf.mjs, next.config.ts, src/lib/pdf/qpdf.ts, public/qpdf/
  - Verify: `pnpm build` 성공 + wasm 200(404 아님)
- [ ] **T2 (P1, CC: ~15min)** — qpdfArgs — buildEncrypt/DecryptArgs 순수 모듈 + vitest
  - Surfaced by: Code Quality #6 — 권한 매핑 버그 단위테스트 불가 방지
  - Files: src/lib/pdf/qpdfArgs.ts(+.test)
  - Verify: `pnpm test qpdfArgs` — owner빈값자동·2토글매트릭스 그린
- [ ] **T3 (P1, CC: ~10min)** — errors — WRONG_PASSWORD sentinel + CORRUPT_OUTPUT 회귀
  - Surfaced by: Architecture #2, Test review 회귀
  - Files: src/lib/errors.ts(+.test)
  - Verify: `pnpm test errors` — 두 분기 공존
- [ ] **T4 (P1, CC: ~10min)** — lockFormValidation + pdfLockNaming 순수 + vitest
  - Surfaced by: Test #7, naming
  - Files: src/lib/pdf/lockFormValidation.ts, pdfLockNaming.ts(+.test)
  - Verify: `pnpm test` 그린
- [ ] **T5 (P1, CC: ~15min)** — qpdfCrypto — encrypt/decrypt 런너 + 출력 가드 + FS unlink
  - Surfaced by: Architecture #3 (매 run 새 인스턴스), 출력 가드
  - Files: src/lib/pdf/qpdfCrypto.ts
  - Verify: 사용자 /qa
- [ ] **T6 (P1, CC: ~20min)** — PdfLock UI — 단일 컴포넌트 + 모드 토글 + 2토글 권한 + i18n
  - Surfaced by: Code Quality #5, Architecture #4
  - Files: src/components/tools/pdf-lock/*, src/app/[lang]/(chrome)/tools/pdf-lock/page.tsx, i18n dicts
  - Verify: 사용자 /qa (ko/en)
- [ ] **T7 (P1, CC: ~5min)** — 레지스트리 + Screen3 case (pitfall 9/10)
  - Surfaced by: Prior learning — ontab-new-tool-needs-screen3-inline-mapping
  - Files: src/lib/constants.ts, src/components/landing/Screen3Workspace.tsx
  - Verify: 데스크 카드에서 인라인 렌더(Link fallback 아님)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 7 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement. 7 decisions locked (D1 + Arch 1-4 + CQ 5-6 + Test 7). Outside voice skipped (5th homologous tool, core wasm risk smoke-verified). Design review optional — UI clones proven PdfWatermark shell; can run /qa during impl instead.
