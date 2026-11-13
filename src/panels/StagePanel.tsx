import CheckRounded from '@mui/icons-material/CheckRounded';
import PriorityHighRounded from '@mui/icons-material/PriorityHighRounded';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { SurfaceView } from '../a2ui/SurfaceView.tsx';
import { componentsOf } from '../a2ui/renderer.ts';
import type { ShowcaseState } from '../app/showcase.ts';
import { Panel } from './Panel.tsx';

type StepState = 'idle' | 'active' | 'done' | 'error';

interface Step {
  label: string;
  caption: string;
  state: StepState;
}

/** The four things that happen on every turn, read off the current state. */
function pipelineSteps(state: ShowcaseState): Step[] {
  const { busy, lastResponse, active, rendererIssues, conversation } = state;
  const asked = conversation.length > 0;
  const failed = lastResponse && !lastResponse.ok ? lastResponse : null;
  const invalid = failed?.error.code === 'invalid_output';
  const succeeded = !busy && lastResponse?.ok ? lastResponse : null;
  const retries = (succeeded?.attempts.length ?? 1) - 1;
  const componentCount = active ? active.rendered.surfaces.reduce((sum, s) => sum + componentsOf(s).length, 0) : 0;

  return [
    {
      label: 'Request',
      caption: busy === 'action' ? 'A2UI action' : asked ? 'Plain language' : 'Prompt or action',
      state: asked ? 'done' : 'idle',
    },
    {
      label: 'Agent',
      caption: busy
        ? 'Composing…'
        : succeeded
          ? succeeded.source === 'sample'
            ? 'Prerecorded reply'
            : `${succeeded.model}`
          : failed && !invalid
            ? 'No reply'
            : 'Writes A2UI',
      state: busy ? 'active' : failed && !invalid ? 'error' : lastResponse ? 'done' : 'idle',
    },
    {
      label: 'Validate',
      caption: succeeded
        ? retries > 0
          ? `Passed after ${retries} correction${retries > 1 ? 's' : ''}`
          : 'Valid for the catalog'
        : invalid
          ? 'Rejected'
          : 'Against the catalog',
      state: busy ? 'idle' : succeeded ? 'done' : invalid ? 'error' : 'idle',
    },
    {
      label: 'Render',
      caption:
        rendererIssues.length > 0
          ? 'Renderer refused it'
          : succeeded && active
            ? `${componentCount} components`
            : 'Real components',
      state: busy ? 'idle' : rendererIssues.length > 0 ? 'error' : succeeded && active ? 'done' : 'idle',
    },
  ];
}

const STEP_COLORS: Record<StepState, { bg: string; fg: string }> = {
  idle: { bg: 'rgb(252 238 9 / 10%)', fg: '#FCEE09' },
  active: { bg: '#FF003C', fg: '#FFFFFF' }, // Edgerunners Crimson
  done: { bg: '#00F0FF', fg: '#000000' },   // Electric Cyan
  error: { bg: '#FF6B00', fg: '#000000' },  // Blaze Orange
};

function Pipeline({ steps }: { steps: Step[] }) {
  return (
    <Box
      component="ol"
      aria-label="How this interface was produced"
      sx={{ display: 'flex', gap: 1, listStyle: 'none', m: 0, px: 2.5, pb: 2 }}
    >
      {steps.map((step, index) => {
        const colors = STEP_COLORS[step.state];
        return (
          <Box
            component="li"
            key={step.label}
            aria-current={step.state === 'active' ? 'step' : undefined}
            sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                bgcolor: colors.bg,
                color: colors.fg,
                transition: 'background-color 200ms',
              }}
            >
              {step.state === 'done' ? (
                <CheckRounded sx={{ fontSize: 15 }} />
              ) : step.state === 'error' ? (
                <PriorityHighRounded sx={{ fontSize: 15 }} />
              ) : (
                index + 1
              )}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.3 }}>
                {step.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1.3 }}
              >
                {step.caption}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function EmptyStage() {
  const points = [
    ['You describe it', 'Ask for a form, a summary, a list. Plain language is enough.'],
    ['The agent composes it', 'It answers with A2UI: a description of a screen built only from catalog components.'],
    ['This app draws it', 'The message is checked against the catalog, then rendered with real components.'],
  ] as const;
  return (
    <Stack spacing={3} sx={{ maxWidth: 440, textAlign: 'center', alignItems: 'center' }}>
      <Box>
        <Typography variant="h3" component="p">
          Nothing on stage yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Send a prompt from the conversation and the generated interface appears here, live and interactive.
        </Typography>
      </Box>
      <Stack spacing={1.5} sx={{ textAlign: 'left', width: '100%' }}>
        {points.map(([title, body], index) => (
          <Stack
            key={title}
            direction="row"
            spacing={1.5}
            sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
          >
            <Typography variant="subtitle2" color="primary" sx={{ width: 16 }}>
              {index + 1}
            </Typography>
            <Box>
              <Typography variant="subtitle2">{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {body}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

export function StagePanel({ state }: { state: ShowcaseState }) {
  const { active, busy } = state;
  const surfaces = active?.rendered.surfaces ?? [];
  const sample = active?.response.source === 'sample';

  return (
    <Panel
      title="Generated interface"
      actions={
        active && (
          <Chip
            size="small"
            label={sample ? 'Prerecorded sample, not generated live' : `Generated live by ${active.response.model}`}
            sx={{
              bgcolor: sample ? 'warning.light' : 'secondary.light',
              color: sample ? 'warning.main' : 'secondary.main',
            }}
          />
        )
      }
    >
      <Pipeline steps={pipelineSteps(state)} />
      <Box sx={{ height: 4, flexShrink: 0 }}>{busy && <LinearProgress aria-label="Waiting for the agent" />}</Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          placeItems: surfaces.length ? 'start center' : 'center',
          p: { xs: 2, md: 4 },
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          backgroundImage: 'radial-gradient(#D9DEEA 1px, transparent 1px)',
          '[data-theme="dark"] &': {
          backgroundImage: 'none',
        },
          backgroundSize: '20px 20px',
        }}
      >
        {surfaces.length === 0 ? (
          <EmptyStage />
        ) : (
          <Box
            sx={{
              width: '100%',
              maxWidth: 560,
              opacity: busy ? 0.55 : 1,
              pointerEvents: busy ? 'none' : 'auto',
              transition: 'opacity 200ms',
            }}
            aria-busy={Boolean(busy)}
          >
            {surfaces.map((surface) => (
              // A new turn is a new renderer, so the surface is remounted, not patched.
              <SurfaceView key={`${active!.id}-${surface.id}`} surface={surface} />
            ))}
          </Box>
        )}
      </Box>
    </Panel>
  );
}
