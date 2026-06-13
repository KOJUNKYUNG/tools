# Ontab

> A browser-tab toolbox for PPT, PDF, and image utilities. No login, no upload,
> no server side — everything runs locally in your browser.

Ontab ("on tab") is a free web app of file-handling utilities aimed at
non-experts who just need to get one job done — resize an image, merge a
couple of PDFs, swap out a slide background — without learning a tool, signing
up for an account, or sending their files to someone else's server.

## What's inside

A representative sample — **not the full list.** The live tool roster lives in
the app and in the `TOOLS` registry ([`src/lib/constants.ts`](src/lib/constants.ts));
this table is a hand-picked snapshot and isn't kept in lock-step with it:

| Category    | Tool             | What it does                          |
| ----------- | ---------------- | ------------------------------------- |
| Slides      | `ppt-background` | Replace slide backgrounds in a PPTX   |
| Slides      | `ppt-extract`    | Extract slides as images / text       |
| Documents   | `pdf-arrange`    | Merge, split, reorder, rotate pages in one editor |
| Documents   | `pdf-compress`   | Reduce PDF file size                  |
| Documents   | `pdf-to-image`   | Rasterize PDF pages to images         |
| Images      | `image-to-pdf`   | Bundle images into a PDF              |
| Images      | `image-resize`   | Resize images (pixel or ratio mode)   |
| Images      | `image-compress` | Compress images                       |

All processing happens client-side — your files never leave the browser.

## How it works

The landing page is a single interactive toolbox: pick a category, the lid
lifts, you pick a tool, and the workspace expands inline. Migrated tools run
**directly on the landing** without a route change. Each tool also has a
deep-link route at `/{locale}/tools/{slug}` for SEO and bookmarking.

## Tech stack

- **Next.js 16** (App Router, native `[lang]` segments — no `next-intl`)
- **React 19**, **TypeScript** (strict)
- **Tailwind CSS 4** with project-specific silver design tokens
- **pnpm** for package management
- Per-tool browser libraries: `pdf-lib`, `pdfjs-dist`, `jszip`, `pdf-lib`,
  `browser-image-compression`, `@dnd-kit/*`, etc.
- **No backend.** No database, no auth, no API routes for file processing.

## Local development

```powershell
pnpm install
pnpm dev
```

Open <http://localhost:3000> — you'll be redirected to `/ko` or `/en`
depending on your browser's `Accept-Language` header.

Useful scripts:

```powershell
pnpm build              # production build
pnpm start              # serve the production build
pnpm exec tsc --noEmit  # type check without emitting
pnpm lint               # ESLint
```

Node 20+ recommended.

## Project documentation

If you're going to touch the code, read these first:

- [`CONTEXT.md`](./CONTEXT.md) — domain vocabulary and architecture overview
- [`DESIGN.md`](./DESIGN.md) — the design system (monochrome): tokens,
  typography, components, Do's & Don'ts
- [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md) — guidance for AI
  coding agents working in this repo
- [`docs/adr/`](./docs/adr/) — architectural decision records

For the full map of which doc holds what, see
[`CONTEXT.md` → Document map](./CONTEXT.md#document-map). The product roadmap
lives in [`CONTEXT.md` → Phases](./CONTEXT.md#phases).

When proposing changes, use the vocabulary defined in `CONTEXT.md` and flag
any conflict with an existing ADR rather than silently overriding it.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `pnpm exec tsc --noEmit` passes.
2. `pnpm build` passes.
3. The change uses the existing monochrome design tokens and treatment
   classes (see `DESIGN.md`) — don't introduce new ones unless an ADR
   sanctions it.
4. New tools land via the tool registry; nothing should hard-code a tool
   slug or the total tool count.

## License

TBD — see `LICENSE` when it lands. Until then, treat the code as
"source-available, not yet licensed."

---

## 한국어 안내

**Ontab** 은 "on tab" — 브라우저 탭 위에 펼쳐지는 공구함입니다. 회원가입·로그인·서버 업로드 없이 PPT·PDF·이미지 작업을 브라우저 안에서 끝낼 수 있게 만든 무료 웹 앱입니다.

기본 사용 흐름:

1. <http://localhost:3000> 또는 배포된 URL 접속
2. 카테고리를 고르면 트레이 뚜껑이 들리며 도구 그리드가 나타남
3. 도구를 선택하면 같은 페이지 안에서 업로드 → 처리 → 다운로드까지 완결

모든 처리는 브라우저에서 일어나며, 파일은 외부로 전송되지 않습니다.

로컬 실행:

```powershell
pnpm install
pnpm dev
```

자세한 도메인 용어·아키텍처·제품 로드맵은 [`CONTEXT.md`](./CONTEXT.md), 디자인 시스템은 [`DESIGN.md`](./DESIGN.md), 결정 이력은 [`docs/adr/`](./docs/adr/) 를 참조하세요. 어떤 정보가 어느 문서에 사는지는 [`CONTEXT.md` → Document map](./CONTEXT.md#document-map) 에 정리돼 있습니다.
