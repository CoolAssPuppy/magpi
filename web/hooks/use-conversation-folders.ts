'use client';

import { useEffect, useState } from 'react';

import type { Tables } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/client';

export type ConversationFolder = Pick<Tables<'conversation_folders'>, 'id' | 'name' | 'color'>;

type FolderState = {
  readonly folders: readonly ConversationFolder[];
  readonly isLoading: boolean;
  readonly error: Error | null;
};

const NOTHING_READ_YET: FolderState = { folders: [], isLoading: true, error: null };

/** Reads a person's own folders in sidebar order. A raised reloadKey reads them again. */
export function useConversationFolders(reloadKey: number): FolderState {
  const [state, setState] = useState<FolderState>(NOTHING_READ_YET);

  useEffect(() => {
    let isActive = true;

    void createClient()
      .from('conversation_folders')
      .select('id, name, color')
      .order('position', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!isActive) return;
        setState({
          folders: data ?? [],
          isLoading: false,
          error: error ? new Error(error.message) : null,
        });
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  return state;
}
