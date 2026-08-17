/**
 * Renderer-side transport for GitHub backup/sync.
 *
 * Follows the same dual-transport convention as
 * `excalidraw-app/data/workspaceTransport.ts`: check for the Electron bridge
 * first, and degrade gracefully without it. Unlike workspace persistence
 * there is no browser fallback to fall back *to* — git needs a filesystem —
 * so outside the desktop app every call reports `isSupported: false` and the
 * Settings panel explains that instead of failing.
 *
 * A `useGithubSyncStatus` hook lives here too, so the rail badge and the
 * Settings panel share one subscription to the main process's status pushes.
 */

import { useCallback, useEffect, useState } from "react";

import {
  createDisconnectedStatus,
  type GithubConflictResolution,
  type GithubConnectInput,
  type GithubSyncSchedule,
  type GithubSyncStatus,
} from "./githubSyncTypes";

const bridge = () => window.electronApp?.githubSync ?? null;

export const isGithubSyncSupported = () => !!bridge();

const unsupported = () => createDisconnectedStatus(false);

export const getGithubSyncStatus = async (): Promise<GithubSyncStatus> =>
  (await bridge()?.getStatus()) ?? unsupported();

export const connectGithubSync = async (
  input: GithubConnectInput,
): Promise<GithubSyncStatus> =>
  (await bridge()?.connect(input)) ?? unsupported();

export const disconnectGithubSync = async (): Promise<GithubSyncStatus> =>
  (await bridge()?.disconnect()) ?? unsupported();

export const syncGithubNow = async (): Promise<GithubSyncStatus> =>
  (await bridge()?.syncNow()) ?? unsupported();

export const resolveGithubSyncConflict = async (
  resolution: GithubConflictResolution,
): Promise<GithubSyncStatus> =>
  (await bridge()?.resolveConflict(resolution)) ?? unsupported();

export const updateGithubSyncPreferences = async (patch: {
  schedule?: GithubSyncSchedule;
  syncOnStart?: boolean;
}): Promise<GithubSyncStatus> =>
  (await bridge()?.updatePreferences(patch)) ?? unsupported();

/**
 * Live sync status. Seeds from the main process on mount, then follows the
 * `github-sync:changed` pushes — which is what makes a scheduled sync (or
 * one started from another surface) update every badge at once.
 */
export const useGithubSyncStatus = () => {
  const [status, setStatus] = useState<GithubSyncStatus>(() =>
    createDisconnectedStatus(isGithubSyncSupported()),
  );

  useEffect(() => {
    let isMounted = true;

    void getGithubSyncStatus()
      .then((next) => {
        if (isMounted) {
          setStatus(next);
        }
      })
      .catch((error) => {
        console.error("[github-sync] unable to read status", error);
      });

    const unsubscribe = bridge()?.onStatusChange((next) => {
      if (isMounted) {
        setStatus(next);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  const refresh = useCallback(async () => {
    const next = await getGithubSyncStatus();
    setStatus(next);
    return next;
  }, []);

  return { status, setStatus, refresh };
};
