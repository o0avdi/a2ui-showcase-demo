import TuneRounded from '@mui/icons-material/TuneRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme, useTheme } from '@mui/material/styles';
import { useState } from 'react';

import { registry } from '../a2ui/registry.ts';
import { ConversationPanel } from '../panels/ConversationPanel.tsx';
import { InspectorPanel } from '../panels/InspectorPanel.tsx';
import { StagePanel } from '../panels/StagePanel.tsx';
import { useShowcase } from './useShowcase.ts';

type View = 'conversation' | 'stage' | 'inspector';

function Mark() {
  return (
    <Box
      aria-hidden
      sx={{ width: 30, height: 30, borderRadius: '9px', bgcolor: '#3D4FD6', display: 'grid', placeItems: 'center' }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#fff" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="#fff" fillOpacity=".55" />
        <rect x="1" y="9" width="14" height="6" rx="1.5" fill="#fff" fillOpacity=".8" />
      </svg>
    </Box>
  );
}

export function App() {
  const { showcase, state } = useShowcase();
  const theme = useTheme();
  const { mode, setMode } = useColorScheme();
  const isDark= mode == 'dark';
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  const [view, setView] = useState<View>('conversation');
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const conversation = (
    <ConversationPanel
      state={state}
      onSubmit={(prompt, sampleId) => {
        showcase.submitPrompt(prompt, sampleId);
        setView('stage');
      }}
      onProviderChange={(provider) => showcase.setProvider(provider)}
      onReset={() => showcase.reset()}
    />
  );
  const stage = <StagePanel state={state} />;
  const inspector = <InspectorPanel state={state} registry={registry} />;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, height: 60, flexShrink: 0 }}>
        <Mark />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h1" noWrap>
            A2UI Showcase
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          University of Louisville capstone demo. Not an official Google product.
        </Typography>
        <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <IconButton
            size="small"
            onClick={() => setMode(isDark ? 'light' : 'dark')}
            aria-label="Toggle color theme"
            sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            {isDark ? <LightModeRounded fontSize="small" /> : <DarkModeRounded fontSize="small" />}
          </IconButton>
        </Tooltip>
        {!wide && !narrow && (
          <Button size="small" variant="outlined" startIcon={<TuneRounded />} onClick={() => setInspectorOpen(true)}>
            Inspector
          </Button>
        )}
      </Box>

      {narrow && (
        <Tabs
          value={view}
          onChange={(_event, next: View) => setView(next)}
          variant="fullWidth"
          aria-label="Panels"
          sx={{ px: 2, flexShrink: 0 }}
        >
          <Tab value="conversation" label="Conversation" />
          <Tab value="stage" label="Interface" />
          <Tab value="inspector" label="Inspector" />
        </Tabs>
      )}

      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gap: 2,
          p: 2,
          pt: narrow ? 1.5 : 0,
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns: wide
            ? '340px minmax(0, 1fr) 400px'
            : narrow
              ? 'minmax(0, 1fr)'
              : '340px minmax(0, 1fr)',
        }}
      >
        {(!narrow || view === 'conversation') && conversation}
        {(!narrow || view === 'stage') && stage}
        {(wide || (narrow && view === 'inspector')) && inspector}
      </Box>

      {!wide && !narrow && (
        <Drawer
          anchor="right"
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          slotProps={{ paper: { sx: { width: 440, maxWidth: '100vw', p: 1.5, bgcolor: 'background.default', display: 'grid' } } }}
        >
          {inspector}
        </Drawer>
      )}
    </Box>
  );
}
