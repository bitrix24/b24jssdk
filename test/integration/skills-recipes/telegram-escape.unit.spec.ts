/**
 * #64 — `escape()` from recipe 06-telegram-bot.ts.
 *
 * This is the recipe's injection boundary: its output is interpolated into a
 * message sent with `parse_mode: 'HTML'`, and the input is a CRM deal title or
 * contact name — portal data, i.e. attacker-influenced if anyone can create a
 * deal. An escape that misses a character lets a deal titled `<b>` reshape the
 * notification, and Telegram rejects malformed entities outright, so a miss is
 * both a spoofing vector and an outage.
 *
 * Pure function, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { escape, format } from '../../../skills/b24jssdk-recipes/examples/06-telegram-bot'

describe('escape (recipe 06)', () => {
  it('escapes the three characters Telegram HTML treats as markup', () => {
    expect(escape('<')).toBe('&lt;')
    expect(escape('>')).toBe('&gt;')
    expect(escape('&')).toBe('&amp;')
  })

  it('neutralises a tag injected through a deal title', () => {
    expect(escape('<b>URGENT</b>')).toBe('&lt;b&gt;URGENT&lt;/b&gt;')
    expect(escape('</b><a href="http://evil">click</a>'))
      .toBe('&lt;/b&gt;&lt;a href="http://evil"&gt;click&lt;/a&gt;')
  })

  it('does not double-escape an ampersand it just introduced', () => {
    // Single-pass `replace` never re-scans its own output. If this were written
    // as three chained replaces with `&` last, `<` would become `&amp;lt;`.
    expect(escape('<&>')).toBe('&lt;&amp;&gt;')
    expect(escape('&lt;')).toBe('&amp;lt;')
  })

  it('leaves text with no special characters untouched', () => {
    expect(escape('Deal with ACME')).toBe('Deal with ACME')
    expect(escape('')).toBe('')
    expect(escape('цена 100 ₽')).toBe('цена 100 ₽')
  })

  it('leaves quotes alone — deliberately', () => {
    // `escape` output is only ever placed in element TEXT, never inside an
    // attribute value (see `format` below), so quotes need no escaping there.
    // If a future edit interpolates it into an attribute, this must change.
    expect(escape('say "hi"')).toBe('say "hi"')
    expect(escape('it\'s')).toBe('it\'s')
  })

  it('handles a string that is only special characters', () => {
    expect(escape('<<>>&&')).toBe('&lt;&lt;&gt;&gt;&amp;&amp;')
  })
})

describe('format (recipe 06)', () => {
  const deal = {
    id: 42,
    title: 'Deal',
    opportunity: 1000,
    currencyId: 'RUB',
    contactId: 7,
    createdTime: '2026-01-01T00:00:00Z',
    stageId: 'NEW'
  }

  it('escapes the two portal-controlled fields it interpolates', () => {
    const out = format({ ...deal, title: '<b>x</b>' }, '<i>y</i>')
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(out).toContain('&lt;i&gt;y&lt;/i&gt;')
    // The raw forms must not survive anywhere in the message.
    expect(out).not.toContain('<b>x')
    expect(out).not.toContain('<i>y')
  })

  it('keeps its own markup tags intact', () => {
    // The escaping must not neutralise the template's own <b> labels.
    expect(format(deal, 'Ann')).toContain('<b>Title:</b>')
  })

  it('never places escaped text inside an attribute', () => {
    // The assumption the quote decision above rests on. If this fails, `escape`
    // needs to cover `"` and `'` as well.
    expect(format({ ...deal, title: 'x' }, 'y')).not.toMatch(/<[a-z]+\s+[a-z-]+=/i)
  })
})
