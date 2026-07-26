import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to postgres_changes on one or more tables and invoke `onChange`
 * (debounced) whenever any of them fires. Used by admin pages to auto-refresh.
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  opts: { debounceMs?: number; channelName?: string } = {},
) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const name = opts.channelName ?? `rt-${tables.join("-")}`;
    const debounceMs = opts.debounceMs ?? 400;
    let t: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => cb.current(), debounceMs);
    };
    const ch = supabase.channel(name);
    for (const table of tables) {
      (ch as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        fire,
      );
    }
    ch.subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("|")]);
}