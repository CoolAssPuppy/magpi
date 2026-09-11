'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * What the last crumb should say when the route ends in a record id. The trail is built from the
 * path, which knows a uuid and not a name, so the page that loaded the record hands its title
 * over. Nothing registers a title and the crumb falls back to the kind of thing it is.
 */
export interface CrumbRecord {
  title: string;
  /** The document's source mark, or nothing for a record that has no icon of its own. */
  icon: ReactNode;
}

const CrumbTitleContext = createContext<{
  record: CrumbRecord | null;
  setRecord: (record: CrumbRecord | null) => void;
}>({ record: null, setRecord: () => {} });

export function CrumbTitleProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<CrumbRecord | null>(null);
  return (
    <CrumbTitleContext.Provider value={{ record, setRecord }}>
      {children}
    </CrumbTitleContext.Provider>
  );
}

export function useCrumbRecord(): CrumbRecord | null {
  return useContext(CrumbTitleContext).record;
}

/** Rendered by a detail page. Clears on the way out, so a stale name never outlives its page. */
export function CrumbTitle({ title, icon = null }: { title: string; icon?: ReactNode }) {
  const { setRecord } = useContext(CrumbTitleContext);

  useEffect(() => {
    setRecord({ title, icon });
    return () => setRecord(null);
    // The icon is a node built fresh each render, so the title is what identifies the record.
  }, [title, setRecord]);

  return null;
}
