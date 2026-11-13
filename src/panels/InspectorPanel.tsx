import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useMemo, useState, type ReactNode } from 'react';

import type { CatalogRegistry, LoadedCatalog } from '../a2ui/catalogs.ts';
import { componentsOf, type RenderedComponent } from '../a2ui/renderer.ts';
import type { LogEvent, ShowcaseState } from '../app/showcase.ts';
import { fonts } from '../theme.ts';
import { JsonView } from './JsonView.tsx';
import { Panel } from './Panel.tsx';

const TABS = ['Messages', 'Components', 'Data', 'Events', 'Issues'] as const;
type TabName = (typeof TABS)[number];

const Hint = ({ children }: { children: ReactNode }) => (
  <Typography variant="body2" color="text.secondary">
    {children}
  </Typography>
);

const Mono = ({ children }: { children: ReactNode }) => (
  <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.85em', wordBreak: 'break-all' }}>
    {children}
  </Box>
);

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Typography variant="overline" color="text.secondary" component="h3" sx={{ m: 0 }}>
    {children}
  </Typography>
);

/** A row that opens to show JSON. Used for components, events and raw model output. */
function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ border: 1, borderColor: 'divider', borderRadius: '12px !important', '&::before': { display: 'none' } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded fontSize="small" />}
        sx={{ minHeight: 40, px: 1.5, '& .MuiAccordionSummary-content': { my: 0.75, minWidth: 0, alignItems: 'center', gap: 1 } }}
      >
        {summary}
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1, pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

