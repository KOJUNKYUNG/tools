## 1. 프로젝트 개요
- **프로젝트명:** All-in-One Document Utility (가칭: DocuFlow)
- **목적:** PDF 변환/병합 및 PPT 이미지 추출/배경 일괄 변경 기능을 제공하는 웹 기반 도구 모음.
- **핵심 가치:** - **Privacy-First:** 가급적 클라이언트 사이드에서 파일을 처리하여 보안 강화.
    - **Efficiency:** 직관적인 UI/UX를 통한 빠른 작업 처리.
    - **Automation Ready:** 반복적인 PPT 편집 작업을 자동화.

## 2. 기술 스택
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn/UI
- **Authentication:** Clerk
- **Database/Storage:** Supabase (이미지 메타데이터 및 배경 이미지 저장소)
- **Core Libraries:**
    - PDF 처리: `pdf-lib`, `pdfjs-dist`
    - PPT 조작: `jszip` (이미지 추출 및 XML 수정용)
    - 파일 업로드: `react-dropzone`

---

## 3. 핵심 기능 상세 설명

### 3.1 PDF 도구 (PDF Tools)
| 세부 기능 | 설명 | 권장 라이브러리 |
| :--- | :--- | :--- |
| **이미지 → PDF 변환** | JPG/PNG 이미지를 하나의 PDF로 변환 | `pdf-lib` |
| **PDF → 이미지 변환** | PDF 각 페이지를 이미지(JPG/PNG)로 추출. 사용자가 출력 형식과 해상도(72/150/300 DPI)를 선택 가능 | `pdfjs-dist`, `canvas` |
| **PDF 파일 합치기** | 여러 PDF 파일을 업로드 순서대로 하나의 파일로 병합 | `pdf-lib` |

**지원 파일 형식:**
- 입력 이미지: JPG, PNG
- 입력 PDF: PDF v1.4 이상
- 출력 이미지: JPG, PNG (사용자 선택)

### 3.2 PPT 도구 (PPT Tools)
| 세부 기능 | 설명 | 구현 로직 |
| :--- | :--- | :--- |
| **PPT 이미지 추출** | PPTX 내부에 포함된 모든 이미지 파일을 원본 품질로 추출. 결과물은 ZIP 파일로 다운로드 | `jszip`을 사용하여 `ppt/media` 폴더 내 파일 압축 해제 |
| **PPT 배경 일괄 변경** | 모든 슬라이드 혹은 마스터 슬라이드의 배경 이미지를 사용자가 선택한 이미지로 교체 | `ppt/slides/_rels` 및 XML 구조 내 배경 이미지 참조 ID 수정 |

**배경 교체 모드:**
- **전체 슬라이드 일괄 적용:** 각 슬라이드의 배경을 개별적으로 교체.
- **마스터 슬라이드 적용:** 마스터/레이아웃 슬라이드의 배경만 교체하여 전체에 일괄 반영.

**지원 파일 형식:** PPTX (Office 2007+ / .pptx 형식만 지원, .ppt 미지원)

### 3.3 배경 이미지 갤러리 (Content Gallery)
- **제공 서비스:** PPT 배경으로 사용하기 적합한 고화질 이미지 큐레이션 제공.
- **연동 기능:** 갤러리에서 이미지 선택 시, 업로드한 PPT의 배경으로 즉시 적용하는 기능 구현.
- **데이터 관리:** Supabase Storage에 이미지 저장, Database에 태그 및 카테고리 정보 관리.
- **사용자 기여:** 로그인한 사용자는 누구나 갤러리에 이미지를 업로드할 수 있음. 업로드 시 카테고리와 태그를 직접 입력.
- **심사 정책:** 사용자가 업로드한 이미지는 관리자 승인 후 갤러리에 공개 (부적절한 이미지 노출 방지).

---

## 4. 데이터베이스 및 저장소 구조 (Supabase)

