# Gaokao English Grader

[简体中文说明](./README_zh.md)

Gaokao English Grader is a Cloudflare-based web app for grading Gaokao English essays with AI. It supports both Practical Writing and Continuation Writing, accepts text or image uploads, runs OCR and grading on the backend, and stores every grading task with a persistent `task_uuid`.

The current system is queue-based: the browser submits a task, Cloudflare Queue processes it in the background, D1 stores the task state and final result, and the History page can still show the result even if the user refreshes or leaves the page.

## What It Does

- Supports two essay types:
  - Practical Writing (`应用文`)
  - Continuation Writing (`读后续写`)
- Supports two input methods:
  - Plain text input
  - Image upload with OCR
- Uses backend Gemini calls only:
  - The frontend never talks to Gemini directly.
  - The Worker calls Gemini from Cloudflare.
- Generates structured grading reports:
  - Score and overall comments
  - Line-by-line corrections
  - Error analysis
  - Excellent expressions
  - A polished essay
  - Type-specific modules for Practical / Continuation writing
- Persists every grading task:
  - `queued`
  - `processing`
  - `successful`
  - `failed`
- Provides History management:
  - AI-generated short summary title for the left-side list
  - `task_uuid`
  - type badge
  - timestamp
  - delete action
- Supports export and output actions:
  - Download full result as JSON
  - Copy full result as JSON
  - Print as A4 PDF

## Architecture

### Frontend

- React + TypeScript + Vite
- Main grading UI:
  - [components/EssayGraderV2.tsx](/D:/Code/gaokao-english-grader/components/EssayGraderV2.tsx)
- History UI:
  - [components/HistoryPageV3.tsx](/D:/Code/gaokao-english-grader/components/HistoryPageV3.tsx)
- Structured report renderer:
  - [components/report/ReportRenderer.tsx](/D:/Code/gaokao-english-grader/components/report/ReportRenderer.tsx)
- API client:
  - [services/api.ts](/D:/Code/gaokao-english-grader/services/api.ts)
- Image compression and submission:
  - [services/geminiService.ts](/D:/Code/gaokao-english-grader/services/geminiService.ts)
- Print template:
  - [services/reportPrintV3.ts](/D:/Code/gaokao-english-grader/services/reportPrintV3.ts)

### Backend

- Cloudflare Worker entry:
  - [worker/app.ts](/D:/Code/gaokao-english-grader/worker/app.ts)
- Legacy Worker routes still exist for non-grading APIs:
  - [worker/index.ts](/D:/Code/gaokao-english-grader/worker/index.ts)
- Structured grading prompts:
  - [promptsV2.ts](/D:/Code/gaokao-english-grader/promptsV2.ts)

### Storage

- D1:
  - `history`
  - `grading_tasks`
  - `task_user_locks`
  - `usage_logs`
  - `sessions`
- R2:
  - stores temporary grading payloads before queue consumption
- Queue:
  - `gaokao-english-grader-tasks`

## Core Task Flow

### Text submission

1. User submits question text and essay text.
2. Frontend calls `POST /api/grade`.
3. Worker creates a `task_uuid`.
4. Worker stores the payload in R2.
5. Worker inserts a `queued` row into `grading_tasks`.
6. Worker publishes a lightweight message to Cloudflare Queue.
7. Frontend shows task status and starts polling.
8. Queue consumer processes the task in the background.
9. Final result is written to D1 and appears in History.

### Image submission

1. Frontend compresses images before upload.
2. Images are submitted to `POST /api/grade` as `multipart/form-data`.
3. Worker stores the payload in R2 and enqueues the task.
4. Queue consumer runs OCR first.
5. OCR text is used as the source essay text for grading.
6. Queue consumer runs structured grading and title summarization.
7. Final OCR text, structured report, and metadata are stored in D1.

## Why Queue Is Used

Queue was added to solve several real production issues:

- Large image tasks should not depend on the browser staying open.
- Refreshing the page should not cancel grading.
- Multiple tasks from the same user should be processed in order.
- Gemini calls must happen on the backend so local regional access restrictions do not break grading.

The worker enforces per-user ordering through `task_user_locks`.

## Data Model

### `history`

Stores successful historical records for compatibility and browsing.

Important fields:

