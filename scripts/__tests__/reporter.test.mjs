#!/usr/bin/env node
// Tests for scripts/_reporter.mjs (#418).
//
// Run with: node --test scripts/__tests__/reporter.test.mjs
//
// The reason this module exists is the GitHub annotations: before it, only the
// block gates emitted them, so six checks failed in CI as plain log text with
// nothing on the pull request diff. Most of what is pinned here is therefore
// about the annotation and the exit code — the two things a CI run depends on.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createReporter, escapeAnnotation } from '../_reporter.mjs'

/** Run `fn` with stdout captured, returning everything it wrote. */
function capture(fn) {
  const lines = []
  const log = console.log
  const write = process.stdout.write.bind(process.stdout)
  console.log = (...args) => lines.push(args.join(' '))
  process.stdout.write = (chunk) => {
    lines.push(String(chunk).replace(/\n$/, ''))
    return true
  }
  try {
    const result = fn()
    return { out: lines.join('\n'), result }
  } finally {
    console.log = log
    process.stdout.write = write
  }
}

function withCI(value, fn) {
  const before = process.env.GITHUB_ACTIONS
  if (value === undefined) {
    delete process.env.GITHUB_ACTIONS
  } else {
    process.env.GITHUB_ACTIONS = value
  }
  try {
    return fn()
  } finally {
    if (before === undefined) {
      delete process.env.GITHUB_ACTIONS
    } else {
      process.env.GITHUB_ACTIONS = before
    }
  }
}

test('an error prints the file relative to the root', () => {
  const { out } = capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error('/repo/docs/page.md', 'something is wrong')
    return report.finish()
  })

  assert.match(out, /ERROR.*docs\/page\.md something is wrong/)
})

test('line and column are appended when given, omitted when not', () => {
  const { out } = capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error('/repo/a.md', 'with position', { line: 12, col: 3 })
    report.error('/repo/b.md', 'without position')
    return report.finish()
  })

  assert.match(out, /a\.md:12:3 with position/)
  assert.match(out, /b\.md without position/)
})

test('a check with no file to blame is still attributable', () => {
  // Whole-repository invariants have nothing to point at. The label stands in,
  // so the line does not begin with a bare message.
  const { out } = capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error(null, 'the invariant does not hold')
    return report.finish()
  })

  assert.match(out, /ERROR.*demo the invariant does not hold/)
})

test('errors fail, warnings do not — unless strict', () => {
  const warnOnly = () => {
    const report = createReporter({ label: 'demo' })
    report.warn('f', 'a warning')
    return report
  }

  assert.equal(capture(() => warnOnly().finish()).result, 0)
  assert.equal(capture(() => warnOnly().finish({ strict: true })).result, 1)

  const withError = capture(() => {
    const report = createReporter({ label: 'demo' })
    report.error('f', 'an error')
    return report.finish()
  })
  assert.equal(withError.result, 1)
})

test('a clean run exits 0 and says so', () => {
  const { out, result } = capture(() => createReporter({ label: 'demo' }).finish())

  assert.equal(result, 0)
  assert.match(out, /demo: 0 error\(s\), 0 warning\(s\)/)
})

test('the summary keeps the check own noun', () => {
  // Uniform level, check-specific noun: "1 broken link(s)" is more use to a
  // reader than "1 problem(s)", and unifying the format should not cost that.
  const { out } = capture(() => {
    const report = createReporter({ label: 'links', errorNoun: 'broken link' })
    report.error('f', 'gone')
    return report.finish()
  })

  assert.match(out, /links: 1 broken link\(s\), 0 warning\(s\)/)
})

test('notes are appended to the summary in order', () => {
  const { out } = capture(() => {
    const report = createReporter({ label: 'demo' })
    report.note('136 internal link(s) checked')
    return report.finish()
  })

  assert.match(out, /demo: 0 error\(s\), 0 warning\(s\), 136 internal link\(s\) checked/)
})

