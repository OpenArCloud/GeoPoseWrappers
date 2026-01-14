---
allowed-tools: Read, Glob, Bash, Write, Edit
description: Start or continue hourly development logging for the session
argument-hint: [optional: devlog-directory-path]
---

# Development Log (Devlog) Command

You are initiating or continuing the hourly devlog practice for this repository.

## Logging Convention

- **Directory**: `devlog/` in the repo root (or custom path if provided as argument)
- **Filename format**: `logfile_YYYY_MM_DD_HH.md` (hourly rotation)
- **Exchange numbering**: Sequential across all sessions, never resets

## Your Tasks

### 1. Setup (if needed)
- Create the `devlog/` directory if it doesn't exist
- Note: The argument `$ARGUMENTS` can override the default `devlog/` path

### 2. Find Current State
- Get current date/time: `date "+%Y %m %d %H"`
- Find all existing logfiles: `devlog/logfile_*.md`
- Read the most recent logfile to find the last exchange number

### 3. Create or Continue Logfile
- If no logfile exists for the current hour, create a new one
- If continuing from a previous session, reference it in "Session Start"
- Start with the next exchange number after the last recorded one

### 4. Logfile Template

```markdown
# Conversation Log - YYYY-MM-DD (HH:00 hour)

## Session Start

[First logfile: "New devlog initiated for this repository."]
[Continuing: "Continuing from previous session (`logfile_YYYY_MM_DD_HH.md`)."]

---

## Exchange N

**User:** [Brief summary of user request]

**Assistant:** [Brief summary of what was done]

---
```

### 5. Ongoing Practice

After setup, inform the user:
- The current logfile path
- The current exchange number
- Remind them you will:
  - Append exchanges to the current logfile as work progresses
  - Create a new hourly logfile if the hour changes during the session

## Important Notes

- Keep exchange summaries concise (1-3 sentences each)
- Document the "what" not the "how" - high-level summaries only
- Do NOT include code snippets in the log
- Update the log after completing each significant user request
- Check the hour periodically and rotate logfiles as needed
