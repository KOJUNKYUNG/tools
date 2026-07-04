# 도구별 폴리싱 체크리스트

도구를 하나씩 다듬는 폴리싱 트랙의 **재사용 기준**. `ppt-background`(첫 타자, 2026-07-04)에서 확정했으며, 이후 모든 도구가 이 체크리스트로 검수한다. 각 도구 폴리싱 = 1 브랜치 = 1 PR.

정본 참조: 루트 `DESIGN.md`(토큰 계약) · `docs/brand.html`(로고·아이콘·모션) · `src/app/globals.css` @theme · `docs/design-preview.html`(결정된 요소 렌더 + 도구별 설계 기록). 관련 메모리: `common-component-unification`, `result-pop-card-only`, `ontab_conventions`, `ontab_copy_conventions`, `design-brand-sync`, `ontab_tools_extensibility`, `user_context`.

기준선: 첫 적용 사례는 `docs/superpowers/specs/2026-07-04-ppt-background-polish-design.md`.

---

## 5개 차원 체크리스트

각 도구 폴리싱 시 아래 A~E를 모두 통과해야 한다.

### A. 로직 · 정확성
- [ ] 상태머신(idle/processing/done/error) 전이가 정확하고, 각 상태의 UI가 올바르게 분기되는가.
- [ ] 엣지케이스: 빈 입력, 손상 파일, 0개 결과, 초대형 입력, 취소/재시도 레이스.
- [ ] 리소스 수명: object URL은 **생성처마다 정리처**가 대응(교체 전 revoke · 파일 해제 · 언마운트). 누수 0.
- [ ] 실패/손상 출력 가드(빈 blob·null 컨텍스트 등)와 오류 경로가 사용자에게 명확히 전달되는가.
- [ ] 순수 로직은 `src/lib`로 분리하고 Vitest로 TDD(RED→GREEN→REFACTOR).

### B. 디자인 정합
- [ ] 색·타이포·간격·컴포넌트가 `DESIGN.md` 토큰 계약 준수(`pnpm design:check` 통과).
- [ ] 아이콘은 brand 라인 세트 규격: **24 그리드 · stroke 1.0 · currentColor · round cap/join**(`docs/brand.html`).
- [ ] 모션은 `.result-pop`(결과 카드 한정) 등 정해진 토큰만. 프리뷰·썸네일·리스트엔 금지([[result-pop-card-only]]).
- [ ] 인라인 토큰 스타일(`style={{ color: "var(--…)" }}`)·`font-body`/`font-ko`/`font-mono` 등 주변 코드 관용을 따른다.

### C. UI 안정성 계약
- [ ] 어떤 인터랙션(모드 전환·체크·페이지 이동·상태 전환·업로드) 후에도 **다른 요소의 위치·크기가 흔들리지 않는다**.
- [ ] 조건부로 나타나는 요소는 **자리를 예약**한다(예: 체크박스 `visibility` 토글, 힌트 텍스트 `min-height`).
- [ ] 가변 종횡비 프레임은 큰 쪽(4:3) 기준으로 예약하거나 상단 정렬로 성장시켜, 비율 전환 시 하위 요소를 밀지 않는다.
- [ ] 워크스페이스 세로는 `--tray-h` 엔벌로프 준수(하드코딩 vh 금지).

### D. 카피 · i18n
- [ ] 모든 UI 카피는 **i18n 단일원**(`src/i18n/dictionaries`), constants·컴포넌트 하드코딩 금지([[ontab_copy_conventions]]).
- [ ] ko/en 동시 갱신, 구조 병렬 유지. **EN 로케일 누수 0**.
- [ ] 표준 라벨: 실행=도구별 동사(예 `변경하기`) · 리셋=`도구 초기화` · 재업로드=`다시 업로드`/`Re-upload` · 완료 후 재실행=`다시 하기`.

### E. 공통 규격 준수
- [ ] **실행 버튼**은 상단 스트립(`ToolTopStrip`) 오른쪽 고정. 위치·규격 전 도구 통일, 예외 없음.
- [ ] **파일 메타** 순서 = `파일명 · 크기 · 카운트`. 단일 파일이면 크기 표시(PPT=슬라이드수·PDF=페이지수), 다중이면 파일 개수.
- [ ] **완료 상태**는 공통 `ResultCard` + `ResultActions`(다운로드→핸드오프→다시 하기 순). 자체 결과 마크업 금지.
- [ ] **단일 파일 도구**는 헤더 오른쪽 되돌리기(reset) 버튼을 두지 않는다(다시 업로드로 대체).
- [ ] 공통 요소를 손봐야 하면 그 도구가 아니라 **공유 컴포넌트/토큰 출처에서** 고쳐 전 도구에 반영([[common-component-unification]]).

---

## 도구별 설계 기록 절차

논의·시안은 `docs/design-preview-<tool>.html`(자체 완결 작업 파일)에서 반복하고, 레이아웃이 확정되면:

1. 확정 구조 + **설계 의도**(왜 이렇게 배치했는지)를 정리해 `docs/design-preview.html`에 정적 섹션으로 접어 넣는다(`brand.html`이 의도를 담듯).
2. 작업용 `docs/design-preview-<tool>.html`은 삭제한다.
3. 디자인/브랜드 영향이 있으면 `DESIGN.md`·`docs/brand.html`도 같은 커밋에서 갱신([[design-brand-sync]]).

---

## 프로세스 (요약)

brainstorming(스코프+기준) → spec → writing-plans → subagent-driven TDD → `tsc`+`build`+`lint`+`design:check` → 사용자 시각 검증(dev는 사용자 기동, `/browse` 금지, 스크린샷 요청) → `/review` → `/ship`.

hard-stop(승인 후): `push`/`merge`/`rebase` · 의존성 추가·제거 · 파일 삭제 · `.env`/시크릿/배포 설정.
