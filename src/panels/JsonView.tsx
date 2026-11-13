import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { Fragment, useMemo } from 'react';

import { fonts } from '../theme.ts';

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const LIGHT_COLORS = {
  key: 'primary.dark',
  string: 'secondary.main',
  literal: '#8A3FB5',
  number: 'warning.main',
} as const;

const DARK_COLORS = {
  key: '#00F0FF',     // Electric Cyan
  string: '#FF003C',  // Edgerunners Crimson
  literal: '#FF6B00', // Blaze Orange
  number: '#FCEE09', // Yellow
} as const;

/** Pretty-printed JSON with theme-aware syntax colouring. */
export function JsonView({ value, label }: { value: unknown; label: string }) {
  const theme = useTheme();
  const colors = theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const parts = useMemo(() => {
    const text = JSON.stringify(value, null, 2) ?? 'undefined';
    const out: Array<{ text: string; color?: string }> = [];
    let last = 0;
    for (const match of text.matchAll(TOKEN)) {
      if (match.index > last) out.push({ text: text.slice(last, match.index) });
      const [, quoted, colon, literal] = match;
      if (quoted && colon) out.push({ text: quoted, color: colors.key }, { text: colon });
      else if (quoted) out.push({ text: quoted, color: colors.string });
      else out.push({ text: match[0], color: literal ? colors.literal : colors.number });
      last = match.index + match[0].length;
    }
    out.push({ text: text.slice(last) });
    return out;
  }, [value, colors]);

  return (
    <Box
      component="pre"
      aria-label={label}
      tabIndex={0}
      sx={{
        m: 0,
        p: 1.5,
        borderRadius: '8px',
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        color: theme.palette.mode === 'dark' ? '#FCEE09' : 'text.primary', // Yellow braces/punctuation in dark mode
        fontFamily: fonts.mono,
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'auto',
      }}
    >
      {parts.map((part, index) =>
        part.color ? (
          <Box key={index} component="span" sx={{ color: part.color }}>
            {part.text}
          </Box>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </Box>
  );
}