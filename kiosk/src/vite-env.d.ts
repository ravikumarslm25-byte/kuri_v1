/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Dev only: auto-register the kiosk with the local server on first run. */
  readonly VITE_PROVISION_KEY?: string
  readonly VITE_MACHINE_ID?: string
}
