# Bitrix24 Self Task Automation Script

This script automates the processing of Bitrix24 tasks using Claude AI.

## Installation

1. Install Python dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r scripts/b24-self-task/requirements.txt
   ```

2. Install Claude Code CLI (if not already installed):
   - Follow instructions at [Claude Code documentation](https://claude.com/claude-code)

3. Configure environment variables:
   - Copy `.env.example` to `.env` in the project root
   - Add your Bitrix24 webhook:
     ```
     B24_WEBHOOK=https://yourdomain.bitrix24.com/rest/1/xxxx/
     ```

## Usage

```bash
python scripts/b24-self-task/make.py <task_id>
```

Example:
```bash
source venv/bin/activate
python scripts/b24-self-task/make.py 2026
```

## What the script does

1. **Fetches task details** from Bitrix24 by `ID`
2. **Creates a checklist** with two items: `[AI-agent] Execute` and `[You] Check`
3. **Extracts task description** from the task (if no description found, use title)
4. **Runs Claude AI** on the task description — **sandboxed** (see [Security Notes](#security-notes))
5. **Saves the result** in the task chat
6. **Marks checklist item** `[AI-agent] Execute` as completed

> **Note:** the git steps (create branch / commit / push) are **disabled**.
> The agent runs **read-only** and returns a report; it does not modify or
> push the repository. The `create_git_branch` / `commit_changes` /
> `push_changes` helpers remain in the source for reference but are not
> called by `run()`.

## Requirements

- Python 3.7+
- Claude Code CLI installed and in PATH
- Bitrix24 webhook with permissions: `tasks`, `task`

(Git is only needed if you manually re-enable the disabled git helpers.)

## Troubleshooting

1. **"b24pysdk not installed"**:
   - Run `pip install b24pysdk`

2. **"Claude CLI not found"**:
   - Install Claude Code and ensure it's in your PATH
   - Test with `claude --version`

3. **"B24_WEBHOOK not set"**:
   - Check your `.env` file contains the correct webhook URL

4. **Bitrix24 API errors**:
   - Verify your webhook has necessary permissions
   - Check that task ID exists and is accessible

## Customization

You can modify the script to:
- Use different checklist items
- Adjust the Claude prompt
- Add additional task fields

## Security Notes

The task description is **untrusted input** — any portal user who can edit a
task supplies the text that becomes the agent prompt. The task is pure text
analysis of that description, so the agent needs **no tools at all**, and the
invocation is hardened with several independent guardrails:

- **No `--dangerously-skip-permissions`.**
- **No tools.** The agent is launched with an empty allowlist **and** an
  explicit deny-list for the file/shell/network tools
  (`Bash,Edit,Write,Read,Grep,Glob,WebFetch,WebSearch,…`). In print mode a
  tool that isn't allowed is refused outright, so a prompt injection has no
  `Read` to exfiltrate secrets with, no `Bash`/`Write` to execute or mutate,
  and no `WebFetch` to phone home. This — not the temp dir — is the real
  boundary: a `cwd` sandbox alone would **not** stop `Read`/`Grep` from
  opening an absolute path like `.../.env`.
- **Scrubbed environment.** The `B24_WEBHOOK` secret is removed from the child
  process environment before `claude` is spawned.
- **Throwaway working directory.** The agent runs in a fresh temp dir (removed
  afterwards) — defence in depth against stray relative-path writes.
- **Injection framing.** The description is wrapped in delimited
  `UNTRUSTED-TASK` markers (any smuggled end-marker is neutralized) and the
  agent is told to treat it as data, never as instructions.

General hygiene:

- Keep your `.env` file secure and never commit it to git
- Ensure your Bitrix24 webhook has minimal necessary permissions
- Review Claude output before acting on it

## Credits

- [Python SDK](https://github.com/bitrix24/b24pysdk)
