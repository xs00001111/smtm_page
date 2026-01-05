"use client"
import Script from 'next/script'
import { PrivyProvider } from '@privy-io/react-auth'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
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
            loginMethods: ['email', 'sms', 'google', 'apple'],
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

