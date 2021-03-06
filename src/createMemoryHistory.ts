import warning from 'tiny-warning'
import invariant from 'tiny-invariant'
import { loopAsync } from './AsyncUtils'
import {
  createPath,
  parsePath
} from './PathUtils'
import {
  createLocation as _createLocation,
  statesAreEqual,
  locationsAreEqual,
  defaultGetUserConfirmation
} from './LocationUtils'
import runTransitionHook from './runTransitionHook'
import Actions, {
  POP,
  PUSH,
  REPLACE
} from './Actions'
import type { Hook } from './runTransitionHook'
import type {
  Location,
  BaseLocation,
  GetUserConfirmation,
  LocationType,
  LocationTypeMap,
  HistoryOptions,
  History,
  Unlisten
} from './index'


export interface Memo {
  [propName: string]: unknown
}

function createStateStorage<IL extends Location>(entries: IL[]): Memo {
  return entries
    .filter(entry => entry.state)
    .reduce((memo, entry) => {
      memo[entry.key] = entry.state
      return memo
    }, {} as Memo)
}

export default function createMemoryHistory<LT extends LocationType>(
  options: HistoryOptions = { hashType: 'slash' }
): History<
  LocationTypeMap[LT]['Base'],
  LocationTypeMap[LT]['Intact']
