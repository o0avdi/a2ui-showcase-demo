import { useEffect, useState, useSyncExternalStore } from 'react';

import { registry } from '../a2ui/registry.ts';
import { fetchStatus, requestTurn } from './api.ts';
import { Showcase, type ShowcaseState } from './showcase.ts';

const STATUS_REFRESH_MS = 20_000;

/** The app's single `Showcase`, its current state, and a status that stays fresh. */
export function useShowcase(): { showcase: Showcase; state: ShowcaseState } {
  const [showcase] = useState(() => new Showcase({ catalogs: registry.catalogs, fetchStatus, requestTurn }));
  const state = useSyncExternalStore(showcase.subscribe, showcase.getState);

  useEffect(() => {
    void showcase.loadStatus();
    const timer = setInterval(() => void showcase.loadStatus(), STATUS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [showcase]);

  return { showcase, state };
}
