import type { Dispatch, SetStateAction } from 'react';
import type { AppData } from '../appData';
import type { FiledQuarter } from '../types';
import * as db from '../lib/db';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface FiledActionDeps {
  clientId: string;
  setFiled: Dispatch<SetStateAction<FiledQuarter[]>>;
  notify: AppData['notify'];
}

/** Marking VAT quarters as filed (which locks their receipts) and undoing that. */
export function filedActions({ clientId, setFiled, notify }: FiledActionDeps): Pick<AppData, 'fileQuarter' | 'unfileQuarter'> {
  return {
    fileQuarter: async (period, boxes, label) => {
      try {
        const created = await db.fileQuarter(clientId, period, boxes);
        setFiled((prev) => [...prev.filter((f) => f.start !== created.start), created].sort((a, b) => a.start.localeCompare(b.start)));
        notify(`Marked ${label} as filed. Its receipts are now locked.`);
        return true;
      } catch (e) {
        notify(`Couldn’t mark as filed: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    unfileQuarter: async (filed, label) => {
      try {
        await db.unfileQuarter(filed.id);
        setFiled((prev) => prev.filter((f) => f.id !== filed.id));
        notify(`${label} is no longer marked as filed`);
        return true;
      } catch (e) {
        notify(`Couldn’t unfile: ${errMsg(e)}`, 'error');
        return false;
      }
    },
  };
}
