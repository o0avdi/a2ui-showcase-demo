import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import TouchAppRounded from '@mui/icons-material/TouchAppRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { ProviderId, ProviderStatus, SampleSummary } from '../../shared/contract.ts';
import type { ConversationEntry, ShowcaseState } from '../app/showcase.ts';
import { fonts } from '../theme.ts';
import { Panel } from './Panel.tsx';

export interface ConversationPanelProps {
  state: ShowcaseState;
  onSubmit: (prompt: string, sampleId?: string) => void;
  onProviderChange: (provider: ProviderId) => void;
  onReset: () => void;
}

const StatusDot = ({ on }: { on: boolean }) => (
  <Box
    component="span"
    aria-hidden
    sx={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      flexShrink: 0,
      bgcolor: on ? 'secondary.main' : 'text.disabled',
    }}
  />
);

function Examples({ samples, onPick }: { samples: SampleSummary[]; onPick: (sample: SampleSummary) => void }) {
  return (
    <Stack spacing={2} sx={{ p: 2.5, pt: 1 }}>
      <Box>
        <Typography variant="h3" component="p" sx={{ mb: 1 }}>
          Describe an interface. An agent builds it.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The agent does not write code. It picks components from a catalog this app already knows how to draw, and
          sends a description of the screen as A2UI messages.
        </Typography>
      </Box>
      <Typography variant="overline" color="text.secondary">
        Try one
      </Typography>
      <Stack spacing={1}>
        {samples.map((sample) => (
          <ButtonBase
            key={sample.id}
            onClick={() => onPick(sample)}
            sx={{
              display: 'block',
              textAlign: 'left',
              p: 1.5,
              borderRadius: '12px',
              border: 1,
              borderColor: 'divider',
              transition: 'border-color 120ms, background-color 120ms',
              '&:hover, &:focus-visible': { borderColor: 'primary.main', bgcolor: 'primary.light' },
            }}
          >
            <Typography variant="subtitle2">{sample.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {sample.prompt}
            </Typography>
          </ButtonBase>
        ))}
      </Stack>
    </Stack>
  );
}

function Entry({ entry }: { entry: ConversationEntry }) {
  if (entry.kind === 'user') {
    return (
      <Box
        sx={{
          alignSelf: 'flex-end',
          maxWidth: '88%',
          px: 1.75,
          py: 1.25,
          borderRadius: '16px 16px 4px 16px',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Typography variant="body2">{entry.text}</Typography>
      </Box>
    );
  }
  if (entry.kind === 'action') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignSelf: 'center', alignItems: 'center', color: 'text.secondary' }}>
        <TouchAppRounded sx={{ fontSize: 16 }} />
        <Typography variant="caption">
          You triggered{' '}
          <Box component="span" sx={{ fontFamily: fonts.mono, color: 'text.primary' }}>
            {entry.action.name}
          </Box>{' '}
          in the interface
        </Typography>
      </Stack>
    );
  }
  if (entry.kind === 'error') {
    return (
      <Alert severity="error" variant="outlined" sx={{ borderRadius: '12px' }}>
        {entry.failure.error.message}
      </Alert>
    );
  }
  const { response } = entry;
  const sample = response.source === 'sample';
  return (
    <Box
      sx={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        px: 1.75,
        py: 1.25,
        borderRadius: '16px 16px 16px 4px',
        bgcolor: '#F1F3F9',
      }}
    >
      <Chip
        size="small"
        label={sample ? 'Prerecorded sample' : response.model}
        sx={{
          mb: 0.75,
          height: 20,
          fontSize: 11,
          bgcolor: sample ? 'warning.light' : 'secondary.light',
          color: sample ? 'warning.main' : 'secondary.main',
        }}
      />
      <Typography variant="body2">{response.text || 'Here is the interface.'}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {sample
          ? 'Replayed from a file. No model generated this.'
          : `Generated in ${(response.elapsedMs / 1000).toFixed(1)} s${response.attempts.length > 1 ? `, after ${response.attempts.length - 1} correction` : ''}.`}
      </Typography>
    </Box>
  );
}

