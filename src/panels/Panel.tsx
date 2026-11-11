import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** The rounded container the three panels share: a header and a body that scrolls. */
export function Panel({
  title,
  label,
  actions,
  children,
  component = 'section',
}: {
  title: string;
  /** Accessible name of the region, when the title alone is not enough. */
  label?: string;
  actions?: ReactNode;
  children: ReactNode;
  component?: 'section' | 'aside';
}) {
  return (
    <Paper
      component={component}
      aria-label={label ?? title}
      variant="outlined"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, borderRadius: '20px', overflow: 'hidden' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, minHeight: 56, flexShrink: 0 }}>
        <Typography variant="h2" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {actions}
      </Box>
      {children}
    </Paper>
  );
}
