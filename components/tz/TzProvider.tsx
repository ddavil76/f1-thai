"use client";

import { useSyncExternalStore } from "react";

export type TzPref = "th" | "circuit";

const KEY = "f1-tz";
const listeners = new Set<() => void>();
let cache: TzPref | null = null;

function readStore(): TzPref {
  try {
    return localStorage.getItem(KEY) === "circuit" ? "circuit" : "th";
  } catch {
    return "th";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): TzPref {
  if (cache === null) cache = readStore();
  return cache;
}

const getServerSnapshot = (): TzPref => "th";

function setTzPref(p: TzPref) {
  cache = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* localStorage อาจถูกบล็อก */
  }
  listeners.forEach((l) => l());
}

export function useTz() {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { pref, setPref: setTzPref };
}
