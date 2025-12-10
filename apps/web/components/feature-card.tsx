import type { ReactNode } from 'react'

type FeatureCardProps = {
  title: string
  description: string
  icon?: ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="transition duration-300 p-4 sm:p-0">
      {icon && (
        <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gradient-to-br from-teal to-lime p-[2px] shadow-glow">
          <div className="h-full w-full rounded-[10px] bg-[#111111] grid place-items-center">
            {icon}
          </div>
        </div>
      )}
      <h3 className="font-semibold text-lg sm:text-xl leading-tight">{title}</h3>
      <p className="text-muted mt-2 text-sm sm:text-base leading-relaxed">{description}</p>
    </div>
  )
}
