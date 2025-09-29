# Repository Guidelines

## Project Structure & Module Organization
- `src/` application code by feature (e.g., `src/api`, `src/core`).
- `tests/` mirrors `src/` structure; unit first, integration under `tests/integration/`.
- `scripts/` helper CLIs (setup, release, data tasks).
- `docs/` architecture notes and ADRs; `examples/` runnable snippets.
- `.github/workflows/` CI; config lives in dotfiles at repo root.

## Build, Test, and Development Commands
- `make setup` install deps and prepare local env.
- `make dev` run app locally with auto-reload if supported.
- `make test` run the full test suite; fails on lint/type errors if wired.
- `make lint` static analysis; `make format` applies formatting.
- If Make is absent, prefer ecosystem defaults:
  - Node: `npm ci`, `npm run dev`, `npm test`, `npm run lint`.
  - Python: `pip install -r requirements.txt`, `pytest`, `ruff check`, `black .`.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (JS/TS), 4 spaces (Python). Max line length 100.
- Naming: files kebab-case (web) or snake_case (Python); classes `PascalCase`; functions/vars `camelCase` (web) or `snake_case` (Python).
- Formatters: Prettier (web), Black (Python). Linters: ESLint, Ruff. Type checks: TypeScript/mypy where applicable.

## Testing Guidelines
- Frameworks: Jest/Vitest (web) or Pytest (Python).
- Names: `*.test.ts`/`*.spec.ts` or `test_*.py` under `tests/`.
- Coverage target: ≥80%. Generate with `npm run test:coverage` or `pytest --cov`.
- Keep tests deterministic; mock network/IO. Place fixtures under `tests/fixtures/`.

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`.
- Scope example: `feat(api): add pagination`.
- PRs: clear description, linked issues (`Closes #123`), screenshots/logs when UI/CLI changes, checklist for tests and docs.

## Security & Configuration Tips
- Never commit secrets. Use `.env.local` and `.env.example` for keys.
- Validate inputs; avoid unsafe eval/exec. Pin dependencies where possible.
- CI should block on tests, lint, and coverage threshold.

## Agent-Specific Instructions
- Follow these guidelines across the repo. Keep changes minimal and focused.
- Do not introduce new dependencies, licenses, or large refactors without discussion.
- Prefer `make` targets; if missing, add them in `Makefile` with clear help text.