### 4.1 `background_images` 테이블
- `id`: uuid (PK)
- `url`: string (Storage URL)
- `category`: string (e.g., 'Business', 'Nature', 'Minimal')
- `tags`: text[] (검색 및 분류용 태그 배열, e.g., ['gradient', 'blue', 'corporate'])
- `uploaded_by`: string (Clerk user_id, 업로드한 사용자 식별)
- `is_approved`: boolean (default: false, 관리자 승인 여부)
- `file_size`: integer (바이트 단위, 용량 관리 및 표시용)
- `created_at`: timestamp

### 4.2 Storage Bucket
- `assets`: 갤러리용 배경 이미지 저장.
- `temp`: (필요 시) 서버 사이드 처리를 위한 임시 파일 저장 (처리 후 즉시 삭제 로직 포함).

---

## 5. 사용자 흐름 (User Flow)

### 5.1 도구 사용 흐름
1. **Landing Page:** 전체 도구 목록 확인 및 선택.
2. **Tool Page:** 파일 드래그 앤 드롭 업로드.
3. **Processing:** 브라우저 내 혹은 API Route를 통한 파일 처리 (Progress Bar 표시).
4. **Gallery Selection (Option):** PPT 배경 변경 시 갤러리에서 이미지 선택.
5. **Download:** 처리 완료된 파일 다운로드 및 결과 확인.

### 5.2 갤러리 기여 흐름
1. **로그인:** Clerk를 통한 사용자 인증.
2. **갤러리 페이지:** 이미지 업로드 버튼 클릭.
3. **업로드 및 메타데이터 입력:** 이미지 파일 첨부 후 카테고리 선택, 태그 입력.
4. **승인 대기:** 업로드 완료 후 관리자 승인 대기 상태로 전환 (사용자에게 상태 안내).

### 5.3 오류 처리 흐름
- 파일 형식/크기 미충족 시: 업로드 단계에서 즉시 안내 메시지 표시.
- 처리 중 실패 시: 구체적인 오류 원인 메시지 표시 및 재시도 버튼 제공.
- 브라우저 메모리 초과 시: 파일 크기 축소 권고 메시지 표시.

---

## 6. 단계별 개발 로드맵 (Phased Roadmap)

### Phase 1: 기반 구축 및 PDF 도구
- [ ] Clerk 설정 및 기본 Layout 구성 (Shadcn/UI).
- [ ] PDF 합치기 및 이미지 변환 로직 구현 (Client-side).

### Phase 2: PPT 조작 기능
- [ ] PPTX 압축 해제 및 이미지 추출 기능.
- [ ] PPT XML 파싱을 통한 배경 이미지 교체 프로토타입 개발.

### Phase 3: 갤러리 및 수익화 준비
- [ ] Supabase 연동 및 이미지 갤러리 페이지 구축.
- [ ] 구글 애드센스 배치를 위한 UI 최적화 및 SEO 설정.

---

## 7. 가이드라인 (Constraints)
- 모든 파일 처리는 가급적 메모리 내에서 수행하며, 사용자 개인정보를 위해 서버에 영구 저장하지 않음.
- 모바일 환경에서도 파일 업로드가 용이하도록 반응형 레이아웃 필수 적용.
- 비로그인 사용자와 로그인 사용자(Clerk) 간 처리 용량 제한 차등화:
    - 비로그인: 최대 10MB / 파일, 일일 5회 처리 제한 (TBD).
    - 로그인: 최대 50MB / 파일, 무제한 처리 (TBD).
- **지원 파일 형식:** PDF (v1.4+), PPTX (Office 2007+), 이미지 (JPG, PNG).
- **브라우저 지원:** 최신 Chrome, Firefox, Edge, Safari (IE 미지원).

---

## 8. SEO 전략 (Phase 3 연계)
- 각 도구 페이지별 독립적인 메타데이터 설정 (title, description, OG tags).
- Next.js `metadata` API를 활용한 동적 메타 태그 생성.
- 구조화 데이터(JSON-LD) 적용: `WebApplication`, `SoftwareApplication` 스키마 활용.
- `sitemap.xml` 및 `robots.txt` 자동 생성 설정.
- 도구별 랜딩 페이지에 사용 가이드 콘텐츠 포함하여 검색 유입 극대화.

---
