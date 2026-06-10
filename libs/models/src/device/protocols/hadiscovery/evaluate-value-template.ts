/**
 * Minimal evaluator for the Home Assistant `value_template` subset our devices
 * actually publish — no template engine dependency. Supported shape: a single
 * `{{ expr }}` where expr combines `value` / `value_json.<path>` references,
 * number/string literals, `+ - * / %` arithmetic with parentheses and unary
 * minus, and the chained filters `round(n)`, `int`, `float`, `abs`,
 * `default(d)`. Anything else (statements, HA functions, bracket access…)
 * evaluates to `undefined` so callers can fall back to the raw value.
 * Reference: https://www.home-assistant.io/integrations/sensor.mqtt/#value_template
 */

/** Context an HA value_template renders against: raw payload + parsed JSON. */
export interface TemplateContext {
  value: string;
  value_json?: unknown;
}

/** Sentinel for a missing value_json field (distinct from a stored undefined). */
const MISSING = Symbol('missing');

const IDENTITY_TEMPLATE = /^\{\{\s*value_json\.([A-Za-z0-9_]+)\s*\}\}$/;
const SINGLE_EXPRESSION = /^\{\{([\s\S]*)\}\}$/;
const NUMERIC_STRING = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/** Extract the first `value_json.<field>` referenced by a value_template. */
export function valueJsonField(template: unknown): string | undefined {
  if (typeof template !== 'string') return undefined;
  const m = template.match(/value_json\.([a-zA-Z0-9_]+)/);
  return m ? m[1] : undefined;
}

/**
 * Strictly evaluate a supported-subset template. Returns the rendered value
 * (numeric strings coerced to numbers), or `undefined` when the template uses
 * syntax outside the subset, a referenced field is missing, or an arithmetic
 * operand is not numeric.
 */
export function evaluateValueTemplate(
  template: string,
  ctx: TemplateContext,
): unknown {
  const identity = IDENTITY_TEMPLATE.exec(template);
  if (identity) return finalize(walkValueJson(ctx.value_json, [identity[1]]));

  const single = SINGLE_EXPRESSION.exec(template.trim());
  if (!single) return undefined;
  const expr = single[1];
  // Greedy match would swallow `}} … {{` between two mustaches; reject those.
  if (expr.includes('{{') || expr.includes('}}')) return undefined;

  try {
    const parser = new ExpressionParser(expr, ctx);
    const result = parser.parseExpression();
    parser.expectEnd();
    return finalize(result);
  } catch {
    return undefined;
  }
}

/**
 * Evaluate with graceful fallback (ingestion policy — never throws):
 * 1. the evaluated template result when defined;
 * 2. else the raw `value_json` field the template references;
 * 3. else the raw payload string (numeric strings coerced to numbers).
 */
export function applyValueTemplate(
  template: string,
  ctx: TemplateContext,
): unknown {
  const evaluated = evaluateValueTemplate(template, ctx);
  if (evaluated !== undefined) return evaluated;

  const field = valueJsonField(template);
  if (field && ctx.value_json && typeof ctx.value_json === 'object') {
    const raw = (ctx.value_json as Record<string, unknown>)[field];
    if (raw !== undefined) return raw;
  }
  return coerceNumericString(ctx.value);
}

function finalize(value: unknown): unknown {
  if (value === MISSING || value === undefined) return undefined;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  return coerceNumericString(value);
}

function coerceNumericString(value: unknown): unknown {
  if (typeof value === 'string' && NUMERIC_STRING.test(value.trim())) {
    return Number(value);
  }
  return value;
}

function walkValueJson(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== 'object') return MISSING;
    const record = current as Record<string, unknown>;
    if (!(key in record)) return MISSING;
    current = record[key];
  }
  return current === undefined ? MISSING : current;
}

// ── Tokenizer + recursive-descent parser ─────────────────────────────────────
//
//   expr     := sum ('|' filter)*
//   filter   := IDENT ('(' expr (',' expr)* ')')?
//   sum      := product (('+'|'-') product)*
//   product  := unary (('*'|'/'|'%') unary)*
//   unary    := '-' unary | primary
//   primary  := NUMBER | STRING | '(' expr ')' | ref
//   ref      := 'value' | 'value_json' ('.' IDENT)*

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'symbol'; value: string }
  | { kind: 'end' };

const SYMBOLS = new Set(['|', '(', ')', '+', '-', '*', '/', '%', '.', ',']);
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;