- `id`
- `user_id`
- `timestamp`
- `topic`
- `original_content`
- `feedback`
- `task_uuid`

### `grading_tasks`

This is now the main task table.

Important fields:

- `task_uuid`
- `user_id`
- `status`
- `essay_type`
- `input_method`
- `summary_title`
- `topic`
- `original_content`
- `transcription`
- `report_json`
- `error_message`
- `payload_r2_key`
- `history_id`
- `created_at`
- `updated_at`

### `task_user_locks`

Used to guarantee ordered processing per user.

## Structured Output

The grading model is instructed to return strict JSON rather than free-form Markdown.

Two report families are supported:

- `PracticalWritingReport`
- `ContinuationWritingReport`

The shared and type-specific interfaces are defined in:

- [types.ts](/D:/Code/gaokao-english-grader/types.ts)

Important behavior:

- The summary title is only used in the History list.
- The summary title is not used as the report title.
- Printed reports use a generic type-based title.
- Downloaded and copied content is JSON, not Markdown.

## OCR and Recognition Notes

OCR is intentionally more defensive now:

- Frontend compresses images before upload.
- OCR uses a larger output token limit.
- If OCR output is truncated, the backend asks the model to continue.
- Each page is transcribed separately for multi-image uploads.

This was added because continuation-writing essays were sometimes only partially recognized when the OCR output was cut off.

## Report Rendering

The web report is designed for both desktop and mobile:

- responsive cards
- mobile-friendly tables
- diff-like correction rendering for:
  - `~~deleted~~`
  - `**added**`
- type-specific sections for Practical / Continuation writing

The printable PDF is A4-oriented and intentionally different from JSON export:

- no Markdown symbols
- no JSON syntax
- tighter line spacing
- no class, student ID, or student name

## File Naming Rules

Downloaded grading files follow this format:

`username-文章类型-task_uuid前8位-YYYY-MM-DD.json`

Example:

`alice-续写-a1b2c3d4-2026-03-29.json`

## History Page Behavior

The History list displays:

- AI-generated summary title
- status badge
- type badge
- short UUID badge
- timestamp

The detail panel displays:

- generic report title by essay type
- original recognized text
- AI feedback
- JSON copy / download
- PDF print

The delete button is a red trash icon.

## API Overview

### Grading

- `POST /api/grade`
  - create task and enqueue it
- `GET /api/tasks/:task_uuid`
  - fetch the current task state or result
- `GET /api/tasks/latest-active`
  - restore the latest unfinished task after refresh

### History

- `GET /api/history`
  - returns task-oriented history data
- `DELETE /api/history/:task_uuid`
  - deletes a task/history record

### Auth and Admin

Other auth/admin/audio routes continue to be served by the Worker, but grading now runs through the queue-aware task flow in [worker/app.ts](/D:/Code/gaokao-english-grader/worker/app.ts).

## Setup

### Prerequisites

- Node.js 18+
- npm
- Cloudflare account
- Wrangler CLI
- D1 database
- R2 bucket
- Cloudflare Queue
- Gemini API access
- Aryuki Auth Center configuration if you use the existing SSO flow

### Install

```bash
npm install
```

### Database initialization

For a fresh environment:

```bash
npx wrangler d1 execute gaokao-en-grader-db --remote --file=schema.sql
```

For an existing environment that needs queue/task support:

```bash
npx wrangler d1 execute gaokao-en-grader-db --remote --file=migrate-grading-tasks.sql
```

### Queue creation

```bash
npx wrangler queues create gaokao-english-grader-tasks
```

### Secret configuration

At minimum, set:

```bash
npx wrangler secret put API_KEY
```

You should also make sure the following bindings and vars are correctly configured in [wrangler.toml](/D:/Code/gaokao-english-grader/wrangler.toml):

- D1 binding: `DB`
- R2 binding: `R2`
- Queue binding: `GRADING_QUEUE`
- asset binding: `ASSETS`
- `API_DOMAIN`
- `MODEL_NAME`
- `LISTEN_MODEL_NAME`
- `SSO_URL`
- `SSO_APP_ID`
- `SSO_SECRET_KEY`
- `ADMIN_USER_ID`

## Local Development

### Start dev server

```bash
npm run dev
```

### Build production bundle

```bash
npm run build
```

### Deploy

```bash
npx wrangler deploy
```