test('max caps what is printed but not what is counted', () => {
  const { out, result } = capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo', max: 2 })
    for (let i = 0; i < 5; i++) {
      report.error(`/repo/f${i}.md`, 'boom')
    }
    return report.finish()
  })

  assert.equal(result, 1)
  assert.match(out, /f0\.md/)
  assert.match(out, /f1\.md/)
  assert.doesNotMatch(out, /f2\.md/, 'printed past the cap')
  assert.match(out, /5 error\(s\)/, 'the count must not be capped')
  assert.match(out, /3 not shown/)
})

test('a GitHub annotation is emitted only under GITHUB_ACTIONS', () => {
  // This is the whole point of the module: before it, six checks failed in CI
  // with nothing on the diff.
  const inCI = withCI('true', () => capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error('/repo/docs/page.md', 'broken', { line: 7, col: 2, code: 'TS1234' })
    return report.finish()
  }))
  assert.match(inCI.out, /^::error file=docs\/page\.md,line=7,col=2::TS1234: broken$/m)

  const local = withCI(undefined, () => capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error('/repo/docs/page.md', 'broken')
    return report.finish()
  }))
  assert.doesNotMatch(local.out, /::error/)
})

test('a warning annotates as a warning, not an error', () => {
  const { out } = withCI('true', () => capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.warn('/repo/a.md', 'soft')
    return report.finish()
  }))

  assert.match(out, /^::warning file=a\.md::soft$/m)
})

const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const ESC = String.fromCharCode(27)

test('a file path cannot inject a workflow command', () => {
  // A POSIX filename may hold anything but `/` and NUL — newline included — and
  // these checks walk directories a contributor edits freely. The path is
  // therefore the most naturally attacker-controlled input on the line, and it
  // was the half the first version of this defence left unprotected.
  const { out } = withCI('true', () => capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error(`/repo/a.md${LF}::add-mask::pwned`, 'msg')
    return report.finish()
  }))

  assert.doesNotMatch(out, /^\s*::add-mask::/m)
  assert.match(out, /a\.md \| ::add-mask::pwned msg/)
})

test('a lone carriage return is a line boundary too', () => {
  // The runner is .NET-based and treats a bare `\r` as one, which is why
  // escapeAnnotation escapes it beside `\n`. A collapse that only handles `\n`
  // does not match that threat model.
  const { out } = withCI('true', () => capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error('/repo/a.md', `first${CR}::add-mask::pwned`)
    return report.finish()
  }))

  assert.doesNotMatch(out, new RegExp(`${CR}::add-mask::`))
  assert.match(out, /first \| ::add-mask::pwned/)
})

test('an escape character in a path cannot repaint the log', () => {
  // ANSI in a filename could otherwise clear the line and hide what a check
  // reported, which is a quieter failure than a forged command.
  const { out } = capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error(`/repo/c${ESC}[2Km.md`, 'ansi in a path')
    return report.finish()
  })

  assert.doesNotMatch(out, new RegExp(`c${ESC}`))
  assert.match(out, /c\[2Km\.md ansi in a path/)
})

test('annotation text cannot inject a second workflow command', () => {
  // A message carrying a newline would otherwise let the next line be read as
  // its own ::command — ::add-mask:: or ::set-env:: among them.
  assert.equal(escapeAnnotation('a\nb'), 'a%0Ab')
  assert.equal(escapeAnnotation('100%'), '100%25')
  assert.equal(escapeAnnotation('a\r\nb'), 'a%0D%0Ab')

  const { out } = withCI('true', () => capture(() => {
    const report = createReporter({ label: 'demo', root: '/repo' })
    report.error('/repo/a.md', 'first\n::add-mask::secret')
    return report.finish()
  }))

  // Indenting is not enough — Actions trims leading whitespace before parsing a
  // `::` command, so the printed line must carry no newline at all.
  assert.doesNotMatch(out, /^\s*::add-mask::/m)
  assert.match(out, /first \| ::add-mask::secret/)
  assert.match(out, /%0A::add-mask::secret/)
})
