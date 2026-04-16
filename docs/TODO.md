# TODO

## P0

- [ ] 프로젝트 초기 세팅 (Next.js App Router + Tailwind + Shadcn/UI)
  - Acceptance: 기본 레이아웃(헤더, 푸터, 반응형)과 랜딩 페이지에서 각 도구 카드 목록이 렌더링됨
  - Notes: Mock 데이터 없음. 정적 UI 구성만 해당

- [ ] 파일 업로드 공통 컴포넌트 구현 (react-dropzone)
  - Acceptance: 드래그 앤 드롭 및 클릭 업로드 동작, 파일 형식/크기 유효성 검사 및 오류 메시지 표시
  - Notes: 파일 크기 제한 로직은 Mock 상수값(비로그인 10MB / 로그인 50MB)으로 처리

- [ ] 이미지 → PDF 변환 기능 구현
  - Acceptance: JPG/PNG 다중 업로드 후 하나의 PDF로 다운로드 가능
  - Notes: `pdf-lib` 클라이언트 사이드 처리. 서버 불필요

- [ ] PDF → 이미지 변환 기능 구현
  - Acceptance: PDF 업로드 후 페이지별 이미지 추출, 출력 형식(JPG/PNG)·해상도(72/150/300 DPI) 선택 후 다운로드 가능
  - Notes: `pdfjs-dist` + Canvas API. Web Worker 설정 포함. 고해상도·대용량 파일은 메모리 경고 메시지 표시

- [ ] PDF 파일 합치기 기능 구현
  - Acceptance: 여러 PDF 업로드 후 순서 조정, 병합된 단일 PDF 다운로드 가능
  - Notes: `pdf-lib` 클라이언트 사이드 처리

- [ ] PPT 이미지 추출 기능 구현
  - Acceptance: PPTX 업로드 후 `ppt/media` 내 이미지 전체를 ZIP 파일로 다운로드 가능
  - Notes: `jszip` 클라이언트 사이드 처리. .ppt 형식 업로드 시 지원 불가 안내 메시지 표시

- [ ] PPT 배경 일괄 변경 기능 구현
  - Acceptance: PPTX 업로드 후 배경 이미지 선택(로컬 파일), 전체 슬라이드 일괄 적용 또는 마스터 슬라이드 적용 모드 선택 후 변경된 PPTX 다운로드 가능
  - Notes: `jszip`으로 XML 파싱 및 수정. `<p:bg>` 없는 슬라이드 및 마스터 상속 케이스 예외 처리 필수

- [ ] 처리 진행 상태 UI (Progress Bar + 오류 처리)
  - Acceptance: 파일 처리 중 Progress Bar 표시, 실패 시 오류 원인 메시지 및 재시도 버튼 노출, 브라우저 메모리 초과 시 파일 크기 축소 권고 메시지 표시
  - Notes: 클라이언트 사이드 상태 관리로 구현

- [ ] 배경 이미지 갤러리 UI 구현 (Mock 데이터 기반)
  - Acceptance: 카테고리·태그 필터링, 이미지 그리드 렌더링, 이미지 선택 시 PPT 배경 교체 도구와 즉시 연동 동작
  - Notes: Supabase 없이 Mock 이미지 배열로 구현. LocalStorage에 최근 선택 이미지 저장

---

## P1

- [ ] Clerk 인증 연동
  - Acceptance: 회원가입/로그인/로그아웃 동작, 로그인 상태에 따라 파일 크기 제한 차등 적용
  - Notes: P0에서 Mock 상수로 처리한 용량 제한 로직을 Clerk 세션 기반으로 교체

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