class ExpressionParser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(
    expr: string,
    private readonly ctx: TemplateContext,
  ) {
    this.tokens = tokenize(expr);
  }

  parseExpression(): unknown {
    let value = this.parseSum();
    while (this.peekSymbol('|')) {
      this.next();
      value = this.applyFilter(value);
    }
    return value;
  }

  expectEnd(): void {
    if (this.peek().kind !== 'end') throw new Error('trailing tokens');
  }

  private parseSum(): unknown {
    let left = this.parseProduct();
    while (this.peekSymbol('+') || this.peekSymbol('-')) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseProduct();
      left =
        op === '+'
          ? toNumber(left) + toNumber(right)
          : toNumber(left) - toNumber(right);
    }
    return left;
  }

  private parseProduct(): unknown {
    let left = this.parseUnary();
    while (
      this.peekSymbol('*') ||
      this.peekSymbol('/') ||
      this.peekSymbol('%')
    ) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseUnary();
      const l = toNumber(left);
      const r = toNumber(right);
      left = op === '*' ? l * r : op === '/' ? l / r : l % r;
    }
    return left;
  }

  private parseUnary(): unknown {
    if (this.peekSymbol('-')) {
      this.next();
      return -toNumber(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const token = this.next();
    if (token.kind === 'number' || token.kind === 'string') return token.value;
    if (token.kind === 'symbol' && token.value === '(') {
      const value = this.parseExpression();
      this.expectSymbol(')');
      return value;
    }
    if (token.kind === 'ident') return this.parseRef(token.value);
    throw new Error('unexpected token');
  }

  private parseRef(name: string): unknown {
    if (name === 'value') return this.ctx.value;
    if (name !== 'value_json') throw new Error(`unknown reference: ${name}`);
    const path: string[] = [];
    while (this.peekSymbol('.')) {
      this.next();
      const segment = this.next();
      if (segment.kind !== 'ident') throw new Error('expected identifier');
      path.push(segment.value);
    }
    return walkValueJson(this.ctx.value_json, path);
  }

  private applyFilter(input: unknown): unknown {
    const name = this.next();
    if (name.kind !== 'ident') throw new Error('expected filter name');
    const args: unknown[] = [];
    if (this.peekSymbol('(')) {
      this.next();
      if (!this.peekSymbol(')')) {
        args.push(this.parseExpression());
        while (this.peekSymbol(',')) {
          this.next();
          args.push(this.parseExpression());
        }
      }
      this.expectSymbol(')');
    }

    switch (name.value) {
      case 'round': {
        const precision = args.length > 0 ? toNumber(args[0]) : 0;
        const factor = 10 ** precision;
        return Math.round(toNumber(input) * factor) / factor;
      }
      case 'int': {
        const n = Number(numericSource(input, args));
        return Number.isNaN(n) ? fallbackArg(args) : Math.trunc(n);
      }
      case 'float': {
        const n = Number(numericSource(input, args));
        return Number.isNaN(n) ? fallbackArg(args) : n;
      }
      case 'abs':
        return Math.abs(toNumber(input));
      case 'default':
        if (args.length === 0) throw new Error('default needs an argument');
        return input === MISSING || input === null ? args[0] : input;
      default:
        throw new Error(`unknown filter: ${name.value}`);
    }
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { kind: 'end' };
  }

  private peekSymbol(symbol: string): boolean {
    const token = this.peek();
    return token.kind === 'symbol' && token.value === symbol;
  }

  private next(): Token {
    const token = this.peek();
    this.pos += 1;
    return token;
  }

  private expectSymbol(symbol: string): void {
    const token = this.next();
    if (token.kind !== 'symbol' || token.value !== symbol) {
      throw new Error(`expected "${symbol}"`);
    }
  }
}

/** Numeric coercion for arithmetic: missing/null/blank/non-numeric → throw. */
function toNumber(value: unknown): number {
  if (value === MISSING || value === null) throw new Error('missing operand');
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error('blank operand');
  }
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error('non-numeric operand');
  return n;
}

/** int/float input: MISSING with no default → throw, so the template aborts. */
function numericSource(input: unknown, args: unknown[]): unknown {
  if (input === MISSING || input === null) {
    if (args.length === 0) throw new Error('missing operand');
    return Number.NaN;
  }
  return input;
}

/** Jinja int/float take an optional default returned on conversion failure. */
function fallbackArg(args: unknown[]): unknown {
  if (args.length === 0) throw new Error('non-numeric operand');
  return args[0];
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (SYMBOLS.has(ch)) {
      tokens.push({ kind: 'symbol', value: ch });
      i += 1;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j += 1;
      const raw = expr.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new Error(`bad number: ${raw}`);
      tokens.push({ kind: 'number', value });
      i = j;
    } else if (ch === "'" || ch === '"') {
      const close = expr.indexOf(ch, i + 1);
      if (close === -1) throw new Error('unterminated string');
      tokens.push({ kind: 'string', value: expr.slice(i + 1, close) });
      i = close + 1;
    } else if (IDENT_START.test(ch)) {
      let j = i;
      while (j < expr.length && IDENT_CHAR.test(expr[j])) j += 1;
      tokens.push({ kind: 'ident', value: expr.slice(i, j) });
      i = j;
    } else {
      throw new Error(`unexpected character: ${ch}`);
    }
  }
  return tokens;
}
