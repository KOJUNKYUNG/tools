# `docs/_archive/`

이 디렉토리는 **이전에 유효했지만 현재는 대체된 문서**를 보존한다. 결정 이력 보존이 목적 — "왜 이렇게 안 갔는지" 를 다시 따져볼 때 ADR 과 함께 참조.

여기 들어온 파일은 **새 작업의 기준으로 삼지 말 것.** 현재 진실은:

- `CONTEXT.md` (제품 정체성·도메인 용어·아키텍처·Phase 정의·로드맵 — 진입점)
- `docs/design.md` (디자인 구현 contract)
- `docs/adr/` (결정 이력)
- auto-memory (Phase 진행률·교훈·백로그)

어떤 정보가 어디 사는지는 [`CONTEXT.md` → Document map](../../CONTEXT.md#document-map) 참조.

## 보관 목록

- `refactoring-plan.md` (2026-04 작성, Phase 0 머지로 완료) — 당시 기획·기능 1차 정비 + Ontab 리디자인 1차 계획. silver 전환 전 우드톤·`next-intl`·3축 네비 가정으로 작성됨.
- `PRD_Z.md` (2026-04~05, 2026-06 보관) — 현재 구현 스냅샷 + 로드맵 PRD. 제품 정의·Non-goals·로드맵은 `CONTEXT.md` 로 흡수됨. 기술스택·기능표는 `package.json`·도구 레지스트리·코드가 현재 진실.
- `IMPROVEMENTS.md` (도구별 개선 TODO) — Phase 1 마이그레이션 시 도구별 ticket source 로 흡수 완료.
- `replan-2026-05-13.md` (`/office-hours` 리플랜 design doc) — silver 전환 결정 시점 박제물. 결과는 ADR-0001/0002 + `CONTEXT.md` 에 반영됨.
