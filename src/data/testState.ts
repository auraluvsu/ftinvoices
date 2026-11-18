import type { Dispatch, SetStateAction } from 'react';

/** A plain stand-in for useState, for testing code that takes state setters. */
export function testState<T>(initial: T): { get: () => T; set: Dispatch<SetStateAction<T>> } {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    },
  };
}
