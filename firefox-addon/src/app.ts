import { ADDON_NAME } from "./config"
import { handler } from "./handler"
import { register } from "./services/registration"
import { log } from "./logger"
import { Payload } from "./models/payload"
import { delay } from "./utils"
import browser from "webextension-polyfill"

let connected = false

browser.runtime.onStartup.addListener(() => {
  log(`[${ADDON_NAME}] onStartup event fired`)
  connectAndListen()
})

browser.runtime.onInstalled.addListener(() => {
  log(`[${ADDON_NAME}] onInstalled event fired`)
  connectAndListen()
})

connectAndListen()

function connectAndListen() {
  if (connected) return
  connected = true

  log(`Starting ${ADDON_NAME} add-on`)
  let port = browser.runtime.connectNative(ADDON_NAME)
  log(`[${ADDON_NAME}] Connected with native application`, port)
  register(port).then((registration) => {
    log(`[${ADDON_NAME}] sent registration : ${JSON.stringify(registration)}`)
    listen(port)
  })
}

function listen(port: browser.Runtime.Port) {
  port.onMessage.addListener(async (payload: Payload) => {
    log(
      `[${ADDON_NAME}] Got message from native application: ${JSON.stringify(payload)}`
    )

    const { payload: command } = payload

    try {
      await handler(port, command)
    } catch (error) {
      if (error instanceof Error) {
        log(
          `[${ADDON_NAME}] Error while handling message`,
          error.message,
          error.stack
        )
      } else {
        log(`[${ADDON_NAME}] Error while handling message`, error)
      }
      throw error
    }
  })

  port.onDisconnect.addListener(async (port) => {
    log(`[${ADDON_NAME}] Disconnected with native application`)
    const errorMessage =
      port.error?.message || browser.runtime.lastError?.message
    if (errorMessage) {
      log(`[${ADDON_NAME}] Error message`, errorMessage)
    } else {
      log(`[${ADDON_NAME}] Broken port ?`, port)
    }
    connected = false

    const delayMs = 1000
    log(`[${ADDON_NAME}] Waiting ${delayMs}ms before retry...`)
    await delay(delayMs)
    log(`[${ADDON_NAME}] Waited ${delayMs}ms...`)
    log(`[${ADDON_NAME}] Trying to reconnect to native application...`)
    connectAndListen()
  })
}
