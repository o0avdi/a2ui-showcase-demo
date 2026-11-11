/**
 * The app's Material UI theme. Everything visual about the shell starts here;
 * the look of generated A2UI content is set in `styles.css`.
 */

import { createTheme } from '@mui/material/styles';

export const fonts = {
  sans: "'Figtree Variable', 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
};

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: '#3D4FD6', light: '#E8EBFC', dark: '#2B3AA8' },
    secondary: { main: '#0B7F73', light: '#DDF3EF' },
    warning: { main: '#A15C00', light: '#FDF0DC' },
    error: { main: '#B3261E' },
    background: { default: '#F2F4FA', paper: '#FFFFFF' },
    text: { primary: '#1A1D29', secondary: '#5A6072' },
    divider: '#E2E6F0',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: fonts.sans,
    h1: { fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h2: { fontSize: '0.9375rem', fontWeight: 700, letterSpacing: '-0.005em' },
    h3: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 },
    subtitle2: { fontWeight: 650 },
    body2: { lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 650 },
    overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.6875rem', lineHeight: 1.6 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 999 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTab: { styleOverrides: { root: { minHeight: 44, minWidth: 0, padding: '8px 12px' } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});
