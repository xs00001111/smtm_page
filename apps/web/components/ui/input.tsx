import * as React from 'react'
import { twMerge } from 'tailwind-merge'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={twMerge(
        'flex h-10 w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
        className
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'

