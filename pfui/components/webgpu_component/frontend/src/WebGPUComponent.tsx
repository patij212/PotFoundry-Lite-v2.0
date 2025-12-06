import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ComponentProps,
  Streamlit,
  withStreamlitConnection,
} from 'streamlit-component-lib';

import { useDebouncedMerge } from './hooks/useDebouncedMerge';
import { mount, WebGPUController, WebGPUEvent } from './webgpu_core';

type LiveControlField = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  sessionKey: string;
  paramKey?: string;
  paramScale?: number;
  group?: string;
  styleParamIndex?: number;
  styleParamScale?: number;
};

type LiveControlsConfig = {
  enabled: boolean;
  fields?: LiveControlField[];
};

type ActiveLiveControls = LiveControlsConfig & { fields: LiveControlField[] };

const buildLiveDefaults = (config?: ActiveLiveControls): Record<string, number> => {
  if (!config?.enabled) {
    return {};
  }
  const defaults: Record<string, number> = {};
  const fields = Array.isArray(config.fields) ? config.fields : [];
  for (const field of fields) {
    const numeric = Number(field.value);
    defaults[field.id] = Number.isFinite(numeric) ? numeric : field.min;
  }
  return defaults;
};

type LibraryDesign = {
  id: string;
  title: string;
  style: string;
  created_at: string;
  thumb_url?: string;
  stl_url?: string;
  license?: string;
  tags?: string[];
  size?: Record<string, number>;
  opts?: Record<string, unknown>;
};

type LibraryData = {
  action: 'list' | 'publish' | 'loadDesign';
  page?: number;
  designs?: LibraryDesign[];
  hasMore?: boolean;
  success?: boolean;
  id?: string;
  duplicate?: boolean;
  error?: string | null;
};

type ComponentArgs = {
  params?: Record<string, unknown>;
  height_px: number;
  background_color: string;
  background_rgba?: number[] | null;
  background_mode?: string | null;
  gradient?: string[] | null;
  widget_key: string;
  canvas_id?: string;
  debug_mode?: boolean;
  live_controls?: LiveControlsConfig;
  library_data?: LibraryData | null;
};

type Props = Omit<ComponentProps, 'args'> & { args: ComponentArgs };

type StreamlitEventRecord = {
  type: string;
  payload?: Record<string, unknown> | null;
  seq: number;
};

const INITIAL_STATUS = 'Initializing WebGPU preview...';
const STYLE_PARAM_CAPACITY = 48;

const deriveAutoRotateDefault = (source?: Record<string, unknown>): boolean => {
  const raw = source ? (source['autoRotate'] as unknown) : undefined;
  return typeof raw === 'boolean' ? raw : false;
};

const getParamUpdateNonce = (params: Record<string, unknown>): number | null => {
  const raw = (params as { paramUpdateNonce?: unknown }).paramUpdateNonce;
  return typeof raw === 'number' ? (raw as number) : null;
};

