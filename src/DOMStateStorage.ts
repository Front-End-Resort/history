import warning from 'tiny-warning'

const QuotaExceededErrors = [
  'QuotaExceededError',
  'QUOTA_EXCEEDED_ERR'
]

const SecurityErrors = [
  'SecurityError'
]

const KeyPrefix: string = '@@History/'

export function appendPrefix(key: string): string {
  return KeyPrefix + key
}

export function saveState(
  key: string,
  state: unknown
): void {
  if (!window.sessionStorage) {
    
    warning(
      false,
      '[history] Unable to save state; sessionStorage is not available'
    )

    return
  }

  try {
    if (state === null) {
      window.sessionStorage.removeItem(appendPrefix(key))
    } else {
      window.sessionStorage.setItem(appendPrefix(key), JSON.stringify(state))
    }
  } catch (ex) {
    let error: Error = ex
    if (SecurityErrors.includes(error.name)) {
      // Blocking cookies in Chrome/Firefox/Safari throws SecurityError on any
      // attempt to access window.sessionStorage.
      warning(
        false,
        '[history] Unable to save state; sessionStorage is not available due to security settings'
      )

      return
    }

    if (
      QuotaExceededErrors.includes(error.name)
      && window.sessionStorage.length === 0
    ) {
      // Safari "private mode" throws QuotaExceededError.
      warning(
        false,
        '[history] Unable to save state; sessionStorage is not available in Safari private mode'
      )

      return
    }

    throw error
  }
}

export function readState(key: string): unknown {
  let json: string | null = null

  try {
    json = window.sessionStorage.getItem(appendPrefix(key))
  } catch (ex) {
    let error: Error = ex

    if (SecurityErrors.includes(error.name)) {
      // Blocking cookies in Chrome/Firefox/Safari throws SecurityError on any
      // attempt to access window.sessionStorage.
      warning(
        false,
        '[history] Unable to read state; sessionStorage is not available due to security settings'
      )

      return void 0
    }
  }

  if (json) {
    try {
      return JSON.parse(json) as object
    } catch (err)  {
      let error: Error = err
      // Ignore invalid JSON.
    }
  }

  return void 0
}
