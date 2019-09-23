import warning from "warning"
import invariant from "invariant"
import { createLocation, NativeLocation, DraftLocation } from "./LocationUtils"
import { createPath, parsePath } from "./PathUtils"
import createHistory, {
  HistoryOptions,
  NativeHistory,
  GetCurrentLocation,
  Go,
  PushLocation as BasePushLocation,
  ReplaceLocation as BaseReplaceLocation
} from "./createHistory"
import { POP } from "./Actions"
import { ReadState, SaveState } from "./DOMStateStorage"

export interface Memo {
  [propName: string]: object | null
}

export interface Entry {
  key: string,
  state: object | null
}

export interface MemoryOptions extends HistoryOptions {
  entries: any[]
  current: number
}

export interface CreateStateStorage {
  (entries: NativeLocation[]): Memo
}

export interface CanGo {
  (n: number): boolean
}

export interface PushLocation {
  (location: NativeLocation): void
}

export interface ReplaceLocation {
  (location: NativeLocation): void
}

export interface CreateMemoryHistory {
  (options: MemoryOptions): NativeHistory
}

const createStateStorage: CreateStateStorage = entries =>
  entries
    .filter(entry => entry.state)
    .reduce((memo, entry) => {
      memo[entry.key] = entry.state
      return memo
    }, {} as Memo)

const createMemoryHistory: CreateMemoryHistory = options => {

  const getCurrentLocation: GetCurrentLocation = () => {
    const entry: NativeLocation = entries[current]
    const path: string = createPath(entry)

    let key: string = ""
    let state: object | null = null
    if (entry && entry.key) {
      key = entry.key
      state = readState(key)
    }

    const init: DraftLocation = parsePath(path)

    return createLocation({ ...init, state }, key)
  }

  const canGo: CanGo = n => {
    const index = current + n
    return index >= 0 && index < entries.length
  }

  const go: Go = n => {
    if (!n) return

    if (!canGo(n)) {
      warning(
        false,
        "Cannot go(%s) there is not enough history when current is %s and entries length is %s",
        n,
        current,
        entries.length
      )

      return
    }

    current += n
    const currentLocation = getCurrentLocation()

    // Change action to POP
    history.transitionTo({ ...currentLocation, action: POP })
  }

  const pushLocation: PushLocation = location => {
    current += 1

    if (current < entries.length) entries.splice(current)

    entries.push(location)

    saveState(location.key, location.state)
  }

  const replaceLocation: ReplaceLocation = location => {
    entries[current] = location
    saveState(location.key, location.state)
  }

  const history: NativeHistory = createHistory({
    ...options,
    getCurrentLocation,
    pushLocation: pushLocation as BasePushLocation,
    replaceLocation: replaceLocation as BaseReplaceLocation,
    go
  })

  let { entries, current } = options

  if (typeof entries === "string") {
    entries = [entries]
  } else if (!Array.isArray(entries)) {
    entries = ["/"]
  }

  entries = entries.map(entry => createLocation(entry, ""))

  if (current == null) {
    current = entries.length - 1
  } else {
    invariant(
      current >= 0 && current < entries.length,
      "Current index must be >= 0 and < %s, was %s",
      entries.length,
      current
    )
  }

  const storage: Memo = createStateStorage(entries)

  const saveState: SaveState = (key, state) => (storage[key] = state)

  const readState: ReadState = key => storage[key]

  return history
}

export default createMemoryHistory