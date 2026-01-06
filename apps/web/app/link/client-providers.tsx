"use client"
import Script from 'next/script'
import { PrivyProvider } from '@privy-io/react-auth'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  // Allow login methods to be configured via env. Default: email, sms, google (hide Apple until configured)
  const loginMethods = (process.env.NEXT_PUBLIC_PRIVY_LOGIN_METHODS || 'email,sms,google')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean) as any
  return (
    <>
      {/* Telegram WebApp SDK (if opened inside Telegram) */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      {/* Telegram Login Widget (optional, when not in Telegram) */}
      {process.env.NEXT_PUBLIC_TG_BOT_USERNAME ? (
        <Script
          id="telegram-login-widget"
          src="https://telegram.org/js/telegram-widget.js?22"
          strategy="afterInteractive"
          data-telegram-login={process.env.NEXT_PUBLIC_TG_BOT_USERNAME}
          data-size="large"
          data-request-access="write"
          data-userpic="false"
          data-radius="6"
        />
      ) : null}
      {appId ? (
        <PrivyProvider
          appId={appId}
          config={{
            appearance: { theme: 'dark' },
            embeddedWallets: {
              ethereum: { createOnLogin: 'users-without-wallets' },
            },
            loginMethods,
          }}
        >
          {children}
        </PrivyProvider>
      ) : (
        children
      )}
    </>
  )
}