function ProviderPicker({
  providers,
  value,
  onChange,
}: {
  providers: ProviderStatus[];
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
}) {
  const current = providers.find((provider) => provider.id === value);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Select
        size="small"
        variant="standard"
        disableUnderline
        value={providers.length ? value : ''}
        onChange={(event) => onChange(event.target.value as ProviderId)}
        inputProps={{ 'aria-label': 'Model' }}
        renderValue={() => (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <StatusDot on={current?.available ?? false} />
            <Typography variant="caption" sx={{ fontWeight: 650 }} noWrap>
              {current ? `${current.label}${current.model ? ` · ${current.model}` : ''}` : 'Connecting…'}
            </Typography>
          </Stack>
        )}
        sx={{ minWidth: 0, '& .MuiSelect-select': { py: 0.5 } }}
      >
        {providers.map((provider) => (
          <MenuItem key={provider.id} value={provider.id} sx={{ alignItems: 'flex-start', gap: 1.25, maxWidth: 360 }}>
            <Box sx={{ pt: 0.9 }}>
              <StatusDot on={provider.available} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>
                {provider.label}
                {provider.model ? ` · ${provider.model}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal' }}>
                {provider.detail}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
}

export function ConversationPanel({ state, onSubmit, onProviderChange, onReset }: ConversationPanelProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { conversation, busy, status } = state;
  const samples = status?.samples ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [conversation.length, busy]);

  const send = () => {
    if (!draft.trim() || busy) return;
    onSubmit(draft);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <Panel
      title="Conversation"
      actions={
        conversation.length > 0 && (
          <Tooltip title="Start over">
            <span>
              <IconButton size="small" onClick={onReset} disabled={Boolean(busy)} aria-label="Start over">
                <RestartAltRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )
      }
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {state.statusError && (
          <Alert severity="warning" sx={{ mx: 2.5, mb: 1.5, borderRadius: '12px' }}>
            {state.statusError}
          </Alert>
        )}
        {conversation.length === 0 ? (
          <Examples samples={samples} onPick={(sample) => onSubmit(sample.prompt, sample.id)} />
        ) : (
          <Stack spacing={1.5} sx={{ p: 2.5, pt: 1 }} role="log" aria-live="polite" aria-label="Conversation history">
            {conversation.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
            {busy && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                <CircularProgress size={14} thickness={5} />
                <Typography variant="caption">
                  {busy === 'action' ? 'The agent is answering your action…' : 'The agent is composing an interface…'}
                </Typography>
              </Stack>
            )}
            <div ref={endRef} />
          </Stack>
        )}
      </Box>

      <Box sx={{ p: 1.5, pt: 1, flexShrink: 0 }}>
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: '16px',
            bgcolor: '#F7F8FC',
            transition: 'border-color 120ms, box-shadow 120ms',
            '&:focus-within': { borderColor: 'primary.main', boxShadow: '0 0 0 3px rgb(61 79 214 / 14%)' },
          }}
        >
          <InputBase
            multiline
            maxRows={6}
            fullWidth
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe the interface you need…"
            inputProps={{ 'aria-label': 'Describe the interface you need', maxLength: 4000 }}
            sx={{ px: 1.75, pt: 1.5, pb: 0.5, fontSize: 14, lineHeight: 1.5 }}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: 1.75, pr: 1, pb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ProviderPicker providers={status?.providers ?? []} value={state.provider} onChange={onProviderChange} />
            </Box>
            <IconButton
              aria-label="Generate interface"
              onClick={send}
              disabled={!draft.trim() || Boolean(busy)}
              sx={{
                width: 34,
                height: 34,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              }}
            >
              <ArrowUpwardRounded fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
      </Box>
    </Panel>
  );
}