>{
  const getUserConfirmation: GetUserConfirmation =
    options.getUserConfirmation || defaultGetUserConfirmation

  let currentLocation: Location
  let pendingLocation: Location | null
  let beforeHooks: Hook<any>[] = []
  let hooks: Hook<any>[] = []
  let allKeys: string[] = []

  function getCurrentIndex(): number {
    if (pendingLocation && pendingLocation.action === Actions.POP)
      return allKeys.indexOf(pendingLocation.key || '')

    if (currentLocation)
      return allKeys.indexOf(currentLocation.key || '')

    return -1
  }

  function updateLocation<IL extends Location>(
    nextLocation: IL,
    silence: boolean = false
  ): void {
    const currentIndex = getCurrentIndex()
    currentLocation = nextLocation

    if (currentLocation.action === PUSH) {
      allKeys = [ ...allKeys.slice(0, currentIndex + 1), currentLocation.key]
    } else if (currentLocation.action === REPLACE) {
      allKeys[currentIndex] = currentLocation.key
    }

    if (!silence) {
      hooks.forEach(hook => hook(currentLocation))
    }
  }

  function listenBefore<IL extends Location>(
    hook: Hook<IL>
  ): Unlisten {
    beforeHooks.push(hook)

    return () =>
    beforeHooks = beforeHooks.filter(item => item !== hook)
  }

  function listen<IL extends Location>(
    hook: Hook<IL>
  ): Unlisten {
    hooks.push(hook)

    return () =>
      hooks = hooks.filter(item => item !== hook)
  }

  function confirmTransitionTo<IL extends Location>(
    location: IL,
    callback: (ok: unknown) => void
  ): void {
    loopAsync(
      beforeHooks.length,
      (index, next, done) => {
        runTransitionHook(beforeHooks[index], location, (result) =>
          result != null ? done(result) : next()
        )
      },
      (message) => {
        if (getUserConfirmation && typeof message === 'string') {
          getUserConfirmation(message, (ok: boolean) => callback(ok !== false))
        } else {
          callback(message !== false)
        }
      }
    )
  }

  function transitionTo<IL extends Location>(
    nextLocation: IL,
    silence: boolean = false
  ): void {
    if (
      (currentLocation && locationsAreEqual(currentLocation, nextLocation)) ||
      (pendingLocation && locationsAreEqual(pendingLocation, nextLocation))
    ) {
      return // Nothing to do
    }
    pendingLocation = nextLocation

    confirmTransitionTo(nextLocation, (ok) => {
      if (pendingLocation !== nextLocation)
        return // Transition was interrupted during confirmation

      pendingLocation = null

      if (ok) {
        // Treat PUSH to same path like REPLACE to be consistent with browsers
        if (nextLocation.action === PUSH) {
          const prevPath = createPath(currentLocation)
          const nextPath = createPath(nextLocation)

          if (
            nextPath === prevPath
            && statesAreEqual(currentLocation.state, nextLocation.state)
          ) {
            nextLocation.action = REPLACE
          }
        }

        if (nextLocation.action === POP) {
          updateLocation(nextLocation, silence)
        } else if (nextLocation.action === PUSH) {
          if (pushLocation(nextLocation) !== false) {
            updateLocation(nextLocation, silence)
          }
        } else if (nextLocation.action === REPLACE) {
          if (replaceLocation(nextLocation) !== false) {
            updateLocation(nextLocation, silence)
          }
        }
      } else if (currentLocation && nextLocation.action === POP) {
        const prevIndex = allKeys.indexOf(currentLocation.key)
        const nextIndex = allKeys.indexOf(nextLocation.key)

        if (prevIndex !== -1 && nextIndex !== -1) {
          go(prevIndex - nextIndex) // Restore the URL
        }
      }
    })
  }

  function push<BL extends BaseLocation = BaseLocation>(
    input: BL | string,
    silence: boolean = false
  ): void {
    transitionTo(createLocation(input, PUSH), silence)
  }

  function replace<BL extends BaseLocation = BaseLocation>(
    input: BL | string,
    silence: boolean = false
  ): void {
    transitionTo(createLocation(input, REPLACE), silence)
  }

  function goBack(): void {
    go(-1)
  }

  function goForward(): void {
    go(1)
  }

  function createKey(): string {
    return Math.random().toString(36).substr(2, 6)
  }

  function createHref<BL extends BaseLocation = BaseLocation>(
    location: BL | string
  ): string {
    return createPath(location)
  }

  function createLocation<
    BL extends BaseLocation,
    IL extends Location
  >(
    input?: BL | string,
    action?: Actions,
    key: string = createKey()
  ): IL {
    return _createLocation(input, action, key)
  }

  function getCurrentLocation<IL extends Location = Location>(): IL {
    if (typeof entries[current] !== void 0) {
      const entry: Location = entries[current]
      const path: string = createPath(entry)

      let key: string = ''
      let state: unknown = void 0
      if (entry && entry.key) {
        key = entry.key
        state = readState(key)
      }
  
      const init: BaseLocation = parsePath(path)
  
      return _createLocation({ ...init, state }, void 0, key)
    } else {
      throw new Error('current location is not exist.')      
    }
  }

  function canGo(n: number): boolean {
    const index = current + n
    return index >= 0 && index < entries.length
  }

  function go(n: number): void {
    if (!n) return

    if (!canGo(n)) {
      warning(
        false,
        `Cannot go(${n}) there is not enough history when current is ${current} and entries length is ${entries.length}`
      )

      return
    }

    current += n
    const currentLocation = getCurrentLocation()

    // Change action to POP
    transitionTo({ ...currentLocation, action: POP })
  }

  function pushLocation<IL extends Location>(location: IL): boolean {
    current += 1
    if (current < entries.length) {
      entries.splice(current)
    }

    entries.push(location)
    saveState(location.key, location.state)

    return true
  }

  function replaceLocation<IL extends Location>(location: IL): boolean {
    entries[current] = location
    saveState(location.key, location.state)

    return true
  }

  let entriesBefore: (string | Location | BaseLocation)[]

  if (typeof options.entries === 'string') {
    entriesBefore = [options.entries]
  } else if (!Array.isArray(options.entries)) {
    entriesBefore = ['/']
  } else {
    entriesBefore = options.entries
  }

  let entries = entriesBefore.map(entry => _createLocation(entry))

  let current = options.current || entries.length - 1

  invariant(
    current >= 0 && current < entries.length,
    `Current index must be >= 0 and < ${entries.length}, was ${current}`,
  )

  const storage: Memo = createStateStorage(entries)

  function saveState(key: string, state: unknown): unknown {
    return storage[key] = state
  }

  function readState(key: string): unknown {
    return storage[key]
  }

  return {
    getCurrentLocation,
    listenBefore,
    listen,
    transitionTo,
    push,
    replace,
    go,
    goBack,
    goForward,
    createKey,
    createPath,
    createHref,
    createLocation
  }
}
