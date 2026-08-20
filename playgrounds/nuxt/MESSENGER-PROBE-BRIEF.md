# Browser-extension brief — messenger / call migration (#331)

Hand this file to the in-browser assistant **after** running the probe harness
(see [README](README.md)) and having its transcript to hand.

## Why you, and not the harness

The harness runs inside the app placement iframe. That is where the problem
lives, and it is also why the harness cannot answer the question that matters:
from the iframe, the top window is cross-origin and opaque.

You are running in the browser, on the portal page, with the **top window** in
scope. You can read the things the harness can only fail to reach. Do not
re-derive what the harness already recorded — read its transcript, then go and
find what it could not.

## What to establish

Work on the portal tab, with the app placement open. Four questions, in order of
how much they decide.

### 1. Does the recommended API actually exist here, and in what shape?

Inspect `BX.Messenger.Public` in the top window. Record: whether it exists, which
of `startPhoneCall` / `startVideoCall` / `openChat` are present, each one's
`length` (declared arity) and, if the source is readable, its actual parameter
list.

This matters because the published docs give
`startVideoCall([String dialogId[, Boolean withVideo]])` while the method it
replaces takes a numeric `userId`. If the real signature disagrees with the
documented one, that is a documentation defect worth reporting on its own.

### 1b. Find `im.public.iframe`

The first probe run surfaced this console warning from the portal when the
deprecated bridge is called:

> `Developer: method BXIM.openMessenger is deprecated. Use method
> 'Messenger.openChat' from 'im.public' or 'im.public.iframe' extension.`

**`im.public.iframe` is the highest-value lead in this whole investigation**, and
it is absent from the published apidocs. An extension named for the iframe case
implies the migration path apps need may already exist.

Find it in the loaded sources. Establish: what it exports, whether it is loaded
on the portal page, whether it registers a postMessage handler, and — decisively
— whether an app placement can reach it and how. If it exposes `openChat` /
`startPhoneCall` / `startVideoCall` for frames, that is the answer, and the
upstream fix is documentation.

### 2. What command vocabulary does the parent's app-message handler accept?

The bridge works by the app posting a string `imPhoneTo:<params>:<cb>:<appSid>`
to the parent window, where a handler dispatches on the command name. Find that
handler and extract the set of command names it dispatches on.

This is the decisive artefact. The harness cannot settle it: the `im*` commands
are fire-and-forget, so an unsupported name and a working one both stay silent —
the first run proved that by reporting "no handler" for a command that visibly
worked. You can read the actual list instead of inferring from silence. If a name for the new
methods is already there, the migration path exists and was never documented.

Report the full vocabulary, not just the messenger entries — the difference
between what the handler accepts and what the SDK sends is useful to us either
way.

### 3. What does the deprecated bridge do internally?

Trace `imPhoneTo` and `imOpenMessenger` from the handler inward. The specific
thing to find out: **does the old bridge already call
`BX.Messenger.Public.startPhoneCall` / `openChat` underneath?**

If it does, the deprecation is cosmetic — the new methods are already reachable
from apps, just under the old names — and the fix upstream is a few lines in a
dispatch table plus a documentation correction. If it calls something else
entirely (a legacy phone manager, an older messenger entry point), then the old
and new paths are genuinely different code and a real bridge has to be written.

Those two conclusions lead to very different asks, so do not guess between them.

### 4. What happens on a live call?

With the placement open, press **Run deprecated im\*** in the harness and watch
the top window: which functions run, what the handler receives, whether anything
is logged or thrown. Then compare against calling
`BX.Messenger.Public.startPhoneCall(...)` directly in the top-window console with
the same number.

If both reach the same code, say so. If they diverge, the divergence is the
report.

## What to write

Produce **one** document, in English, addressed to the Bitrix24 platform
developers. It has to stand on its own — assume the reader has not seen the
harness, this repository, or the issue.

Structure it as:

1. **What an app can and cannot reach today.** One short paragraph plus the
   evidence: the `SecurityError` from the harness for the top-window read, and
   your finding on whether `BX.Messenger.Public` exists in the top window at all.
2. **The four deprecated methods and their replacements**, as a table, with the
   signature mismatches named explicitly (`userId` vs `dialogId`; two methods
   collapsing into one `openChat`; `openHistory`'s history window becoming a
   `messageId` focus).
3. **The command vocabulary the parent accepts**, verbatim from question 2.
4. **What the old bridge does internally**, from question 3, with the code path.
5. **The ask** — exactly one of these three, chosen by what you found, not by
   what would be convenient:
   - *the path exists*: name the command, and ask for it to be documented on the
     four apidocs pages, with an in-placement example that does not start with a
     bare `BX`;
   - *the path is one dispatch entry away*: propose the concrete addition, with
     the surrounding code as you read it;
   - *no path exists*: ask for a bridge, and state precisely what it would have
     to forward and what it should return.
6. **What you could not determine**, listed plainly. Minified or otherwise
   unreadable source, a handler you could not locate, a behaviour you inferred
   rather than observed — say which. A gap named is useful; a gap papered over
   wastes the reader's time when they check.

## Rules for the write-up

- **Separate observed from inferred.** Every claim should be traceable to
  something you read or ran. If you are reasoning from a name or from
  minified code, mark it.
- **Quote, do not paraphrase, when quoting matters** — command names, signatures,
  error text. Those are what the reader will grep for.
- **No proposed patch to code you could not read.** A confident diff against
  guessed internals is worse than "here is what it would need to do".
- **Do not soften a negative result.** "All six candidate names are absent from
  the handler's vocabulary" is a finding. Hedging it into "may not be supported"
  loses the only thing that makes the report actionable.
- Keep it short enough to be read in one sitting. The evidence appendix can be
  long; the argument should not be.