const WebGPUComponentBase = ({ args }: Props): JSX.Element => {
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[PotFoundry][WebGPU] live_controls args', args.live_controls);
  }
  const normalizedParams = useMemo<Record<string, unknown>>(() => {
    const base = { ...(args.params ?? {}) };
    if (Array.isArray(args.gradient) && base.gradient === undefined) {
      base.gradient = args.gradient;
    }
    return base;
  }, [args.params, args.gradient]);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<WebGPUController | null>(null);
  const initialParamsRef = useRef<Record<string, unknown>>(normalizedParams);
  const currentParamsRef = useRef<Record<string, unknown>>(normalizedParams);
  const lastParamNonceRef = useRef<number | null>(getParamUpdateNonce(normalizedParams));
  const heightRef = useRef<number>(args.height_px);
  const readySentRef = useRef<boolean>(false);
  const readyGateOpenRef = useRef<boolean>(false);
  const readyGateTimerRef = useRef<number | null>(null);
  const pendingRecordsRef = useRef<StreamlitEventRecord[]>([]);
  const eventSeqRef = useRef(0);
  const mountedRef = useRef<boolean>(true);
  // Keep a small client-side cache of the last emitted message to allow
  // deduping of identical payloads and a tiny cooldown to avoid bursts.
  const lastEmitJsonRef = useRef<string | null>(null);
  const lastEmitTsRef = useRef<number>(0);
  const EMIT_DEDUP_MS = 400; // ms: ignore duplicate payloads within this window
  const EMIT_COOLDOWN_MS = 40; // ms: minimal inter-emit spacing
  const pendingFlushTimerRef = useRef<number | null>(null);
  const fallbackCanvasId = useMemo(() => {
    const suffix = args.widget_key?.trim() ? `${args.widget_key.trim()}-canvas` : 'wgpu-canvas';
    return suffix;
  }, [args.widget_key]);
  const canvasId = useMemo(() => {
    const candidate = typeof args.canvas_id === 'string' ? args.canvas_id.trim() : '';
    return candidate.length > 0 ? candidate : fallbackCanvasId;
  }, [args.canvas_id, fallbackCanvasId]);

  const [pendingParams, setPendingParams] = useState<Record<string, unknown> | null>(
    normalizedParams
  );

  const [autoRotateEnabled, setAutoRotateEnabled] = useState<boolean>(() =>
    deriveAutoRotateDefault(normalizedParams)
  );
  const normalizedAutoRotate = useMemo(() => {
    const raw = normalizedParams.autoRotate;
    return typeof raw === 'boolean' ? (raw as boolean) : undefined;
  }, [normalizedParams]);
  const propAutoRotateRef = useRef<boolean | undefined>(normalizedAutoRotate);

  const debugMode = Boolean(args.debug_mode);
  const liveControls = useMemo<ActiveLiveControls | undefined>(() => {
    const config = args.live_controls;
    if (config && config.enabled) {
      const fields = Array.isArray(config.fields) ? config.fields : [];
      return { ...config, fields };
    }
    return undefined;
  }, [args.live_controls]);

  const [liveValues, setLiveValues] = useState<Record<string, number>>(() => buildLiveDefaults(liveControls));
  const [hasLiveDraft, setHasLiveDraft] = useState<boolean>(false);

  const pendingLiveParamsRef = useRef<Record<string, unknown>>({});
  const pendingLiveFieldsRef = useRef<Record<string, number>>({});
  const lastCommitSigRef = useRef<string | null>(null);
  const lastCommitTsRef = useRef<number | null>(null);
  const COMMIT_COOLDOWN_MS = 200;
  const previewFlushTimerRef = useRef<number | null>(null);
  const livePointerActiveRef = useRef<boolean>(false);

  const discardPendingLiveBatch = useCallback(
    (options?: { suppressState?: boolean }) => {
      pendingLiveParamsRef.current = {};
      pendingLiveFieldsRef.current = {};
      if (!options?.suppressState) {
        setHasLiveDraft(false);
      }
    },
    []
  );

  useEffect(() => {
    setLiveValues(buildLiveDefaults(liveControls));
    discardPendingLiveBatch();
  }, [discardPendingLiveBatch, liveControls]);

  useEffect(() => {
    initialParamsRef.current = normalizedParams;
    const incomingNonce = getParamUpdateNonce(normalizedParams);
    const paramUpdateRequested = (normalizedParams as { paramUpdate?: unknown }).paramUpdate === true;
    const shouldPushParams =
      !controllerRef.current ||
      paramUpdateRequested ||
      (incomingNonce !== null && lastParamNonceRef.current === null);
    if (shouldPushParams) {
      currentParamsRef.current = normalizedParams;
      setPendingParams(normalizedParams);
      if (incomingNonce !== null && paramUpdateRequested) {
        lastParamNonceRef.current = incomingNonce;
      }
    } else {
      currentParamsRef.current = { ...currentParamsRef.current, ...normalizedParams };
    }
  }, [normalizedParams]);

  useEffect(() => {
    if (typeof normalizedAutoRotate !== 'boolean') {
      propAutoRotateRef.current = undefined;
      return;
    }
    const controller = controllerRef.current;
    if (
      propAutoRotateRef.current === normalizedAutoRotate &&
      controller?.getAutoRotate() === normalizedAutoRotate
    ) {
      return;
    }
    propAutoRotateRef.current = normalizedAutoRotate;
    setAutoRotateEnabled((prev) =>
      prev === normalizedAutoRotate ? prev : normalizedAutoRotate
    );
    if (controller && controller.getAutoRotate() !== normalizedAutoRotate) {
      try {
        controller.setAutoRotate(normalizedAutoRotate);
      } catch (err) {
        console.error('[PotFoundry][WebGPU] failed syncing auto-rotate prop', err);
      }
    }
  }, [normalizedAutoRotate]);

  useEffect(() => {
    heightRef.current = args.height_px;
    // Avoid calling Streamlit.setFrameHeight directly before the component
    // has been registered; use the component-ready gate which will call
    // setFrameHeight when it opens.
    if (readyGateOpenRef.current) {
      Streamlit.setFrameHeight(args.height_px);
    }
  }, [args.height_px]);

  const flushPendingRecords = useCallback(() => {
    if (!readyGateOpenRef.current || pendingRecordsRef.current.length === 0) {
      return;
    }
    const queued = pendingRecordsRef.current.slice();
    pendingRecordsRef.current = [];
    if (queued.length === 0) return;
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      try {
        console.debug('[WebGPU] flushPendingRecords queued=%d', queued.length);
      } catch (err) {
        /* ignore */
      }
    }
    // Reduce multiple queued records into the *last* record per type so we
    // avoid sending a flood of historical events to Streamlit on flush.
    const reduced: Record<string, StreamlitEventRecord> = {};
    for (const entry of queued) {
      if (!entry || !entry.type) continue;
      reduced[entry.type] = entry;
    }
    const nowTs = Date.now();
    for (const key of Object.keys(reduced)) {
      const entry = reduced[key];
      const json = (() => {
        try {
          return JSON.stringify(entry);
        } catch (err) {
          return String(entry);
        }
      })();
      // Dedupe identical payloads
      if (lastEmitJsonRef.current && lastEmitJsonRef.current === json) {
        const delta = nowTs - (lastEmitTsRef.current || 0);
        if (delta < EMIT_DEDUP_MS) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            try {
              console.debug('[WebGPU] flush dedupe skip', { type: key, delta });
            } catch (err) {
              /* ignore */
            }
          }
          continue;
        }
      }
      // Rate-limit: if we're in the cooldown window, requeue and schedule
      // another flush to avoid immediate bursts.
      const cooldownDelta = nowTs - (lastEmitTsRef.current || 0);
      if (cooldownDelta < EMIT_COOLDOWN_MS) {
        pendingRecordsRef.current.push(entry);
        if (pendingFlushTimerRef.current === null) {
          pendingFlushTimerRef.current = window.setTimeout(() => {
            pendingFlushTimerRef.current = null;
            try {
              flushPendingRecords();
            } catch (err) {
              console.error('[PotFoundry][WebGPU] pending flush error', err);
            }
          }, EMIT_COOLDOWN_MS - cooldownDelta);
        }
        continue;
      }
      try {
        const sendViaPost = !debugRef.current && (entry.type === 'cameraState' || entry.type === 'diagnostic');
        if (sendViaPost) {
          // Send high-frequency messages via a non-Streamlit postMessage
          // wrapper so Streamlit's ComponentRegistry doesn't attempt to
          // interpret them as component messages (which leads to console
          // spam). This uses a custom field to distinguish our messages.
          if (typeof window !== 'undefined' && window.parent) {
            try {
              // Avoid using the bare `type` field to prevent Streamlit's host
              // from interpreting our messages as component back messages.
              window.parent.postMessage({ pfInternalMessage: true, pfEvent: entry.type, pfPayload: entry.payload, pfSeq: entry.seq }, '*');
            } catch (err) {
              // If posting fails, quietly drop the diagnostic to avoid
              // spamming the host with unrecognized component messages.
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                try {
                  console.debug('[WebGPU] postMessage failed, dropped', { type: entry.type, seq: entry.seq, err });
                } catch (ignore) {
                  /* ignore */
                }
              }
            }
          }
        } else {
          Streamlit.setComponentValue(entry);
        }
        lastEmitJsonRef.current = json;
        lastEmitTsRef.current = Date.now();
      } catch (err) {
        console.error('[PotFoundry][WebGPU] queued emit failed', err);
      }
    }
  }, []);

  // Defer announcing readiness to the Streamlit host and gate outgoing
  // messages. Many environments register component instances slightly
  // after the iframe initializes; sending the componentReady message too
  // early causes the host to log "Received component message for
  // unregistered ComponentInstance". We schedule a short delay before
  // calling `Streamlit.setComponentReady()` and only then flush pending
  // messages. The delay balances responsiveness with avoiding spam.
  const ensureComponentReady = useCallback(() => {
    // If we've already scheduled readiness, just update frame height and
    // return; the gate will open when the timer fires.
    if (!readySentRef.current) {
      readySentRef.current = true;
      readyGateOpenRef.current = false;
      if (readyGateTimerRef.current !== null) {
        window.clearTimeout(readyGateTimerRef.current);
      }
      // Use a slightly larger gate to ensure the parent has time to
      // register the ComponentInstance. 800ms is a safer, conservative
      // delay and reduces races observed in practice that cause spammy
      // "unregistered ComponentInstance" messages.
      readyGateTimerRef.current = window.setTimeout(() => {
        readyGateTimerRef.current = null;
        try {
          Streamlit.setComponentReady();
        } catch (err) {
          console.warn('[PotFoundry][WebGPU] setComponentReady failed', err);
        }
        readyGateOpenRef.current = true;
        flushPendingRecords();
      }, 800);
    } else if (readyGateOpenRef.current) {
      // Already open — nothing to do but refresh frame height.
      flushPendingRecords();
    }
    Streamlit.setFrameHeight(heightRef.current);
  }, [flushPendingRecords]);

  useEffect(() => {
    return () => {
      if (readyGateTimerRef.current !== null) {
        window.clearTimeout(readyGateTimerRef.current);
        readyGateTimerRef.current = null;
      }
      pendingRecordsRef.current = [];
      readyGateOpenRef.current = false;
      if (pendingFlushTimerRef.current !== null) {
        window.clearTimeout(pendingFlushTimerRef.current);
        pendingFlushTimerRef.current = null;
      }
    };
  }, []);

  const deliverRecord = useCallback(
    (data: StreamlitEventRecord) => {
      if (!mountedRef.current) {
        return;
      }
      ensureComponentReady();
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        try {
          console.debug('[WebGPU] deliverRecord', { recordType: data.type, seq: data.seq, payloadSize: data.payload ? Object.keys(data.payload).length : 0 });
        } catch (err) {
          /* ignore */
        }
      }
      if (!readyGateOpenRef.current) {
        pendingRecordsRef.current.push(data);
        return;
      }
      // Client-side dedupe and throttle: avoid repeatedly sending identical
      // JSON payloads in short bursts. This reduces load on the host and
      // mitigates server-side rerun cascades.
      const nowTs = Date.now();
      const lastJson = lastEmitJsonRef.current;
      const thisJson = (() => {
        try {
          return JSON.stringify(data);
        } catch (err) {
          return String(data);
        }
      })();
      if (lastJson && lastJson === thisJson) {
        // If we've already just emitted the same payload within the
        // dedupe window, suppress it.
        const delta = nowTs - (lastEmitTsRef.current || 0);
        if (delta < EMIT_DEDUP_MS) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            try {
              console.debug('[WebGPU] dedupe skip', { type: data.type, seq: data.seq, delta });
            } catch (err) {
              /* ignore */
            }
          }
          return;
        }
      }
      // Rate-limit bursts: if we're in a short cooldown window, queue the
      // record instead of sending it immediately. The flush will ensure
      // it is eventually delivered.
      const cooldownDelta = nowTs - (lastEmitTsRef.current || 0);
      if (cooldownDelta < EMIT_COOLDOWN_MS) {
        pendingRecordsRef.current.push(data);
        if (pendingFlushTimerRef.current === null) {
          pendingFlushTimerRef.current = window.setTimeout(() => {
            pendingFlushTimerRef.current = null;
            try {
              flushPendingRecords();
            } catch (err) {
              console.error('[PotFoundry][WebGPU] pending flush error', err);
            }
          }, EMIT_COOLDOWN_MS);
        }
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          try {
            console.debug('[WebGPU] queued due to cooldown', { type: data.type, seq: data.seq, pending: pendingRecordsRef.current.length });
          } catch (err) {
            /* ignore */
          }
        }
        return;
      }
      try {
        const sendViaPost = !debugRef.current && (data.type === 'cameraState' || data.type === 'diagnostic');
        if (sendViaPost) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            try {
              console.debug('[WebGPU] send via postMessage', { type: data.type, seq: data.seq });
            } catch (err) {/* ignore */}
          }
            try {
              window.parent.postMessage({ pfInternalMessage: true, pfEvent: data.type, pfPayload: data.payload, pfSeq: data.seq }, '*');
            } catch (err) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                try { console.debug('[WebGPU] postMessage failed (deliver), dropped', { type: data.type, seq: data.seq, err }); } catch (ignore) {}
              }
            }
        } else {
          Streamlit.setComponentValue(data);
        }
        lastEmitJsonRef.current = thisJson;
        lastEmitTsRef.current = nowTs;
      } catch (err) {
        console.error('[PotFoundry][WebGPU] emit failed', err);
      }
    },
    [ensureComponentReady]
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextHeight = Math.ceil(entry.contentRect.height);
      if (Number.isFinite(nextHeight) && nextHeight > 0) {
        heightRef.current = nextHeight;
        if (readyGateOpenRef.current) {
          Streamlit.setFrameHeight(nextHeight);
        }
      }
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const emitEvent = useCallback(
    (event: WebGPUEvent) => {
      eventSeqRef.current += 1;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const normalized =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? { canvasId, ...payload }
          : payload;
      const record = {
        type: event.type,
        payload: normalized,
        seq: eventSeqRef.current,
      };
      try {
        deliverRecord(record);
      } catch (err) {
        console.error('[PotFoundry][WebGPU] emit failed', err);
        const message = err instanceof Error ? err.message : String(err);
        const diagCanvasId = canvasId || 'wgpu-canvas';
        const diagnosticPayload: Record<string, unknown> & { canvasId: string } = {
          canvasId: diagCanvasId,
          message: 'WebGPU component emit failed',
          detail: { error: message, eventType: event.type },
          timestamp: Date.now(),
        };
        try {
          eventSeqRef.current += 1;
          deliverRecord({
            type: 'diagnostic',
            payload: diagnosticPayload,
            seq: eventSeqRef.current,
          });
        } catch (innerErr) {
          console.error('[PotFoundry][WebGPU] diagnostic emit failed', innerErr);
        }
        window.setTimeout(() => {
          try {
            deliverRecord(record);
          } catch (retryErr) {
            console.error('[PotFoundry][WebGPU] emit retry failed', retryErr);
          }
        }, 50);
      }
    },
    [canvasId, deliverRecord]
  );

  const emitLivePreviewBatch = useCallback(() => {
    if (!liveControls) {
      return;
    }
    const fieldIds = Object.keys(pendingLiveFieldsRef.current);
    if (!fieldIds.length) {
      return;
    }
    const fieldsPayload = fieldIds
      .map((id) => {
        const field = liveControls.fields.find((entry) => entry.id === id);
        if (!field) {
          return null;
        }
        return {
          id,
          sessionKey: field.sessionKey,
          value: pendingLiveFieldsRef.current[id],
        };
      })
      .filter((entry): entry is { id: string; sessionKey: string; value: number } => entry !== null);
    if (!fieldsPayload.length) {
      return;
    }
    emitEvent({
      type: 'paramBatchComplete',
      payload: {
        params: {},
        fields: fieldsPayload,
        timestamp: Date.now(),
        commit: false,
      },
    });
  }, [emitEvent, liveControls]);

  const scheduleLivePreviewEmit = useCallback(
    (options?: { immediate?: boolean }) => {
      if (options?.immediate) {
        if (previewFlushTimerRef.current !== null) {
          window.clearTimeout(previewFlushTimerRef.current);
          previewFlushTimerRef.current = null;
        }
        emitLivePreviewBatch();
        return;
      }
      if (previewFlushTimerRef.current !== null) {
        return;
      }
          previewFlushTimerRef.current = window.setTimeout(() => {
        previewFlushTimerRef.current = null;
        emitLivePreviewBatch();
      }, 80);
    },
    [emitLivePreviewBatch]
  );

  const applyParams = useCallback((payload: Record<string, unknown>) => {
    if (controllerRef.current) {
      controllerRef.current.updateParams(payload);
    } else {
      initialParamsRef.current = payload;
    }
  }, []);

  // Apply params immediately for live responsiveness (0ms debounce)
  useDebouncedMerge(pendingParams, 0, applyParams);

  useEffect(() => {
    return () => {
      discardPendingLiveBatch({ suppressState: true });
    };
  }, [discardPendingLiveBatch]);

  const emitPendingLiveBatch = useCallback(
    (options?: { commit?: boolean }) => {
      if (!liveControls) {
        discardPendingLiveBatch();
        return;
      }
      const fieldIds = Object.keys(pendingLiveFieldsRef.current);
      if (!fieldIds.length) {
        return;
      }
      const paramsPayload: Record<string, unknown> = { ...pendingLiveParamsRef.current };
      const fieldsPayload = fieldIds
        .map((id) => {
          const field = liveControls.fields.find((entry) => entry.id === id);
          if (!field) {
            return null;
          }
          return {
            id,
            sessionKey: field.sessionKey,
            value: pendingLiveFieldsRef.current[id],
          };
        })
        .filter((entry): entry is { id: string; sessionKey: string; value: number } => entry !== null);
      // Build a simple signature to deduplicate identical commit events and
      // a lightweight cooldown to prevent rapid bursts of commit requests.
      const now = Date.now();
      const commitFlag = Boolean(options?.commit);
      if (commitFlag) {
        const paramsSorted: Record<string, unknown> = {};
        const paramKeys = Object.keys(paramsPayload).sort();
        for (const k of paramKeys) {
          paramsSorted[k] = paramsPayload[k];
        }
        const fieldsSig = fieldsPayload
          .map((f) => ({ sessionKey: f.sessionKey, value: f.value }))
          .sort((a, b) => String(a.sessionKey).localeCompare(String(b.sessionKey)));
        const sigObj = { params: paramsSorted, fields: fieldsSig } as Record<string, unknown>;
        let sig = null;
        try {
          sig = JSON.stringify(sigObj);
        } catch (err) {
          // Fall back to naive signature if JSON serialization fails.
          sig = String(sigObj);
        }
        const lastSig = lastCommitSigRef.current;
        const lastTs = lastCommitTsRef.current || 0;
        if (sig === lastSig && now - lastTs < COMMIT_COOLDOWN_MS) {
          // Already emitted the same commit recently — skip to avoid duplicates.
          discardPendingLiveBatch();
          return;
        }
        lastCommitSigRef.current = sig;
        lastCommitTsRef.current = now;
      }
      discardPendingLiveBatch();
      emitEvent({
        type: 'paramBatchComplete',
        payload: {
          params: paramsPayload,
          fields: fieldsPayload,
          timestamp: Date.now(),
          commit: commitFlag,
        },
      });
    },
    [discardPendingLiveBatch, emitEvent, liveControls]
  );

  const handleLiveChange = useCallback(
    (field: LiveControlField, rawValue: number) => {
      if (!liveControls) {
        return;
      }
      const nextValue = Math.min(field.max, Math.max(field.min, rawValue));
      setLiveValues((prev) => ({ ...prev, [field.id]: nextValue }));

      const patch: Record<string, unknown> = {};
      if (typeof field.styleParamIndex === 'number') {
        const baseParams = currentParamsRef.current as Record<string, unknown> & { styleParams?: unknown };
        const existing = Array.isArray(baseParams.styleParams)
          ? [...(baseParams.styleParams as number[])]
          : new Array(STYLE_PARAM_CAPACITY).fill(0);
        const scaledStyleValue = nextValue * (field.styleParamScale ?? 1);
        existing[field.styleParamIndex] = scaledStyleValue;
        patch.styleParams = existing;
        currentParamsRef.current = { ...baseParams, styleParams: existing };
      } else if (field.paramKey) {
        const scaled = nextValue * (field.paramScale ?? 1);
        patch[field.paramKey] = scaled;
        currentParamsRef.current = { ...currentParamsRef.current, [field.paramKey]: scaled };
      }

      if (!Object.keys(patch).length) {
        return;
      }

      if (controllerRef.current) {
        controllerRef.current.updateParams(patch);
      } else {
        initialParamsRef.current = { ...initialParamsRef.current, ...patch };
        currentParamsRef.current = { ...currentParamsRef.current, ...patch };
      }
      pendingLiveParamsRef.current = { ...pendingLiveParamsRef.current, ...patch };
      pendingLiveFieldsRef.current[field.id] = nextValue;
      setHasLiveDraft((prev) => (prev ? prev : true));
      if (!livePointerActiveRef.current) {
        scheduleLivePreviewEmit();
      }
    },
    [liveControls, scheduleLivePreviewEmit]
  );

  const handleSliderPointerDown = useCallback(() => {
    livePointerActiveRef.current = true;
  }, []);

  const handleSliderPointerUp = useCallback(() => {
    livePointerActiveRef.current = false;
    scheduleLivePreviewEmit({ immediate: true });
  }, [scheduleLivePreviewEmit]);

  const handleCommitClick = useCallback(() => {
    emitPendingLiveBatch({ commit: true });
  }, [emitPendingLiveBatch]);
  useEffect(() => {
    return () => {
      if (previewFlushTimerRef.current !== null) {
        window.clearTimeout(previewFlushTimerRef.current);
      }
    };
  }, []);


  const emitRef = useRef(emitEvent);
  useEffect(() => {
    emitRef.current = emitEvent;
  }, [emitEvent]);

  const debugRef = useRef(debugMode);
  useEffect(() => {
    debugRef.current = debugMode;
  }, [debugMode]);

  const handleAutoRotateChange = useCallback((enabled: boolean) => {
    setAutoRotateEnabled(enabled);
  }, []);


  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) {
      ensureComponentReady();
      return;
    }

    mountedRef.current = true;

    const markComponentReady = (): void => {
      ensureComponentReady();
    };

    const mountRenderer = async (): Promise<void> => {
      try {
        const controller = await mount({
          canvas,
          canvasId,
          statusEl: statusRef.current ?? undefined,
          controlsEl: controlsRef.current ?? undefined,
          initialParams: initialParamsRef.current,
          emit: (event) => emitRef.current(event),
          debugMode: debugRef.current,
          onAutoRotateChange: handleAutoRotateChange,
        });
        if (cancelled) {
          controller?.dispose();
          return;
        }
        if (!controller) {
          emitEvent({
            type: 'diagnostic',
            payload: {
              message: 'WebGPU mount returned null, waiting for retry',
              detail: { reason: 'mount-null', canvasId },
              timestamp: Date.now(),
            },
          });
          markComponentReady();
          return;
        }
        controllerRef.current = controller;
        controller.updateParams(initialParamsRef.current);
        markComponentReady();
      } catch (err) {
        console.error('WebGPU mount failed', err);
        const message = err instanceof Error ? err.message : String(err);
        emitEvent({
          type: 'diagnostic',
          payload: {
            message: 'WebGPU mount promise rejected',
            detail: { error: message },
            timestamp: Date.now(),
            canvasId,
          },
        });
        markComponentReady();
      }
    };

    ensureComponentReady();
    void mountRenderer();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [canvasId, ensureComponentReady, handleAutoRotateChange]);

  const shellStyle: CSSProperties = useMemo(
    () => ({ height: args.height_px, background: args.background_color }),
    [args.height_px, args.background_color]
  );

  return (
    <div className="pf-wgpu-shell" ref={shellRef} style={shellStyle} data-canvas-id={canvasId}>
      <canvas
        ref={canvasRef}
        className="pf-wgpu-canvas"
        id={canvasId}
        data-testid="pf-wgpu-canvas"
        tabIndex={0}
        onFocus={() => {
          // Ensure keyboard events work when canvas is focused
        }}
        onClick={() => {
          // Focus canvas on click to enable keyboard controls (WASD, etc.)
          canvasRef.current?.focus();
        }}
        onPointerDown={() => {
          // Focus canvas on pointer interaction for keyboard controls
          canvasRef.current?.focus();
        }}
      />
      <div ref={statusRef} id="wgpu-status">
        {INITIAL_STATUS}
      </div>
      <div ref={controlsRef} id="wgpu-controls">
        <button type="button" data-wgpu-view="fit">
          Fit
        </button>
        <button type="button" data-wgpu-view="iso">
          Iso
        </button>
        <button type="button" data-wgpu-view="top">
          Top
        </button>
        <button type="button" data-wgpu-view="front">
          Front
        </button>
        <button type="button" data-wgpu-view="right">
          Right
        </button>
        <button type="button" data-wgpu-action="projection" aria-pressed="false" data-state="ortho">
          Ortho
        </button>
        <button type="button" data-wgpu-action="debug" aria-pressed="false" data-state="off">
          Debug
        </button>
        <button id="wgpu-toggle-grid" type="button" data-wgpu-action="grid" aria-pressed="true" data-state="on">
          Grid
        </button>
        <button id="wgpu-toggle-axis" type="button" data-wgpu-action="axis" aria-pressed="true" data-state="on">
          Axis
        </button>
          <button id="wgpu-toggle-arcball" type="button" data-wgpu-action="arcball" aria-pressed="false" data-state="off">Arc</button>
          <button id="wgpu-toggle-pivot" type="button" data-wgpu-action="pivot-auto" aria-pressed="true" data-state="on">Pivot</button>
        <button
          type="button"
          data-role="autorotate"
          data-state={autoRotateEnabled ? 'on' : 'off'}
          aria-pressed={autoRotateEnabled ? 'true' : 'false'}
        >
          {autoRotateEnabled ? 'Auto' : 'Manual'}
        </button>
      </div>
      <div id="wgpu-hint">Drag = orbit • Right-click/Shift drag = pan • Scroll = zoom • WASD = pan • Q/E = tilt</div>
      {liveControls ? (
        <div className="pf-wgpu-live-panel" data-live-controls="1">
          {liveControls.fields.length === 0 ? (
            <div className="pf-wgpu-live-empty">No live sliders available</div>
          ) : (
            (() => {
              let lastGroup: string | undefined;
              return liveControls.fields.map((field) => {
                const value = liveValues[field.id] ?? field.value ?? field.min;
                const formatted = field.step < 1 ? value.toFixed(2) : value.toFixed(0);
                const groupHeader = field.group && field.group !== lastGroup;
                lastGroup = field.group;
                return (
                  <React.Fragment key={field.id}>
                    {groupHeader ? (
                      <div className="pf-wgpu-live-group" data-live-group={field.group}>
                        {field.group}
                      </div>
                    ) : null}
                    <div className="pf-wgpu-live-slider">
                      <div className="pf-wgpu-live-label">
                        <span>{field.label}</span>
                        <span>{formatted}</span>
                      </div>
                      <input
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={value}
                        onChange={(event) => handleLiveChange(field, Number(event.target.value))}
                        onPointerDown={handleSliderPointerDown}
                        onMouseDown={handleSliderPointerDown}
                        onTouchStart={handleSliderPointerDown}
                        onPointerUp={handleSliderPointerUp}
                        onMouseUp={handleSliderPointerUp}
                        onTouchEnd={handleSliderPointerUp}
                        onPointerCancel={handleSliderPointerUp}
                      />
                    </div>
                  </React.Fragment>
                );
              });
            })()
          )}
          <div className="pf-wgpu-live-actions">
            <div
              className="pf-wgpu-live-status"
              data-pending={hasLiveDraft ? '1' : '0'}
            >
              {hasLiveDraft ? 'Pending changes ready to apply' : 'Adjust sliders, then apply'}
            </div>
            <button type="button" onClick={handleCommitClick} disabled={!hasLiveDraft}>
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default withStreamlitConnection(WebGPUComponentBase);