## Operating Guide

### For normal users

1. Log in through the existing SSO flow.
2. Open the grader page.
3. Choose essay type:
   - Practical Writing
   - Continuation Writing
4. Choose input method:
   - Text
   - Image
5. Submit the task.
6. Watch the task status:
   - `Queued`
   - `Processing`
   - `Successful`
   - `Failed`
7. Open History at any time to revisit the result.
8. Use:
   - `Copy JSON`
   - `Download JSON`
   - `PDF`

### For image grading

- Upload clearer images if handwriting is difficult to read.
- Multi-page submissions are supported.
- If recognition still looks incomplete, prefer fewer pages per task or clearer crops.

### For admins / operators

- Check D1 if tasks appear stuck.
- Check Worker logs if tasks fail repeatedly.
- Check Queue bindings if `queued` tasks never move to `processing`.
- Check `report_json`, `error_message`, and `payload_r2_key` in `grading_tasks` when debugging.

## Troubleshooting

### Task stays in `Queued`

Possible causes:

- Queue consumer not configured
- Worker deploy did not include queue consumer
- Queue binding name mismatch

Check:

- [wrangler.toml](/D:/Code/gaokao-english-grader/wrangler.toml)
- Cloudflare Queue dashboard
- latest Worker deploy status

### Image OCR is incomplete

Possible causes:

- low-quality image
- OCR output got truncated
- too much content in one page image

Current mitigations already in place:

- frontend compression
- per-page OCR
- OCR continuation request

### Browser shows network failure for image grading

Possible causes:

- image payload still too large
- unstable upload network

Mitigations already in place:

- client-side compression
- queue-backed backend processing

### Title in History looks too short

Summary titles are AI-generated specifically for the History list. The prompt now asks for a slightly longer 12-18 character sentence that captures:

- 人物或场景
- 核心事件
- 主题或特点

If titles are still too generic, adjust [promptsV2.ts](/D:/Code/gaokao-english-grader/promptsV2.ts).

## Important Files

- [App.tsx](/D:/Code/gaokao-english-grader/App.tsx)
- [types.ts](/D:/Code/gaokao-english-grader/types.ts)
- [promptsV2.ts](/D:/Code/gaokao-english-grader/promptsV2.ts)
- [utils/reportUtils.ts](/D:/Code/gaokao-english-grader/utils/reportUtils.ts)
- [services/api.ts](/D:/Code/gaokao-english-grader/services/api.ts)
- [services/geminiService.ts](/D:/Code/gaokao-english-grader/services/geminiService.ts)
- [services/reportPrintV3.ts](/D:/Code/gaokao-english-grader/services/reportPrintV3.ts)
- [components/EssayGraderV2.tsx](/D:/Code/gaokao-english-grader/components/EssayGraderV2.tsx)
- [components/HistoryPageV3.tsx](/D:/Code/gaokao-english-grader/components/HistoryPageV3.tsx)
- [components/report/ReportRenderer.tsx](/D:/Code/gaokao-english-grader/components/report/ReportRenderer.tsx)
- [worker/app.ts](/D:/Code/gaokao-english-grader/worker/app.ts)
- [worker/index.ts](/D:/Code/gaokao-english-grader/worker/index.ts)
- [schema.sql](/D:/Code/gaokao-english-grader/schema.sql)
- [migrate-grading-tasks.sql](/D:/Code/gaokao-english-grader/migrate-grading-tasks.sql)
- [wrangler.toml](/D:/Code/gaokao-english-grader/wrangler.toml)

## Experience

### Backend-first Gemini access matters

Gemini requests must be sent from the Worker, not the browser. This avoids failures when the user's local region cannot directly access Gemini but Cloudflare can.

### Queue-based grading is more reliable than sync grading

Once grading became OCR-heavy and structurally richer, synchronous requests became too fragile. Queue-backed background processing is now the safer default.

### OCR needs continuation handling

Long continuation essays can exceed OCR output limits. Asking the model to continue from the cut-off point significantly improves recognition completeness.

### Summary titles should not leak into the report body

The History title is useful for list browsing, but it should not replace the formal report title or appear inside the polished essay.

### JSON is the correct export format for structured reports

Once the model output became strict JSON, JSON download/copy became more reliable than keeping Markdown as the main export path.
