import type { Handler, Processor, LogRecord, LogLevelName, LoggerInterface } from '../types/logger'
import { LogLevel } from '../types/logger'
import { AbstractLogger } from './abstract-logger'

/**
 * A logger created according to the principles of `Monolog`
 *
 * @link https://github.com/Seldaek/monolog
 */
export class Logger extends AbstractLogger implements LoggerInterface {
  private readonly channel: string
  private handlers: Handler[] = []
  private processors: Processor[] = []

  constructor(channel: string) {
    super()
    this.channel = channel
  }

  // region static methods for creation ////
  static create(channel: string): Logger {
    return new Logger(channel)
  }
  // endregion ////

  // region config ////
  public pushHandler(handler: Handler): this {
    this.handlers.push(handler)
    return this
  }

  public popHandler(): Handler | null {
    return this.handlers.pop() || null
  }

  public setHandlers(handlers: Handler[]): this {
    this.handlers = handlers
    return this
  }

  public pushProcessor(processor: Processor): this {
    this.processors.push(processor)
    return this
  }
  // endregion ////

  /**
   * **Never throws and never rejects.** Logging is a side channel: a failure in
   * it must degrade observability, not the operation being observed. Every
   * callsite in the SDK invokes this without `await` (`this.getLogger().info(…)`
   * as a statement), so a rejected promise would surface as an *unhandled
   * rejection* — which terminates the Node process by default. A handler doing
   * network or file I/O (Telegram, a stream, a third-party adapter) rejects for
   * ordinary operational reasons, so that path is reachable in normal operation,
   * not just in principle (#346).
   *
   * A processor or handler that fails is skipped and reported via
   * {@link reportLoggingFailure}; the remaining handlers still receive the
   * record.
   *
   * This covers failures *inside* the logger. It does not cover an exception
   * raised while a caller builds its log arguments — those are evaluated eagerly
   * at the callsite, before `log()` is reached (see `truncateForLog`, #338).
   *
   * ### Deliberately outside this guarantee
   *
   * Three gaps sit outside `log()` and were each weighed and left open on
   * purpose (#346). They are recorded here so they are not re-opened as
   * oversights:
   *
   * 1. **A third-party `LoggerInterface` is not isolated.** This guarantee
   *    belongs to this class, not to the interface. Every SDK callsite is
   *    written `…info(…).catch(() => {})`, which absorbs a *rejected promise*;
   *    an implementation that throws *synchronously*, before returning one,
   *    escapes into the caller. `setLogger(...)` warns about the shape it can
   *    check without calling anything (see `warnOnNonPromiseLogger`); returning
   *    promises is the implementor's side of the contract. Wrapping every
   *    installed logger defensively was considered and rejected: it would make
   *    the SDK responsible for code it does not own, on every one of ~94
   *    callsites, to cover a case TypeScript already rejects at compile time.
   *
   * 2. **A handler that fails forever is never detached.** Each failure is
   *    reported, every time — see {@link reportLoggingFailure}. Auto-detaching
   *    after N failures was considered and rejected: it silently changes a
   *    configuration the application made, and "N failures" is a policy the SDK
   *    has no basis to pick on the application's behalf.
   *
   * 3. **The synchronous half — argument construction — stays the caller's.**
   *    Making it total would mean wrapping the argument list at every callsite,
   *    which trades a narrow, findable failure (#338 was one expression in one
   *    helper) for noise at every call. Individual helpers on the hot path are
   *    made total instead, as `truncateForLog` was.
   *
   * @inheritDoc
   */
  public async log(level: LogLevel, message: string, context?: Record<string, any>): Promise<void> {
    const record: LogRecord = {
      channel: this.channel,
      level,
      levelName: LogLevel[level] as LogLevelName,
      message,
      context: context ?? {},
      extra: {},
      timestamp: new Date()
    }

    // Using processors. A processor that throws is skipped rather than allowed
    // to abort the record: it is an enrichment step (pid, memory usage), so
    // losing its contribution is strictly better than losing the log line — and,
    // per the isolation note on `log()`, better than taking the caller down. The
    // record keeps whatever the processors before it already added.
    let processedRecord = record
    for (const processor of this.processors) {
      try {
        processedRecord = processor(processedRecord)
      } catch (error) {
        this.reportLoggingFailure(processor, error)
      }
    }

    // Pass the record to the handlers. The whole interaction with a handler is
    // inside the `try`, not just `handle()`: `isHandling()` and `shouldBubble()`
    // are trivial predicates in every handler the SDK ships (`AbstractHandler`
    // compares two numbers), but they are interface methods a third party
    // implements, and the guarantee on `log()` is unconditional. Guarding only
    // the method that happens to fail today would make that guarantee depend on
    // which part of someone else's handler misbehaves.
    for (const handler of this.handlers) {
      try {
        if (!handler.isHandling(level)) {
          continue
        }

        // The handler returns a boolean indicating whether it was processed successfully.
        // `await` covers both a synchronous throw and a rejected promise — a
        // handler doing real I/O (Telegram, a stream, a third-party adapter)
        // fails for ordinary operational reasons, and neither form may escape.
        const handled = await handler.handle(processedRecord)

        // If the handler has processed the record and should NOT proceed further (bubble: false)
        // break the chain of handlers
        if (handled && !handler.shouldBubble()) {
          break
        }
      } catch (error) {
        // Isolate this handler only: a broken sink must not stop the ones
        // after it from receiving the record.
        this.reportLoggingFailure(handler, error)
      }
    }
  }

  /**
   * Report a processor/handler that threw.
   *
   * Reported on every failure, deliberately: suppressing repeats would hide how
   * often a sink is failing, and a sink that has been broken for an hour looks
   * identical to one that failed once. The volume is the signal — if it is
   * noisy, the sink is failing that often. Filtering belongs to whoever reads
   * the output, not to the SDK.
   *
   * `console` is used rather than the logger — routing a logging failure back
   * through the logger that just failed is how this turns into recursion.
   *
   * The handler is **not** detached, however many times it fails. Doing so would
   * silently discard part of a configuration the application built, and the
   * threshold that would trigger it is a policy call the SDK cannot make for the
   * application. A sink that is broken stays wired and stays loud; whoever reads
   * the output decides what to do about it (#346).
   */
  private reportLoggingFailure(source: Processor | Handler, error: unknown): void {
    const name = (source as { constructor?: { name?: string } })?.constructor?.name ?? 'processor'
    console.warn(
      `[b24jssdk] logger channel "${this.channel}": ${name} failed; the record was skipped. `
      + `Logging continues through the remaining handlers, and the operation being logged is unaffected.`,
      error
    )
  }
}