function MessagesTab({ state }: { state: ShowcaseState }) {
  const { active, lastResponse } = state;
  const attempts = lastResponse?.attempts ?? [];
  if (!active && attempts.length === 0) {
    return <Hint>The A2UI messages behind the interface appear here once the agent replies.</Hint>;
  }
  return (
    <Stack spacing={2}>
      {active && (
        <Stack spacing={1}>
          <SectionTitle>A2UI v1.0 messages on stage</SectionTitle>
          <Hint>
            {active.response.format === 'express'
              ? 'The model wrote these in A2UI Express, the SDK’s compact shorthand. The SDK compiled and validated them into the wire format below.'
              : 'This is exactly what the renderer was given: a description of the screen, not code.'}
          </Hint>
          <JsonView value={active.response.messages} label="A2UI messages" />
        </Stack>
      )}
      {attempts.length > 0 && (
        <Stack spacing={1}>
          <SectionTitle>{lastResponse?.ok && lastResponse.source === 'sample' ? 'Recorded reply' : 'Raw model output'}</SectionTitle>
          {attempts.map((attempt, index) => (
            <Disclosure
              key={index}
              summary={
                <>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    Attempt {index + 1}
                  </Typography>
                  <Chip
                    size="small"
                    color={attempt.error ? 'error' : 'success'}
                    variant="outlined"
                    label={attempt.error ? `Rejected: ${attempt.error.kind}` : 'Accepted'}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                </>
              }
            >
              <Box
                component="pre"
                tabIndex={0}
                sx={{ m: 0, p: 1.5, borderRadius: '8px', bgcolor: 'background.default', border: 1, borderColor: 'divider', fontFamily: fonts.mono, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}
              >
                {attempt.rawOutput || '(empty)'}
              </Box>
            </Disclosure>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ComponentsTab({ catalog, components }: { catalog: LoadedCatalog | undefined; components: RenderedComponent[] }) {
  const used = useMemo(() => {
    const counts = new Map<string, number>();
    for (const component of components) counts.set(component.type, (counts.get(component.type) ?? 0) + 1);
    return counts;
  }, [components]);

  if (!catalog) return <Alert severity="error">No catalog could be loaded. See the Issues tab.</Alert>;
  const names = [...catalog.catalog.components.keys()];
  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <SectionTitle>Active catalog</SectionTitle>
        <Box>
          <Typography variant="subtitle2">{catalog.title}</Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            <Mono>{catalog.id}</Mono>
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            {names.length} components and {catalog.catalog.functions.size} functions, loaded from <Mono>{catalog.source}</Mono>
          </Typography>
        </Box>
        <Hint>The agent may only use what is listed here. Highlighted components are in the interface on stage.</Hint>
        <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
          {names.map((name) => {
            const count = used.get(name);
            return (
              <Chip
                key={name}
                size="small"
                label={count ? `${name} × ${count}` : name}
                color={count ? 'primary' : 'default'}
                variant={count ? 'filled' : 'outlined'}
              />
            );
          })}
        </Stack>
      </Stack>
      {components.length > 0 && (
        <Stack spacing={1}>
          <SectionTitle>Components on stage ({components.length})</SectionTitle>
          {components.map((component) => (
            <Disclosure
              key={component.id}
              summary={
                <>
                  <Chip size="small" label={component.type} sx={{ height: 20, fontSize: 11 }} />
                  <Typography variant="body2" noWrap>
                    <Mono>{component.id}</Mono>
                  </Typography>
                </>
              }
            >
              <JsonView value={component.properties} label={`Properties of ${component.id}`} />
            </Disclosure>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

const EVENT_COLORS: Record<LogEvent['kind'], 'default' | 'primary' | 'success' | 'error'> = {
  prompt: 'default',
  response: 'success',
  action: 'primary',
  error: 'error',
};

function EventsTab({ events }: { events: LogEvent[] }) {
  if (events.length === 0) {
    return <Hint>Prompts, agent replies and the actions raised by generated components are logged here.</Hint>;
  }
  return (
    <Stack spacing={1}>
      {events.map((event) => (
        <Disclosure
          key={event.id}
          summary={
            <>
              <Chip size="small" variant="outlined" color={EVENT_COLORS[event.kind]} label={event.kind} sx={{ height: 20, fontSize: 11 }} />
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {event.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: fonts.mono }}>
                {new Date(event.at).toLocaleTimeString([], { hour12: false })}
              </Typography>
            </>
          }
        >
          <JsonView value={event.detail ?? null} label={`Details of ${event.title}`} />
        </Disclosure>
      ))}
    </Stack>
  );
}

function IssuesTab({ state, registry }: { state: ShowcaseState; registry: CatalogRegistry }) {
  const rejected = (state.lastResponse?.attempts ?? []).flatMap((attempt, index) =>
    attempt.error ? [{ attempt: index + 1, error: attempt.error }] : [],
  );
  const failure = state.lastResponse && !state.lastResponse.ok ? state.lastResponse : null;
  if (!failure && rejected.length + state.rendererIssues.length + registry.problems.length === 0) {
    return <Hint>No issues. Every message on stage validated against the catalog before it was rendered.</Hint>;
  }
  return (
    <Stack spacing={1.5}>
      {failure && (
        <Alert severity="error">
          <Typography variant="subtitle2">Last turn failed ({failure.error.code})</Typography>
          {failure.error.message}
        </Alert>
      )}
      {rejected.map(({ attempt, error }) => (
        <Alert key={attempt} severity="warning">
          <Typography variant="subtitle2">
            Attempt {attempt} rejected by the validator ({error.kind})
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {error.issues.map((issue, index) => (
              <li key={index}>
                {issue.message}
                {issue.path && (
                  <>
                    {' '}
                    at <Mono>{issue.path}</Mono>
                  </>
                )}
              </li>
            ))}
          </Box>
        </Alert>
      ))}
      {state.rendererIssues.map((issue, index) => (
        <Alert key={index} severity="error">
          <Typography variant="subtitle2">The renderer refused a message</Typography>
          {issue.message}
        </Alert>
      ))}
      {registry.problems.map((problem) => (
        <Alert key={problem.source} severity="warning">
          <Typography variant="subtitle2">
            Catalog not loaded: <Mono>{problem.source}</Mono>
          </Typography>
          {problem.message}
        </Alert>
      ))}
    </Stack>
  );
}

export function InspectorPanel({ state, registry }: { state: ShowcaseState; registry: CatalogRegistry }) {
  const [tab, setTab] = useState<TabName>('Messages');
  const surface = state.active?.rendered.surfaces[0];
  const components = useMemo(() => (surface ? componentsOf(surface) : []), [surface]);
  const catalog = registry.catalogs.find((loaded) => loaded.id === surface?.catalog.id) ?? registry.catalogs[0];
  const issueCount =
    (state.lastResponse?.attempts.filter((attempt) => attempt.error).length ?? 0) +
    (state.lastResponse && !state.lastResponse.ok ? 1 : 0) +
    state.rendererIssues.length +
    registry.problems.length;

  return (
    <Panel title="Inspector" label="Developer inspector" component="aside">
      <Tabs
        value={tab}
        onChange={(_event, next: TabName) => setTab(next)}
        variant="scrollable"
        scrollButtons={false}
        aria-label="Inspector views"
        sx={{ px: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        {TABS.map((name) => (
          <Tab
            key={name}
            value={name}
            id={`inspector-tab-${name}`}
            aria-controls="inspector-tabpanel"
            label={
              name === 'Issues' && issueCount > 0 ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                  Issues
                  <Box
                    component="span"
                    aria-label={`${issueCount} open`}
                    sx={{ px: 0.75, borderRadius: '999px', bgcolor: 'error.main', color: '#fff', fontSize: 11, lineHeight: '18px' }}
                  >
                    {issueCount}
                  </Box>
                </Box>
              ) : (
                name
              )
            }
          />
        ))}
      </Tabs>
      <Box
        role="tabpanel"
        id="inspector-tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}
      >
        {tab === 'Messages' && <MessagesTab state={state} />}
        {tab === 'Components' && <ComponentsTab catalog={catalog} components={components} />}
        {tab === 'Data' && (
          <Stack spacing={1}>
            <SectionTitle>Data model</SectionTitle>
            <Hint>
              Inputs are bound to paths in this store. Type in the interface and it changes here, with no round trip to
              the model.
            </Hint>
            <JsonView value={state.dataModel} label="Data model" />
          </Stack>
        )}
        {tab === 'Events' && <EventsTab events={state.events} />}
        {tab === 'Issues' && <IssuesTab state={state} registry={registry} />}
      </Box>
    </Panel>
  );
}
