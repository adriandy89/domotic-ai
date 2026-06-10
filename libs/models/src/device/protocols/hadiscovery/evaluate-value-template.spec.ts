import {
  applyValueTemplate,
  evaluateValueTemplate,
} from './evaluate-value-template';

describe('evaluateValueTemplate — identity templates', () => {
  it('returns the referenced field preserving its type', () => {
    expect(
      evaluateValueTemplate('{{value_json.leq_db}}', {
        value: '{"leq_db":42.1}',
        value_json: { leq_db: 42.1 },
      }),
    ).toBe(42.1);
  });

  it('tolerates spaces (zwave-js-ui style)', () => {
    expect(
      evaluateValueTemplate('{{ value_json.value }}', {
        value: '{"value":23.5,"time":1}',
        value_json: { value: 23.5, time: 1 },
      }),
    ).toBe(23.5);
  });

  it('keeps non-numeric strings as strings', () => {
    expect(
      evaluateValueTemplate('{{value_json.sound_class}}', {
        value: '{"sound_class":"speech"}',
        value_json: { sound_class: 'speech' },
      }),
    ).toBe('speech');
  });

  it('coerces numeric strings to numbers', () => {
    expect(
      evaluateValueTemplate('{{value_json.temp}}', {
        value: '{"temp":"21.5"}',
        value_json: { temp: '21.5' },
      }),
    ).toBe(21.5);
  });

  it('preserves booleans', () => {
    expect(
      evaluateValueTemplate('{{value_json.occupancy}}', {
        value: '{"occupancy":true}',
        value_json: { occupancy: true },
      }),
    ).toBe(true);
  });

  it('returns undefined when the field is missing', () => {
    expect(
      evaluateValueTemplate('{{value_json.gone}}', {
        value: '{}',
        value_json: {},
      }),
    ).toBeUndefined();
  });

  it('walks nested paths', () => {
    expect(
      evaluateValueTemplate('{{value_json.a.b}}', {
        value: '{"a":{"b":7}}',
        value_json: { a: { b: 7 } },
      }),
    ).toBe(7);
  });
});

describe('evaluateValueTemplate — arithmetic and filters', () => {
  const ctx = (value_json: unknown) => ({
    value: JSON.stringify(value_json),
    value_json,
  });

  it('evaluates the real sound-sensor template: (x*100)|round(1)', () => {
    expect(
      evaluateValueTemplate(
        '{{(value_json.band_bass*100)|round(1)}}',
        ctx({ band_bass: 0.254 }),
      ),
    ).toBe(25.4);
  });

  it('round without args rounds to integer', () => {
    expect(
      evaluateValueTemplate('{{value_json.x|round}}', ctx({ x: 2.6 })),
    ).toBe(3);
  });

  it('respects operator precedence and parentheses', () => {
    expect(evaluateValueTemplate('{{value_json.x*2+1}}', ctx({ x: 2 }))).toBe(
      5,
    );
    expect(evaluateValueTemplate('{{(value_json.x+1)*2}}', ctx({ x: 2 }))).toBe(
      6,
    );
  });

  it('supports unary minus, division and modulo', () => {
    expect(evaluateValueTemplate('{{-value_json.x}}', ctx({ x: 3 }))).toBe(-3);
    expect(evaluateValueTemplate('{{value_json.x/10}}', ctx({ x: 25 }))).toBe(
      2.5,
    );
    expect(evaluateValueTemplate('{{value_json.x % 2}}', ctx({ x: 5 }))).toBe(
      1,
    );
  });

  it('supports int, float and abs filters', () => {
    expect(
      evaluateValueTemplate('{{value_json.x|int}}', ctx({ x: '12.7' })),
    ).toBe(12);
    expect(
      evaluateValueTemplate('{{value_json.x|float}}', ctx({ x: '12.7' })),
    ).toBe(12.7);
    expect(evaluateValueTemplate('{{value_json.x|abs}}', ctx({ x: -3 }))).toBe(
      3,
    );
  });

  it('default() replaces a missing field', () => {
    expect(
      evaluateValueTemplate('{{value_json.gone|default(0)}}', ctx({})),
    ).toBe(0);
    expect(
      evaluateValueTemplate('{{value_json.gone|default("n/a")}}', ctx({})),
    ).toBe('n/a');
  });

  it('multiplies numeric-string operands', () => {
    expect(
      evaluateValueTemplate('{{value_json.x*100}}', ctx({ x: '0.25' })),
    ).toBe(25);
  });

  it('returns undefined when an arithmetic operand is missing or NaN', () => {
    expect(
      evaluateValueTemplate('{{value_json.gone*100}}', ctx({})),
    ).toBeUndefined();
    expect(
      evaluateValueTemplate('{{value_json.x*100}}', ctx({ x: 'abc' })),
    ).toBeUndefined();
  });
});

describe('evaluateValueTemplate — the raw `value` reference', () => {
  it('returns plain string payloads as-is', () => {
    expect(evaluateValueTemplate('{{value}}', { value: 'ON' })).toBe('ON');
  });

  it('coerces numeric payloads', () => {
    expect(evaluateValueTemplate('{{value}}', { value: '12.5' })).toBe(12.5);
  });
});

describe('evaluateValueTemplate — unsupported syntax returns undefined', () => {
  const ctx = { value: '{"x":1}', value_json: { x: 1 } };

  it.each([
    ['statement blocks', '{% if value_json.x %}1{% endif %}'],
    ['HA functions', "{{ states('sensor.x') }}"],
    ['text around the mustache', 'val: {{value_json.x}}'],
    ['bracket access', '{{value_json["x"]}}'],
    ['unknown filters', '{{ value_json.x | is_defined }}'],
    ['unknown references', '{{ this.x }}'],
  ])('%s', (_label, template) => {
    expect(evaluateValueTemplate(template, ctx)).toBeUndefined();
  });
});

describe('applyValueTemplate — graceful fallback chain', () => {
  it('returns the evaluated result when the template is supported', () => {
    expect(
      applyValueTemplate('{{(value_json.x*100)|round(1)}}', {
        value: '{"x":0.254}',
        value_json: { x: 0.254 },
      }),
    ).toBe(25.4);
  });

  it('falls back to the raw value_json field on unsupported templates', () => {
    expect(
      applyValueTemplate('{{ value_json.x | is_defined }}', {
        value: '{"x":0.25}',
        value_json: { x: 0.25 },
      }),
    ).toBe(0.25);
  });

  it('falls back to the raw payload when nothing else applies', () => {
    expect(applyValueTemplate('{{ this.x }}', { value: 'ON' })).toBe('ON');
    expect(applyValueTemplate('{{ this.x }}', { value: '17' })).toBe(17);
  });
});
