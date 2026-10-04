'use client';

// ASCII trace meter. Turns amber past 50% and pulses red past 75%.

export default function TraceMeter({ value }: { value: number }) {
  const width = 24;
  const filled = Math.round((value / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const tone = value >= 75 ? 'trace-hot' : value >= 50 ? 'trace-warm' : '';
  return (
    <div className={`whitespace-pre text-sm ${tone}`} role="meter" aria-label="trace level" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {`TRACE [${bar}] ${String(value).padStart(3)}%`}
    </div>
  );
}
