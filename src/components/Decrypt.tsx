'use client';

// Text that scrambles and then settles on its real letters, like a decrypt. The first render shows the final text,
// so the static export and the first paint agree. Reduced motion skips the effect.

import { useEffect, useState } from 'react';

const GLYPHS = '#%&@$<>/\\|=+*01';
const STEP_MS = 40;
const STEPS = 14;

export default function Decrypt({ text }: { text: string }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const reduce = document.documentElement.classList.contains('reduce-motion');
    if (reduce) {
      setShown(text);
      return;
    }
    let step = 0;
    const timer = window.setInterval(() => {
      step++;
      const settled = Math.floor((step / STEPS) * text.length);
      setShown(
        text
          .split('')
          .map((ch, i) => {
            if (ch === ' ' || i < settled) return ch;
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join(''),
      );
      if (step >= STEPS) {
        window.clearInterval(timer);
        setShown(text);
      }
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [text]);

  return <>{shown}</>;
}
